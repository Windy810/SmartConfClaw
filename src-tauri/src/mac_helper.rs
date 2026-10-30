//! Bridge to the bundled Swift capture helper (see `helper/CaptureHelper.swift`).
//!
//! The helper is compiled by `build.rs` on macOS and embedded into the app binary; on first use it
//! is written to `~/Library/Application Support/ScholarClaw/bin/`. On other platforms, or when the
//! Swift toolchain was missing at build time, every function reports "unavailable" and callers fall
//! back to display/region capture and ffmpeg device inputs (e.g. BlackHole).

use std::fs::File;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdout, Command, Stdio};
use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

/// Sample rate of the raw f32le mono stream produced by `system-audio`.
pub const SYSTEM_AUDIO_SAMPLE_RATE: u32 = 48_000;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowInfo {
    pub id: u32,
    #[serde(default)]
    pub pid: i64,
    #[serde(default)]
    pub app: String,
    #[serde(default)]
    pub bundle_id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default)]
    pub width: f64,
    #[serde(default)]
    pub height: f64,
    #[serde(default)]
    pub on_screen: bool,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HelperStatus {
    /// Helper binary exists and runs (window listing / window capture available).
    pub available: bool,
    /// Built-in system audio capture (ScreenCaptureKit, macOS 13+).
    pub system_audio: bool,
    /// Screen Recording permission already granted to the app.
    pub screen_recording: bool,
    pub os_version: String,
    pub detail: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProbeOutput {
    #[serde(default)]
    system_audio: bool,
    #[serde(default)]
    screen_recording: bool,
    #[serde(default)]
    os_version: String,
}

#[cfg(all(target_os = "macos", has_capture_helper))]
const HELPER_BYTES: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/scc-helper"));

#[cfg(all(target_os = "macos", has_capture_helper))]
fn install_helper() -> Result<PathBuf, String> {
    use std::fs;
    use std::os::unix::fs::PermissionsExt;

    // FNV-1a so a new build never reuses a stale extracted binary.
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in HELPER_BYTES {
        hash ^= u64::from(*b);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    let home = std::env::var("HOME").map_err(|_| "HOME is not set".to_string())?;
    let dir = PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join("ScholarClaw")
        .join("bin");
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create helper dir: {e}"))?;
    let path = dir.join(format!("scc-helper-{hash:016x}"));
    let up_to_date = fs::metadata(&path)
        .map(|m| m.len() == HELPER_BYTES.len() as u64)
        .unwrap_or(false);
    if !up_to_date {
        let tmp = dir.join(format!("scc-helper-{hash:016x}.tmp"));
        fs::write(&tmp, HELPER_BYTES).map_err(|e| format!("failed to write helper: {e}"))?;
        fs::set_permissions(&tmp, fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("failed to chmod helper: {e}"))?;
        fs::rename(&tmp, &path).map_err(|e| format!("failed to install helper: {e}"))?;
    }
    Ok(path)
}

#[cfg(not(all(target_os = "macos", has_capture_helper)))]
fn install_helper() -> Result<PathBuf, String> {
    Err(if cfg!(target_os = "macos") {
        "capture helper was not compiled (Swift toolchain missing at build time)".to_string()
    } else {
        "window capture and built-in system audio are only supported on macOS".to_string()
    })
}

fn helper_path() -> Result<PathBuf, String> {
    static PATH: OnceLock<Result<PathBuf, String>> = OnceLock::new();
    PATH.get_or_init(install_helper).clone()
}

fn run_helper_json<T: for<'de> Deserialize<'de>>(args: &[&str]) -> Result<T, String> {
    let path = helper_path()?;
    let output = Command::new(&path)
        .args(args)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("failed to run capture helper: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("capture helper failed: {}", stderr.trim()));
    }
    serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("capture helper returned invalid JSON: {e}"))
}

pub fn probe() -> HelperStatus {
    match run_helper_json::<ProbeOutput>(&["probe"]) {
        Ok(p) => HelperStatus {
            available: true,
            system_audio: p.system_audio,
            screen_recording: p.screen_recording,
            os_version: p.os_version,
            detail: String::new(),
        },
        Err(e) => HelperStatus {
            detail: e,
            ..HelperStatus::default()
        },
    }
}

/// Shows the macOS Screen Recording permission prompt (no-op if already granted).
pub fn request_screen_recording_permission() -> Result<bool, String> {
    #[derive(Deserialize)]
    struct Granted {
        granted: bool,
    }
    run_helper_json::<Granted>(&["request-permission"]).map(|g| g.granted)
}

/// Normal app windows (layer 0, not tiny), including windows on other Spaces.
pub fn list_windows() -> Result<Vec<WindowInfo>, String> {
    run_helper_json(&["list-windows"])
}

/// Starts streaming system audio. Returns the helper process and its stdout (raw f32le mono at
/// [`SYSTEM_AUDIO_SAMPLE_RATE`]) once the stream is confirmed running, or the helper's error
/// (e.g. missing Screen Recording permission) if it exits during startup.
pub fn spawn_system_audio(log_path: &Path) -> Result<(Child, ChildStdout), String> {
    let path = helper_path()?;
    let log = File::create(log_path).map_err(|e| format!("failed to create helper log: {e}"))?;
    let mut child = Command::new(&path)
        .arg("system-audio")
        .arg("--sample-rate")
        .arg(SYSTEM_AUDIO_SAMPLE_RATE.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::from(log))
        .spawn()
        .map_err(|e| format!("failed to start system audio helper: {e}"))?;

    // Permission failures surface within a few hundred ms; give startup a moment.
    let deadline = Instant::now() + Duration::from_millis(1200);
    while Instant::now() < deadline {
        if let Ok(Some(status)) = child.try_wait() {
            let detail = std::fs::read_to_string(log_path).unwrap_or_default();
            return Err(format!(
                "system audio helper exited ({status}): {}",
                detail.trim()
            ));
        }
        thread::sleep(Duration::from_millis(100));
    }
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "system audio helper has no stdout".to_string())?;
    Ok((child, stdout))
}

/// Screenshot of one window through ScreenCaptureKit (macOS 14+). Works while the window is
/// covered by others. `Ok(false)` means "not supported here" so callers can fall back.
pub fn capture_window(window_id: u32, out: &Path) -> Result<bool, String> {
    use std::sync::atomic::{AtomicBool, Ordering};
    static UNSUPPORTED: AtomicBool = AtomicBool::new(false);
    if UNSUPPORTED.load(Ordering::Relaxed) {
        return Ok(false);
    }
    let path = helper_path()?;
    let output = Command::new(&path)
        .arg("screenshot")
        .arg("--window-id")
        .arg(window_id.to_string())
        .arg("--out")
        .arg(out)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("failed to run capture helper: {e}"))?;
    match output.status.code() {
        Some(0) => Ok(true),
        Some(4) => {
            UNSUPPORTED.store(true, Ordering::Relaxed);
            Ok(false)
        }
        _ => Err(String::from_utf8_lossy(&output.stderr).trim().to_string()),
    }
}
