//! Slide-change detection for the frame sampler.
//!
//! The old sampler compared an 8×8 average hash with the last saved frame. That is too coarse for
//! slides (a new slide with the same template differs by a few bits → missed) and too sensitive to
//! video tiles, animations and half-finished transitions (→ duplicates). This detector instead:
//!
//! * compares 256×144 grayscale thumbnails block by block (16×9 blocks), so localized text
//!   changes register while uniform compression noise does not;
//! * learns "volatile" blocks (webcam tiles, playing video, clocks) that change in most samples and
//!   ignores them;
//! * waits until the picture is stable for one sample before saving, so transitions and builds
//!   are captured once in their final state (with a cap so continuously changing content is still
//!   sampled);
//! * skips frames that match one of the recently saved frames (flipping back and forth).

use std::collections::VecDeque;
use std::path::Path;

use image::imageops::{self, FilterType};

const SIG_W: usize = 256;
const SIG_H: usize = 144;
const BLOCK: usize = 16;
const BLOCKS_X: usize = SIG_W / BLOCK;
const BLOCKS_Y: usize = SIG_H / BLOCK;
const BLOCK_COUNT: usize = BLOCKS_X * BLOCKS_Y;

/// Per-pixel luma delta that counts as "changed" (above compression / scaling noise).
const PIXEL_DELTA: u8 = 18;
/// Changed pixels needed inside one 16×16 block for the block to count as changed.
const BLOCK_MIN_PIXELS: usize = 6;
/// Changed (non-volatile) blocks vs. the last saved frame that make a new frame.
const MIN_CHANGED_BLOCKS: usize = 2;
/// At most this many blocks may differ from the previous sample for the screen to be "stable".
const STABLE_MAX_BLOCKS: usize = 1;
/// Save anyway after this many consecutive changed-but-unstable samples.
const MAX_UNSTABLE_SAMPLES: u32 = 3;
const VOLATILITY_ALPHA: f32 = 0.2;
const VOLATILITY_THRESHOLD: f32 = 0.45;
const RECENT_SAVED: usize = 6;

#[derive(Clone)]
pub struct FrameSignature {
    luma: Vec<u8>,
}

impl FrameSignature {
    pub fn from_path(path: &Path) -> Result<Self, String> {
        let img = image::open(path).map_err(|e| format!("open image for signature: {e}"))?;
        let gray = img.to_luma8();
        let small = imageops::resize(&gray, SIG_W as u32, SIG_H as u32, FilterType::Triangle);
        Ok(Self {
            luma: small.into_raw(),
        })
    }

    #[cfg(test)]
    fn from_luma(luma: Vec<u8>) -> Self {
        assert_eq!(luma.len(), SIG_W * SIG_H);
        Self { luma }
    }
}

/// Which 16×16 blocks differ between two signatures. Rows above `ignore_top_px` are ignored
/// (macOS menu bar clock in whole-display capture).
fn changed_blocks(a: &FrameSignature, b: &FrameSignature, ignore_top_px: usize) -> Vec<bool> {
    let mut counts = vec![0usize; BLOCK_COUNT];
    for y in ignore_top_px.min(SIG_H)..SIG_H {
        let row = y * SIG_W;
        let block_row = (y / BLOCK) * BLOCKS_X;
        for x in 0..SIG_W {
            if a.luma[row + x].abs_diff(b.luma[row + x]) > PIXEL_DELTA {
                counts[block_row + x / BLOCK] += 1;
            }
        }
    }
    counts.into_iter().map(|c| c >= BLOCK_MIN_PIXELS).collect()
}

pub struct ChangeDetector {
    last_saved: FrameSignature,
    recent_saved: VecDeque<FrameSignature>,
    previous_sample: FrameSignature,
    volatility: Vec<f32>,
    unstable_samples: u32,
    ignore_top_px: usize,
}

impl ChangeDetector {
    /// `initial` is the frame already saved at session start. `ignore_top_fraction` masks a strip
    /// at the top of the picture (e.g. 0.04 for the menu bar when capturing a whole display).
    pub fn new(initial: FrameSignature, ignore_top_fraction: f32) -> Self {
        let ignore_top_px = ((SIG_H as f32) * ignore_top_fraction.clamp(0.0, 0.5)).round() as usize;
        let mut recent_saved = VecDeque::with_capacity(RECENT_SAVED);
        recent_saved.push_back(initial.clone());
        Self {
            last_saved: initial.clone(),
            recent_saved,
            previous_sample: initial,
            volatility: vec![0.0; BLOCK_COUNT],
            unstable_samples: 0,
            ignore_top_px,
        }
    }

    fn significant(&self, a: &FrameSignature, b: &FrameSignature) -> usize {
        changed_blocks(a, b, self.ignore_top_px)
            .into_iter()
            .zip(&self.volatility)
            .filter(|(changed, v)| *changed && **v < VOLATILITY_THRESHOLD)
            .count()
    }

    fn matches_recent(&self, sig: &FrameSignature) -> bool {
        self.recent_saved
            .iter()
            .any(|r| self.significant(r, sig) < MIN_CHANGED_BLOCKS)
    }

    /// Feed one sampled frame. Returns `true` when it should be saved as a new timeline frame.
    pub fn observe(&mut self, sig: FrameSignature) -> bool {
        let vs_previous = changed_blocks(&self.previous_sample, &sig, self.ignore_top_px);
        for (v, changed) in self.volatility.iter_mut().zip(&vs_previous) {
            *v = *v * (1.0 - VOLATILITY_ALPHA) + if *changed { VOLATILITY_ALPHA } else { 0.0 };
        }
        let unstable_blocks = vs_previous
            .iter()
            .zip(&self.volatility)
            .filter(|(changed, v)| **changed && **v < VOLATILITY_THRESHOLD)
            .count();
        let stable = unstable_blocks <= STABLE_MAX_BLOCKS;

        let differs = self.significant(&self.last_saved, &sig) >= MIN_CHANGED_BLOCKS;
        self.previous_sample = sig.clone();

        if !differs {
            self.unstable_samples = 0;
            return false;
        }
        self.unstable_samples += 1;
        if !stable && self.unstable_samples < MAX_UNSTABLE_SAMPLES {
            return false;
        }
        self.unstable_samples = 0;
        if self.matches_recent(&sig) {
            // Back on a slide we already have: don't store it again.
            self.last_saved = sig;
            return false;
        }
        self.remember(sig);
        true
    }

    /// For the final screenshot at stop: keep it only if it shows something new.
    pub fn is_new_content(&self, sig: &FrameSignature) -> bool {
        self.significant(&self.last_saved, sig) >= MIN_CHANGED_BLOCKS && !self.matches_recent(sig)
    }

    fn remember(&mut self, sig: FrameSignature) {
        if self.recent_saved.len() == RECENT_SAVED {
            self.recent_saved.pop_front();
        }
        self.recent_saved.push_back(sig.clone());
        self.last_saved = sig;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn blank(value: u8) -> Vec<u8> {
        vec![value; SIG_W * SIG_H]
    }

    /// Paint a rectangle in signature pixel coordinates.
    fn paint(mut luma: Vec<u8>, x0: usize, y0: usize, w: usize, h: usize, value: u8) -> Vec<u8> {
        for y in y0..(y0 + h).min(SIG_H) {
            for x in x0..(x0 + w).min(SIG_W) {
                luma[y * SIG_W + x] = value;
            }
        }
        luma
    }

    fn slide(text_row: usize) -> FrameSignature {
        // White slide with a dark "text line" whose position identifies the slide.
        FrameSignature::from_luma(paint(blank(240), 20, text_row, 200, 6, 30))
    }

    #[test]
    fn identical_frames_are_not_saved() {
        let mut d = ChangeDetector::new(slide(20), 0.0);
        for _ in 0..5 {
            assert!(!d.observe(slide(20)));
        }
    }

    #[test]
    fn small_noise_is_ignored() {
        let mut d = ChangeDetector::new(slide(20), 0.0);
        let mut noisy = slide(20).luma;
        for (i, p) in noisy.iter_mut().enumerate() {
            if i % 7 == 0 {
                *p = p.saturating_sub(10);
            }
        }
        assert!(!d.observe(FrameSignature::from_luma(noisy)));
    }

    #[test]
    fn new_slide_saved_once_after_it_settles() {
        let mut d = ChangeDetector::new(slide(20), 0.0);
        // First sample of the new slide: changed vs previous sample → not stable yet.
        assert!(!d.observe(slide(80)));
        // Same picture again → stable → saved.
        assert!(d.observe(slide(80)));
        // Further identical samples are not saved again.
        assert!(!d.observe(slide(80)));
        assert!(!d.observe(slide(80)));
    }

    #[test]
    fn continuously_changing_content_is_still_sampled() {
        let mut d = ChangeDetector::new(slide(10), 0.0);
        let mut saved = 0;
        for i in 0..6 {
            if d.observe(slide(30 + i * 15)) {
                saved += 1;
            }
        }
        assert!(saved >= 1, "never saved while content kept changing");
    }

    #[test]
    fn going_back_to_recent_slide_is_skipped() {
        let mut d = ChangeDetector::new(slide(20), 0.0);
        d.observe(slide(80));
        assert!(d.observe(slide(80)));
        d.observe(slide(20));
        assert!(
            !d.observe(slide(20)),
            "returned to the first slide: should not duplicate"
        );
    }

    #[test]
    fn volatile_video_tile_is_ignored() {
        let base = paint(blank(240), 20, 20, 120, 6, 30);
        let mut d = ChangeDetector::new(FrameSignature::from_luma(base.clone()), 0.0);
        let mut saved = 0;
        // A "webcam tile" in the corner that changes every sample.
        for i in 0..12 {
            let v = if i % 2 == 0 { 20 } else { 220 };
            let frame = paint(base.clone(), 200, 100, 48, 40, v);
            if d.observe(FrameSignature::from_luma(frame)) {
                saved += 1;
            }
        }
        assert!(saved <= 1, "video tile produced {saved} frames");
        // A real slide change elsewhere is still detected while the tile keeps moving.
        let changed = paint(base.clone(), 20, 70, 160, 8, 30);
        let mut detected = false;
        for i in 0..3 {
            let v = if i % 2 == 0 { 20 } else { 220 };
            let frame = paint(changed.clone(), 200, 100, 48, 40, v);
            detected |= d.observe(FrameSignature::from_luma(frame));
        }
        assert!(detected, "slide change next to a video tile was missed");
    }

    #[test]
    fn menu_bar_strip_is_ignored() {
        let mut d = ChangeDetector::new(slide(60), 0.05);
        let clock = paint(slide(60).luma, 200, 0, 50, 6, 0);
        assert!(!d.observe(FrameSignature::from_luma(clock.clone())));
        assert!(!d.observe(FrameSignature::from_luma(clock)));
    }

    #[test]
    fn final_frame_dedupe() {
        let d = ChangeDetector::new(slide(20), 0.0);
        assert!(!d.is_new_content(&slide(20)));
        assert!(d.is_new_content(&slide(100)));
    }
}
