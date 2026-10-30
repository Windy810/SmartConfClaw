//! Speech-to-text: provider calls, timestamped transcript segments, chunked transcription of a
//! finished recording, and the live transcriber that runs while capturing.
//!
//! Segment times are "wall" offsets in seconds since session start (same clock as
//! `frame_offsets.jsonl`), so transcript lines can be aligned with screenshots. Audio time is
//! converted to wall time using the pause intervals in `pauses.jsonl`.

use std::collections::{BTreeMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

/// Chunk length for transcribing a finished recording (keeps uploads small: OpenAI limits files
/// to 25 MB, and a 1 h recording is ~115 MB as 16 kHz WAV).
const OFFLINE_CHUNK_SEC: u32 = 30;
/// Segments quieter than this RMS (≈ −50 dBFS) are treated as silence and not sent to ASR.
const SILENCE_RMS: f32 = 0.003;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AsrConfig {
    pub provider: String,
    pub endpoint: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub language: String,
}

impl AsrConfig {
    pub fn validate(&self) -> Result<(), String> {
        if self.endpoint.trim().is_empty() {
            return Err("ASR endpoint is empty".to_string());
        }
        match self.provider.trim() {
            "whisper_cpp" => Ok(()),
            "openai_compatible" => {
                if self.api_key.trim().is_empty() {
                    return Err("ASR API key is empty for openai_compatible provider".to_string());
                }
                if self.model.trim().is_empty() {
                    return Err("ASR model is empty for openai_compatible provider".to_string());
                }
                Ok(())
            }
            other => Err(format!(
                "Unsupported ASR provider `{other}`. Use whisper_cpp or openai_compatible."
            )),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptSegment {
    pub index: u32,
    /// Seconds since session start (wall clock, pauses accounted for).
    pub start_sec: f64,
    pub end_sec: f64,
    pub text: String,
}

/// Sessions whose live transcriber has not finished yet (offline transcription must wait).
fn live_sessions() -> &'static Mutex<HashSet<String>> {
    static SET: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SET.get_or_init(|| Mutex::new(HashSet::new()))
}

pub fn is_live_transcribing(session_id: &str) -> bool {
    live_sessions()
        .lock()
        .map(|s| s.contains(session_id))
        .unwrap_or(false)
}

// ---------------------------------------------------------------------------------------------
// Provider calls
// ---------------------------------------------------------------------------------------------

fn parse_asr_body(body: &str, provider_label: &str) -> Result<String, String> {
    if body.trim().is_empty() {
        return Err(format!("{provider_label} response is empty"));
    }
    match serde_json::from_str::<Value>(body) {
        Ok(value) => {
            if let Some(msg) = value
                .get("error")
                .and_then(|e| e.get("message").or(Some(e)))
                .and_then(Value::as_str)
            {
                return Err(format!("{provider_label} error: {msg}"));
            }
            Ok(value
                .get("text")
                .and_then(Value::as_str)
                .map(str::to_string)
                .unwrap_or_else(|| body.to_string()))
        }
        Err(_) => Ok(body.to_string()),
    }
}

/// Transcribe one audio file. `prompt` (previous text) helps continuity across chunk boundaries.
pub fn transcribe_file(cfg: &AsrConfig, audio_path: &Path, prompt: &str) -> Result<String, String> {
    let mut command = Command::new("curl");
    command
        .arg("-sS")
        .arg("--max-time")
        .arg("300")
        .arg("-X")
        .arg("POST")
        .arg(cfg.endpoint.trim())
        .arg("-F")
        .arg(format!("file=@{}", audio_path.to_string_lossy()));
    // --form-string: values are literal (a transcript starting with '@' or '<' must not be
    // interpreted as a file reference by curl).
    let provider_label = match cfg.provider.trim() {
        "whisper_cpp" => {
            command
                .arg("--form-string")
                .arg("temperature=0.0")
                .arg("--form-string")
                .arg("response_format=json");
            "whisper.cpp"
        }
        "openai_compatible" => {
            command
                .arg("-H")
                .arg(format!("Authorization: Bearer {}", cfg.api_key.trim()))
                .arg("--form-string")
                .arg(format!("model={}", cfg.model.trim()))
                .arg("--form-string")
                .arg("response_format=json");
            "ASR API"
        }
        other => return Err(format!("Unsupported ASR provider `{other}`")),
    };
    if !cfg.language.trim().is_empty() {
        command
            .arg("--form-string")
            .arg(format!("language={}", cfg.language.trim()));
    }
    let prompt = tail_chars(prompt.trim(), 200);
    if !prompt.is_empty() {
        command.arg("--form-string").arg(format!("prompt={prompt}"));
    }

    let output = command
        .output()
        .map_err(|e| format!("failed to call {provider_label}: {e}"))?;
    if !output.status.success() {
        return Err(format!(
            "{provider_label} request failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    parse_asr_body(&String::from_utf8_lossy(&output.stdout), provider_label)
        .map(|t| t.trim().to_string())
}

fn tail_chars(s: &str, n: usize) -> String {
    let count = s.chars().count();
    s.chars().skip(count.saturating_sub(n)).collect()
}

/// Whisper models invent these on silence / noise; drop them.
fn is_hallucination(text: &str) -> bool {
    let t: String = text
        .chars()
        .filter(|c| !c.is_whitespace() && !c.is_ascii_punctuation() && !"。，！？、…".contains(*c))
        .collect::<String>()
        .to_lowercase();
    if t.is_empty() {
        return true;
    }
    const KNOWN: &[&str] = &[
        "thankyou",
        "thanksforwatching",
        "thankyouforwatching",
        "pleasesubscribe",
        "you",
        "谢谢观看",
        "谢谢大家",
        "字幕由amaraorg社区提供",
        "请不吝点赞订阅转发打赏支持明镜与点点栏目",
        "明镜与点点栏目",
    ];
    KNOWN.iter().any(|k| t == *k)
}

// ---------------------------------------------------------------------------------------------
// WAV helpers
// ---------------------------------------------------------------------------------------------

struct WavInfo {
    channels: u16,
    sample_rate: u32,
    bits: u16,
    data_offset: usize,
    data_len: usize,
}

fn parse_wav(bytes: &[u8]) -> Option<WavInfo> {
    if bytes.len() < 12 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return None;
    }
    let mut pos = 12;
    let mut fmt: Option<(u16, u32, u16)> = None;
    while pos + 8 <= bytes.len() {
        let id = &bytes[pos..pos + 4];
        let size = u32::from_le_bytes(bytes[pos + 4..pos + 8].try_into().ok()?) as usize;
        let body = pos + 8;
        if id == b"fmt " && body + 16 <= bytes.len() {
            let channels = u16::from_le_bytes(bytes[body + 2..body + 4].try_into().ok()?);
            let sample_rate = u32::from_le_bytes(bytes[body + 4..body + 8].try_into().ok()?);
            let bits = u16::from_le_bytes(bytes[body + 14..body + 16].try_into().ok()?);
            fmt = Some((channels, sample_rate, bits));
        } else if id == b"data" {
            let (channels, sample_rate, bits) = fmt?;
            let available = bytes.len() - body;
            // A recording that was interrupted may still have a 0 / placeholder size.
            let data_len = if size == 0 || size > available {
                available
            } else {
                size
            };
            return Some(WavInfo {
                channels,
                sample_rate,
                bits,
                data_offset: body,
                data_len,
            });
        }
        pos = body + size + (size & 1);
    }
    None
}

/// Returns (duration seconds, RMS in 0..1) for a 16-bit PCM WAV file.
fn wav_stats(path: &Path) -> Option<(f64, f32)> {
    let bytes = fs::read(path).ok()?;
    let info = parse_wav(&bytes)?;
    if info.bits != 16 || info.channels == 0 || info.sample_rate == 0 {
        return None;
    }
    let data = &bytes[info.data_offset..info.data_offset + info.data_len];
    let samples = data.len() / 2;
    if samples == 0 {
        return Some((0.0, 0.0));
    }
    let mut sum = 0f64;
    for chunk in data.chunks_exact(2) {
        let v = f64::from(i16::from_le_bytes([chunk[0], chunk[1]])) / 32768.0;
        sum += v * v;
    }
    let duration = samples as f64 / f64::from(info.channels) / f64::from(info.sample_rate);
    Some((duration, (sum / samples as f64).sqrt() as f32))
}

// ---------------------------------------------------------------------------------------------
// Pauses and segment files
// ---------------------------------------------------------------------------------------------

pub fn append_pause(dir: &Path, start_sec: f64, end_sec: f64) {
    let line = json!({ "startSec": start_sec, "endSec": end_sec });
    if let Ok(mut f) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("pauses.jsonl"))
    {
        let _ = writeln!(f, "{line}");
    }
}

pub fn read_pauses(dir: &Path) -> Vec<(f64, f64)> {
    let raw = fs::read_to_string(dir.join("pauses.jsonl")).unwrap_or_default();
    let mut pauses: Vec<(f64, f64)> = raw
        .lines()
        .filter_map(|l| serde_json::from_str::<Value>(l.trim()).ok())
        .filter_map(|v| Some((v.get("startSec")?.as_f64()?, v.get("endSec")?.as_f64()?)))
        .filter(|(s, e)| e > s)
        .collect();
    pauses.sort_by(|a, b| a.0.total_cmp(&b.0));
    pauses
}

/// Map recorded-audio seconds to wall seconds since session start (audio stops while paused).
pub fn audio_to_wall(audio_sec: f64, pauses: &[(f64, f64)]) -> f64 {
    let mut wall = audio_sec;
    for (start, end) in pauses {
        if *start <= wall {
            wall += end - start;
        } else {
            break;
        }
    }
    wall
}

fn segments_path(dir: &Path) -> PathBuf {
    dir.join("transcript_segments.jsonl")
}

pub fn read_segments(dir: &Path) -> Vec<TranscriptSegment> {
    let raw = fs::read_to_string(segments_path(dir)).unwrap_or_default();
    let mut by_index: BTreeMap<u32, TranscriptSegment> = BTreeMap::new();
    for line in raw.lines() {
        if let Ok(seg) = serde_json::from_str::<TranscriptSegment>(line.trim()) {
            by_index.insert(seg.index, seg);
        }
    }
    by_index.into_values().collect()
}

fn append_segment(dir: &Path, seg: &TranscriptSegment) {
    if let Ok(mut f) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(segments_path(dir))
    {
        let _ = writeln!(
            f,
            "{}",
            serde_json::to_string(seg).unwrap_or_else(|_| "{}".to_string())
        );
    }
}

fn write_segments(dir: &Path, segments: &[TranscriptSegment]) -> Result<(), String> {
    let mut body = String::new();
    for seg in segments {
        body.push_str(&serde_json::to_string(seg).unwrap_or_default());
        body.push('\n');
    }
    fs::write(segments_path(dir), body)
        .map_err(|e| format!("failed to write transcript_segments.jsonl: {e}"))
}

fn write_transcript_text(dir: &Path, segments: &[TranscriptSegment]) -> Result<PathBuf, String> {
    let text = segments
        .iter()
        .map(|s| s.text.trim())
        .filter(|t| !t.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    let path = dir.join("transcript.txt");
    fs::write(&path, text.as_bytes())
        .map_err(|e| format!("failed to write transcript.txt: {e}"))?;
    Ok(path)
}

// ---------------------------------------------------------------------------------------------
// Offline (after capture) transcription
// ---------------------------------------------------------------------------------------------

fn split_audio(audio: &Path, out_dir: &Path) -> Result<Vec<PathBuf>, String> {
    let _ = fs::remove_dir_all(out_dir);
    fs::create_dir_all(out_dir).map_err(|e| format!("failed to create chunk dir: {e}"))?;
    let status = Command::new("ffmpeg")
        .arg("-nostdin")
        .arg("-y")
        .arg("-loglevel")
        .arg("error")
        .arg("-i")
        .arg(audio)
        .arg("-ac")
        .arg("1")
        .arg("-ar")
        .arg("16000")
        .arg("-f")
        .arg("segment")
        .arg("-segment_time")
        .arg(OFFLINE_CHUNK_SEC.to_string())
        .arg("-reset_timestamps")
        .arg("1")
        .arg(out_dir.join("chunk-%05d.wav"))
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("failed to run ffmpeg to split audio: {e}"))?;
    if !status.status.success() {
        return Err(format!(
            "ffmpeg failed to split audio: {}",
            String::from_utf8_lossy(&status.stderr).trim()
        ));
    }
    let mut chunks: Vec<PathBuf> = fs::read_dir(out_dir)
        .map_err(|e| format!("failed to list chunks: {e}"))?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("wav"))
        .collect();
    chunks.sort();
    Ok(chunks)
}

/// Transcribe `audio.wav` of a finished session in ~30 s chunks, writing `transcript.txt` and
/// timestamped `transcript_segments.jsonl`. Emits `transcribe-progress` events.
pub fn transcribe_session(
    app: &AppHandle,
    session_id: &str,
    dir: &Path,
    cfg: &AsrConfig,
) -> Result<String, String> {
    cfg.validate()?;
    let audio = dir.join("audio.wav");
    let pauses = read_pauses(dir);

    let ffmpeg_ok = Command::new("ffmpeg")
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if !ffmpeg_ok {
        // Single request (old behaviour); no per-segment timestamps.
        let text = transcribe_file(cfg, &audio, "")?;
        let duration = wav_stats(&audio).map(|(d, _)| d).unwrap_or(0.0);
        let segments = vec![TranscriptSegment {
            index: 0,
            start_sec: 0.0,
            end_sec: audio_to_wall(duration, &pauses),
            text,
        }];
        write_segments(dir, &segments)?;
        let path = write_transcript_text(dir, &segments)?;
        return Ok(format!("Transcription done: {}", path.to_string_lossy()));
    }

    let chunk_dir = dir.join("asr-chunks");
    let chunks = split_audio(&audio, &chunk_dir)?;
    let total = chunks.len();
    let mut segments: Vec<TranscriptSegment> = Vec::new();
    let mut audio_cursor = 0.0f64;
    let mut prompt = String::new();
    let mut failures: Vec<String> = Vec::new();

    for (i, chunk) in chunks.iter().enumerate() {
        let _ = app.emit(
            "transcribe-progress",
            json!({ "sessionId": session_id, "done": i, "total": total }),
        );
        let (duration, rms) = wav_stats(chunk).unwrap_or((f64::from(OFFLINE_CHUNK_SEC), 1.0));
        let start = audio_cursor;
        audio_cursor += duration;
        if rms < SILENCE_RMS {
            continue;
        }
        let result =
            transcribe_file(cfg, chunk, &prompt).or_else(|_| transcribe_file(cfg, chunk, &prompt));
        match result {
            Ok(text) if !is_hallucination(&text) => {
                prompt = text.clone();
                segments.push(TranscriptSegment {
                    index: i as u32,
                    start_sec: audio_to_wall(start, &pauses),
                    end_sec: audio_to_wall(start + duration, &pauses),
                    text,
                });
            }
            Ok(_) => {}
            Err(e) => failures.push(format!("chunk {}: {e}", i + 1)),
        }
    }
    let _ = fs::remove_dir_all(&chunk_dir);
    let _ = app.emit(
        "transcribe-progress",
        json!({ "sessionId": session_id, "done": total, "total": total }),
    );

    if segments.is_empty() && !failures.is_empty() {
        return Err(format!("Transcription failed. {}", failures.join("; ")));
    }
    write_segments(dir, &segments)?;
    let path = write_transcript_text(dir, &segments)?;
    let mut msg = format!(
        "Transcription done ({} segments): {}",
        segments.len(),
        path.to_string_lossy()
    );
    if !failures.is_empty() {
        msg.push_str(&format!(
            ". {} chunk(s) failed: {}",
            failures.len(),
            failures.join("; ")
        ));
    }
    Ok(msg)
}

// ---------------------------------------------------------------------------------------------
// Live transcription while capturing
// ---------------------------------------------------------------------------------------------

/// Watches `<dir>/live/seg-NNNNN.wav` (written by ffmpeg's segment muxer during capture),
/// transcribes each finished segment and emits `live-transcript` events. When `audio_done` is
/// set (ffmpeg exited), drains the remaining segments, writes `transcript.txt` and emits
/// `live-transcript-finished`.
pub fn spawn_live_transcriber(
    app: AppHandle,
    session_id: String,
    dir: PathBuf,
    cfg: AsrConfig,
    audio_done: Arc<AtomicBool>,
) -> JoinHandle<()> {
    if let Ok(mut set) = live_sessions().lock() {
        set.insert(session_id.clone());
    }
    thread::spawn(move || {
        let live_dir = dir.join("live");
        let mut index: u32 = 0;
        let mut audio_cursor = 0.0f64;
        let mut prompt = String::new();
        let mut failed = 0u32;
        let mut last_error = String::new();

        loop {
            let done = audio_done.load(Ordering::SeqCst);
            let current = live_dir.join(format!("seg-{index:05}.wav"));
            let next = live_dir.join(format!("seg-{:05}.wav", index + 1));
            if current.exists() && (next.exists() || done) {
                let (duration, rms) = wav_stats(&current).unwrap_or((0.0, 0.0));
                let start = audio_cursor;
                audio_cursor += duration;
                let mut keep_file = false;
                if duration > 0.2 && rms >= SILENCE_RMS {
                    let result = transcribe_file(&cfg, &current, &prompt)
                        .or_else(|_| transcribe_file(&cfg, &current, &prompt));
                    match result {
                        Ok(text) if !is_hallucination(&text) => {
                            let pauses = read_pauses(&dir);
                            let seg = TranscriptSegment {
                                index,
                                start_sec: audio_to_wall(start, &pauses),
                                end_sec: audio_to_wall(start + duration, &pauses),
                                text: text.clone(),
                            };
                            append_segment(&dir, &seg);
                            prompt = text;
                            let _ = app.emit(
                                "live-transcript",
                                json!({ "sessionId": session_id, "segment": seg }),
                            );
                        }
                        Ok(_) => {}
                        Err(e) => {
                            failed += 1;
                            keep_file = true;
                            if e != last_error {
                                let _ = app.emit(
                                    "live-transcript-error",
                                    json!({ "sessionId": session_id, "error": e }),
                                );
                                last_error = e;
                            }
                        }
                    }
                }
                if !keep_file {
                    let _ = fs::remove_file(&current);
                }
                index += 1;
                continue;
            }
            if done && !current.exists() {
                break;
            }
            thread::sleep(Duration::from_millis(600));
        }

        let segments = read_segments(&dir);
        let mut transcript_path = String::new();
        if !segments.is_empty() {
            if let Ok(p) = write_transcript_text(&dir, &segments) {
                transcript_path = p.to_string_lossy().to_string();
            }
        }
        if failed == 0 {
            let _ = fs::remove_dir_all(&live_dir);
        }
        if let Ok(mut set) = live_sessions().lock() {
            set.remove(&session_id);
        }
        let _ = app.emit(
            "live-transcript-finished",
            json!({
                "sessionId": session_id,
                "segments": segments.len(),
                "failed": failed,
                "transcriptPath": transcript_path,
            }),
        );
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn audio_time_maps_across_pauses() {
        let pauses = vec![(10.0, 15.0), (30.0, 32.0)];
        assert_eq!(audio_to_wall(5.0, &pauses), 5.0);
        assert_eq!(audio_to_wall(12.0, &pauses), 17.0);
        assert_eq!(audio_to_wall(26.0, &pauses), 33.0);
    }

    #[test]
    fn hallucinations_are_detected() {
        assert!(is_hallucination(" Thank you. "));
        assert!(is_hallucination("谢谢观看！"));
        assert!(!is_hallucination(
            "Thank you for the question about attention heads."
        ));
    }

    #[test]
    fn stats_of_real_ffmpeg_segment() {
        // ffmpeg writes extra chunks (LIST/INFO) before `data`; skip when ffmpeg is unavailable.
        let dir = std::env::temp_dir().join(format!("scc-asr-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let tone = dir.join("tone.wav");
        let silence = dir.join("silence.wav");
        let ok = Command::new("ffmpeg")
            .args(["-nostdin", "-y", "-loglevel", "error", "-f", "lavfi", "-i"])
            .arg("sine=frequency=440:sample_rate=16000:duration=2")
            .args(["-ac", "1"])
            .arg(&tone)
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if !ok {
            return;
        }
        Command::new("ffmpeg")
            .args(["-nostdin", "-y", "-loglevel", "error", "-f", "lavfi", "-i"])
            .arg("anullsrc=r=16000:cl=mono")
            .args(["-t", "1"])
            .arg(&silence)
            .status()
            .unwrap();
        let (duration, rms) = wav_stats(&tone).expect("tone stats");
        assert!((duration - 2.0).abs() < 0.05, "duration {duration}");
        assert!(rms > SILENCE_RMS, "tone rms {rms}");
        let (_, rms) = wav_stats(&silence).expect("silence stats");
        assert!(rms < SILENCE_RMS);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn wav_header_parsing() {
        let mut wav = Vec::new();
        let samples: Vec<i16> = vec![0, 16384, -16384, 0];
        let data_len = (samples.len() * 2) as u32;
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36 + data_len).to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&16000u32.to_le_bytes());
        wav.extend_from_slice(&32000u32.to_le_bytes());
        wav.extend_from_slice(&2u16.to_le_bytes());
        wav.extend_from_slice(&16u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&data_len.to_le_bytes());
        for s in &samples {
            wav.extend_from_slice(&s.to_le_bytes());
        }
        let info = parse_wav(&wav).expect("parse");
        assert_eq!(info.sample_rate, 16000);
        assert_eq!(info.data_len, 8);
    }
}
