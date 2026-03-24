#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashSet;
use std::env;
use std::fs;
use std::fs::File;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use tauri::{AppHandle, Emitter, Manager};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

mod bot_endpoint;

struct ActiveCapture {
    id: String,
    dir: PathBuf,
    first_screenshot_path: PathBuf,
    audio_process: Option<Child>,
    frame_sampler_stop: Arc<AtomicBool>,
    frame_sampler_handle: Option<JoinHandle<()>>,
    /// When true, frame sampler sleeps and (on Unix) audio ffmpeg is SIGSTOP’d.
    pause_signal: Arc<AtomicBool>,
    region: Option<CaptureRegion>,
    /// 1-based index for `screencapture -D` (whole display). When set, region rects are ignored for capture.
    display_index: Option<u32>,
}

#[derive(Clone)]
struct CompletedCapture {
    id: String,
    dir: PathBuf,
    first_screenshot_path: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CapturePrerequisites {
    platform: String,
    ffmpeg_available: bool,
    notes: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AudioInputDevice {
    index: i32,
    label: String,
    ffmpeg_spec: String,
    /// True for virtual loopback drivers (e.g. BlackHole) used to capture system / app playback audio.
    is_loopback: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CaptureStartOptions {
    audio_input_specs: Vec<String>,
    sample_rate: Option<u32>,
    channels: Option<u8>,
    frame_interval_sec: Option<u64>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CaptureRegion {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CaptureDisplayInfo {
    /// 1-based index, matches `screencapture -D` and the picker in the UI.
    index: u32,
    label: String,
    width: u32,
    height: u32,
}


#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaptureMeta {
    frame_interval_sec: u64,
}

static ACTIVE_CAPTURE: OnceLock<Mutex<Option<ActiveCapture>>> = OnceLock::new();
static LAST_CAPTURE: OnceLock<Mutex<Option<CompletedCapture>>> = OnceLock::new();

fn active_capture_store() -> &'static Mutex<Option<ActiveCapture>> {
    ACTIVE_CAPTURE.get_or_init(|| Mutex::new(None))
}

fn last_capture_store() -> &'static Mutex<Option<CompletedCapture>> {
    LAST_CAPTURE.get_or_init(|| Mutex::new(None))
}

fn position_floating_window(app: &AppHandle, win: &tauri::WebviewWindow) {
    let Ok(Some(monitor)) = app.primary_monitor() else {
        return;
    };
    let size = monitor.size();
    let scale = monitor.scale_factor();
    let screen_w = size.width as f64 / scale;
    let float_w = 280.0;
    let margin_x = 14.0;
    let margin_y = 36.0;
    let x = (screen_w - float_w - margin_x).max(8.0);
    let _ = win.set_position(tauri::LogicalPosition::new(x, margin_y));
}

fn signal_audio_process(child: &mut Child, pause: bool) {
    #[cfg(unix)]
    {
        let pid = child.id();
        if pid == 0 {
            return;
        }
        unsafe {
            let sig = if pause {
                libc::SIGSTOP
            } else {
                libc::SIGCONT
            };
            let _ = libc::kill(pid as i32, sig);
        }
    }
    #[cfg(not(unix))]
    {
        let _ = (child, pause);
    }
}

#[tauri::command]
fn set_capture_paused(paused: bool) -> Result<(), String> {
    let mut store = active_capture_store()
        .lock()
        .map_err(|_| "failed to lock capture state".to_string())?;
    let cap = store
        .as_mut()
        .ok_or_else(|| "no active capture".to_string())?;
    cap.pause_signal.store(paused, Ordering::Relaxed);
    if let Some(ref mut child) = cap.audio_process {
        signal_audio_process(child, paused);
    }
    Ok(())
}

#[tauri::command]
fn get_capture_paused() -> Result<bool, String> {
    let store = active_capture_store()
        .lock()
        .map_err(|_| "failed to lock capture state".to_string())?;
    let cap = store
        .as_ref()
        .ok_or_else(|| "no active capture".to_string())?;
    Ok(cap.pause_signal.load(Ordering::Relaxed))
}

fn current_unix_timestamp() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|error| format!("failed to get timestamp: {error}"))
}

fn build_capture_dir(session_id: &str) -> Result<PathBuf, String> {
    let home = env::var("HOME").map_err(|_| "HOME is not set".to_string())?;
    let capture_dir = PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join("ScholarClaw")
        .join("captures")
        .join(session_id);
    fs::create_dir_all(&capture_dir)
        .map_err(|error| format!("failed to create capture directory: {error}"))?;
    Ok(capture_dir)
}

fn capture_screenshot(
    path: &PathBuf,
    region: Option<&CaptureRegion>,
    display_index: Option<u32>,
) -> Result<(), String> {
    let mut cmd = Command::new("screencapture");
    cmd.arg("-x");
    if let Some(d) = display_index {
        cmd.arg("-D").arg(d.to_string());
    } else if let Some(r) = region {
        cmd.arg("-R")
            .arg(format!("{},{},{},{}", r.x as i32, r.y as i32, r.width as i32, r.height as i32));
    }
    cmd.arg(path);
    let status = cmd
        .status()
        .map_err(|error| format!("failed to invoke screencapture: {error}"))?;
    if !status.success() {
        return Err("screencapture returned non-zero status".to_string());
    }
    Ok(())
}

fn hash_file(path: &PathBuf) -> Result<u64, String> {
    let bytes = fs::read(path).map_err(|error| format!("failed to read file for hashing: {error}"))?;
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    bytes.hash(&mut hasher);
    Ok(hasher.finish())
}

fn spawn_frame_sampler(
    dir: PathBuf,
    stop_signal: Arc<AtomicBool>,
    pause_signal: Arc<AtomicBool>,
    initial_hash: u64,
    region: Option<CaptureRegion>,
    display_index: Option<u32>,
    frame_interval_sec: u64,
) -> JoinHandle<()> {
    thread::spawn(move || {
        let mut frame_index: u32 = 1;
        let mut last_hash: u64 = initial_hash;

        loop {
            if stop_signal.load(Ordering::Relaxed) {
                break;
            }
            while pause_signal.load(Ordering::Relaxed) {
                thread::sleep(Duration::from_millis(120));
                if stop_signal.load(Ordering::Relaxed) {
                    break;
                }
            }
            if stop_signal.load(Ordering::Relaxed) {
                break;
            }

            thread::sleep(Duration::from_secs(frame_interval_sec.max(1)));
            if stop_signal.load(Ordering::Relaxed) {
                break;
            }

            let temp_path = dir.join("frame-tmp.png");
            if capture_screenshot(&temp_path, region.as_ref(), display_index).is_err() {
                let _ = fs::remove_file(&temp_path);
                continue;
            }

            let current_hash = match hash_file(&temp_path) {
                Ok(value) => value,
                Err(_) => {
                    let _ = fs::remove_file(&temp_path);
                    continue;
                }
            };

            if current_hash == last_hash {
                let _ = fs::remove_file(&temp_path);
                continue;
            }

            let target = dir.join(format!("frame-{frame_index:06}.png"));
            if fs::rename(&temp_path, &target).is_err() {
                let _ = fs::copy(&temp_path, &target);
                let _ = fs::remove_file(&temp_path);
            }

            last_hash = current_hash;
            frame_index += 1;
        }
    })
}

fn write_capture_meta(capture_dir: &PathBuf, frame_interval_sec: u64) {
    let meta = CaptureMeta {
        frame_interval_sec: frame_interval_sec.max(1),
    };
    if let Ok(raw) = serde_json::to_string_pretty(&meta) {
        let _ = fs::write(capture_dir.join("capture_meta.json"), raw);
    }
}

fn read_capture_interval(capture_dir: &PathBuf) -> u64 {
    let meta_path = capture_dir.join("capture_meta.json");
    if let Ok(raw) = fs::read_to_string(meta_path) {
        if let Ok(meta) = serde_json::from_str::<CaptureMeta>(&raw) {
            return meta.frame_interval_sec.max(1);
        }
    }
    2
}

fn ffmpeg_is_available() -> bool {
    Command::new("ffmpeg")
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

/// Parse `[0] Device name` on a line that may be prefixed with `[AVFoundation input device @ ...]`.
/// FFmpeg prints that prefix before the real `[index] label` — the first `[` is not the device index.
fn label_suggests_loopback_device(label: &str) -> bool {
    let l = label.to_lowercase();
    l.contains("blackhole")
        || l.contains("soundflower")
        || l.contains("vb-audio")
        || l.contains("virtual cable")
        || (l.contains("loopback") && !l.contains("microphone"))
}

fn parse_avfoundation_audio_device_line(line: &str) -> Option<(i32, String)> {
    let mut best: Option<(i32, String)> = None;
    let mut pos = 0usize;
    while let Some(rel_start) = line[pos..].find('[') {
        let start = pos + rel_start;
        if let Some(rel_end) = line.get(start + 1..).and_then(|s| s.find(']')) {
            let end = start + 1 + rel_end;
            let inner = line.get(start + 1..end).unwrap_or("").trim();
            if let Ok(idx) = inner.parse::<i32>() {
                let label = line.get(end + 1..).unwrap_or("").trim().to_string();
                if !label.is_empty() {
                    best = Some((idx, label));
                }
            }
            pos = end + 1;
        } else {
            break;
        }
    }
    best
}

fn list_avfoundation_audio_devices() -> Result<Vec<AudioInputDevice>, String> {
    if env::consts::OS != "macos" {
        return Err(
            "Audio device listing uses FFmpeg AVFoundation and is only available on macOS."
                .to_string(),
        );
    }
    if !ffmpeg_is_available() {
        return Err(
            "ffmpeg was not found in PATH. Install ffmpeg (e.g. `brew install ffmpeg`) and restart the app."
                .to_string(),
        );
    }

    let output = Command::new("ffmpeg")
        .arg("-hide_banner")
        .arg("-f")
        .arg("avfoundation")
        .arg("-list_devices")
        .arg("true")
        .arg("-i")
        .arg("")
        .output()
        .map_err(|error| format!("failed to list avfoundation devices: {error}"))?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let combined = format!("{stdout}\n{stderr}");

    #[derive(Clone, Copy, PartialEq, Eq)]
    enum Section {
        None,
        Video,
        Audio,
    }
    let mut section = Section::None;
    let mut devices: Vec<AudioInputDevice> = Vec::new();

    for line in combined.lines() {
        let lower = line.to_lowercase();
        if lower.contains("avfoundation") && lower.contains("video devices") {
            section = Section::Video;
            continue;
        }
        if lower.contains("avfoundation") && lower.contains("audio devices") {
            section = Section::Audio;
            continue;
        }
        if section != Section::Audio {
            continue;
        }

        if let Some((index, label)) = parse_avfoundation_audio_device_line(line) {
            let is_loopback = label_suggests_loopback_device(&label);
            devices.push(AudioInputDevice {
                index,
                label,
                ffmpeg_spec: format!("none:{index}"),
                is_loopback,
            });
        }
    }

    if devices.is_empty() {
        let lower = combined.to_lowercase();
        if lower.contains("permission") || lower.contains("denied") || lower.contains("not authorized") {
            return Err(
                "Microphone access was denied or unavailable. On macOS: System Settings › Privacy & Security › Microphone — enable access for this app (or Terminal if you run from `cargo tauri dev`)."
                    .to_string(),
            );
        }
        return Err(
            "Could not enumerate audio inputs: FFmpeg produced no AVFoundation audio device lines. Grant Microphone permission, update ffmpeg, or check that an input device exists."
                .to_string(),
        );
    }

    Ok(devices)
}

fn spawn_audio_capture(
    audio_path: &PathBuf,
    log_path: &PathBuf,
    audio_input_specs: &[String],
    sample_rate: u32,
    channels: u8,
) -> Result<Option<Child>, String> {
    if !ffmpeg_is_available() {
        return Ok(None);
    }

    let stderr_log = File::create(log_path).map_err(|error| format!("failed to create ffmpeg log file: {error}"))?;

    let mut command = Command::new("ffmpeg");
    command.arg("-y");

    let specs: Vec<String> = if audio_input_specs.is_empty() {
        vec!["none:0".to_string()]
    } else {
        audio_input_specs
            .iter()
            .map(|item| item.trim().to_string())
            .filter(|item| !item.is_empty())
            .collect()
    };

    let normalized_specs = if specs.is_empty() { vec!["none:0".to_string()] } else { specs };

    for spec in &normalized_specs {
        command.arg("-f").arg("avfoundation").arg("-i").arg(spec);
    }

    if normalized_specs.len() > 1 {
        let mut input_refs = String::new();
        for index in 0..normalized_specs.len() {
            input_refs.push_str(&format!("[{index}:a]"));
        }
        let filter = format!("{input_refs}amix=inputs={}:duration=longest:dropout_transition=2[aout]", normalized_specs.len());
        command.arg("-filter_complex").arg(filter);
        command.arg("-map").arg("[aout]");
    } else {
        command.arg("-map").arg("0:a");
    }

    let child = command
        .arg("-ac")
        .arg(channels.to_string())
        .arg("-ar")
        .arg(sample_rate.to_string())
        .arg(audio_path)
        .stdout(Stdio::null())
        .stderr(Stdio::from(stderr_log))
        .spawn()
        .map_err(|error| format!("failed to spawn ffmpeg audio capture: {error}"))?;

    Ok(Some(child))
}

fn to_displayable_image_src(path: &PathBuf) -> String {
    let bytes = match fs::read(path) {
        Ok(value) => value,
        Err(_) => return path.to_string_lossy().to_string(),
    };
    let encoded = BASE64_STANDARD.encode(bytes);
    format!("data:image/png;base64,{encoded}")
}

fn split_transcript_into_chunks(transcript: &str, chunk_count: usize) -> Vec<String> {
    if chunk_count == 0 {
        return vec![];
    }

    let cleaned = transcript.trim();
    if cleaned.is_empty() {
        return vec!["".to_string(); chunk_count];
    }

    let mut sentences: Vec<String> = cleaned
        .split(|c| c == '.' || c == '!' || c == '?' || c == '。' || c == '！' || c == '？' || c == '\n')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect();

    if sentences.is_empty() {
        sentences.push(cleaned.to_string());
    }

    let mut chunks = vec![String::new(); chunk_count];
    if sentences.len() <= chunk_count {
        for (i, sentence) in sentences.into_iter().enumerate() {
            chunks[i] = sentence;
        }
        return chunks;
    }

    let per_chunk = ((sentences.len() as f64) / (chunk_count as f64)).ceil() as usize;
    for i in 0..chunk_count {
        let start = i * per_chunk;
        if start >= sentences.len() {
            break;
        }
        let end = ((i + 1) * per_chunk).min(sentences.len());
        chunks[i] = sentences[start..end].join(" ");
    }
    chunks
}

fn build_timeline_from_dir(capture_dir: &PathBuf) -> Vec<Value> {
    let transcript_path = capture_dir.join("transcript.txt");
    let transcript = fs::read_to_string(&transcript_path)
        .unwrap_or_else(|_| "Audio transcription is pending integration. Capture files are generated locally.".to_string());

    let mut items: Vec<(String, PathBuf)> = Vec::new();

    let start_path = capture_dir.join("screen-start.png");
    if start_path.exists() {
        items.push(("000000".to_string(), start_path));
    }

    if let Ok(entries) = fs::read_dir(capture_dir) {
        let mut frame_paths: Vec<PathBuf> = entries
            .filter_map(|entry| entry.ok().map(|value| value.path()))
            .filter(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| name.starts_with("frame-") && name.ends_with(".png"))
                    .unwrap_or(false)
            })
            .collect();
        frame_paths.sort();

        for frame_path in frame_paths {
            let key = frame_path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("999999")
                .to_string();
            items.push((key, frame_path));
        }
    }

    let stop_path = capture_dir.join("screen-stop.png");
    if stop_path.exists() {
        items.push(("999999".to_string(), stop_path));
    }

    items.sort_by(|a, b| a.0.cmp(&b.0));
    let frame_interval_sec = read_capture_interval(capture_dir);
    let transcript_chunks = split_transcript_into_chunks(&transcript, items.len());

    items
        .iter()
        .enumerate()
        .map(|(index, (_, path))| {
            let chunk = transcript_chunks
                .get(index)
                .map(|v| v.trim().to_string())
                .unwrap_or_default();
            let summary = if chunk.is_empty() {
                "No transcript mapped to this frame.".to_string()
            } else {
                let mut s: String = chunk.chars().take(120).collect();
                if chunk.chars().count() > 120 {
                    s.push_str("...");
                }
                s
            };
            json!({
              "id": format!("tl-rs-live-{index:03}"),
              "timestamp": (index as i64) * (frame_interval_sec as i64),
              "pptScreenshotPath": to_displayable_image_src(path),
              "originalTranscript": chunk,
              "summary": summary,
              "annotations": [
                { "term": "Frame Deduplication", "definition": "If current frame hash equals previous frame hash, the frame is ignored." },
                { "term": "Sampling Interval", "definition": format!("Screenshots are sampled every {} seconds while capture is running.", frame_interval_sec) }
              ]
            })
        })
        .collect()
}

fn captures_root_dir() -> Option<PathBuf> {
    let home = env::var("HOME").ok()?;
    Some(
        PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("ScholarClaw")
            .join("captures"),
    )
}

fn resolve_capture_dir_for_id(id: &str) -> Option<PathBuf> {
    if let Ok(store) = active_capture_store().lock() {
        if let Some(active) = store.as_ref() {
            if active.id == id {
                return Some(active.dir.clone());
            }
        }
    }

    if let Ok(store) = last_capture_store().lock() {
        if let Some(last) = store.as_ref() {
            if last.id == id {
                return Some(last.dir.clone());
            }
        }
    }

    let dir = captures_root_dir()?.join(id);
    if dir.is_dir() {
        Some(dir)
    } else {
        None
    }
}

fn is_capture_running(id: &str) -> bool {
    if let Ok(store) = active_capture_store().lock() {
        if let Some(active) = store.as_ref() {
            return active.id == id;
        }
    }
    false
}

fn tail_lines(content: &str, max_lines: usize) -> String {
    let lines: Vec<&str> = content.lines().collect();
    let start = lines.len().saturating_sub(max_lines);
    lines[start..].join("\n")
}

fn call_whisper_cpp(whisper_endpoint: &str, audio_path: &PathBuf, language: &str) -> Result<String, String> {
    let mut command = Command::new("curl");
    command
        .arg("-sS")
        .arg("-X")
        .arg("POST")
        .arg(whisper_endpoint)
        .arg("-F")
        .arg(format!("file=@{}", audio_path.to_string_lossy()))
        .arg("-F")
        .arg("temperature=0.0")
        .arg("-F")
        .arg("response-format=json");
    if !language.trim().is_empty() {
        command.arg("-F").arg(format!("language={}", language.trim()));
    }

    let output = command
        .output()
        .map_err(|error| format!("failed to call whisper.cpp endpoint: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("whisper.cpp request failed: {stderr}"));
    }

    let body = String::from_utf8_lossy(&output.stdout).to_string();
    if body.trim().is_empty() {
        return Err("whisper.cpp response is empty".to_string());
    }

    let parsed: Result<Value, _> = serde_json::from_str(&body);
    match parsed {
        Ok(value) => {
            if let Some(text) = value.get("text").and_then(Value::as_str) {
                Ok(text.to_string())
            } else {
                Ok(body)
            }
        }
        Err(_) => Ok(body),
    }
}

fn call_openai_compatible_asr(
    endpoint: &str,
    api_key: &str,
    model: &str,
    audio_path: &PathBuf,
    language: &str,
) -> Result<String, String> {
    let mut command = Command::new("curl");
    command
        .arg("-sS")
        .arg("-X")
        .arg("POST")
        .arg(endpoint)
        .arg("-H")
        .arg(format!("Authorization: Bearer {}", api_key))
        .arg("-F")
        .arg(format!("file=@{}", audio_path.to_string_lossy()))
        .arg("-F")
        .arg(format!("model={model}"));

    if !language.trim().is_empty() {
        command.arg("-F").arg(format!("language={}", language.trim()));
    }

    let output = command
        .output()
        .map_err(|error| format!("failed to call OpenAI-compatible ASR endpoint: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("OpenAI-compatible ASR request failed: {stderr}"));
    }

    let body = String::from_utf8_lossy(&output.stdout).to_string();
    if body.trim().is_empty() {
        return Err("OpenAI-compatible ASR response is empty".to_string());
    }

    let parsed: Result<Value, _> = serde_json::from_str(&body);
    match parsed {
        Ok(value) => {
            if let Some(error_message) = value
                .get("error")
                .and_then(|error| error.get("message"))
                .and_then(Value::as_str)
            {
                return Err(format!("ASR API error: {error_message}"));
            }
            if let Some(text) = value.get("text").and_then(Value::as_str) {
                Ok(text.to_string())
            } else {
                Ok(body)
            }
        }
        Err(_) => Ok(body),
    }
}

fn extract_json_block(content: &str) -> String {
    let trimmed = content.trim();
    if trimmed.starts_with("```") {
        let without_ticks = trimmed
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim();
        return without_ticks.to_string();
    }

    trimmed.to_string()
}

fn collect_analysis_images(capture_dir: &PathBuf, max_images: usize) -> Vec<String> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    let start = capture_dir.join("screen-start.png");
    if start.exists() {
        candidates.push(start);
    }
    if let Ok(entries) = fs::read_dir(capture_dir) {
        let mut frame_paths: Vec<PathBuf> = entries
            .filter_map(|entry| entry.ok().map(|value| value.path()))
            .filter(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .map(|name| name.starts_with("frame-") && name.ends_with(".png"))
                    .unwrap_or(false)
            })
            .collect();
        frame_paths.sort();
        candidates.extend(frame_paths);
    }
    let stop = capture_dir.join("screen-stop.png");
    if stop.exists() {
        candidates.push(stop);
    }

    if candidates.is_empty() || max_images == 0 {
        return vec![];
    }

    let step = ((candidates.len() as f64) / (max_images as f64)).ceil() as usize;
    let step = step.max(1);
    candidates
        .into_iter()
        .step_by(step)
        .take(max_images)
        .map(|path| to_displayable_image_src(&path))
        .collect()
}

struct AnalysisOutput {
    summary: String,
    tags: Vec<String>,
    concepts: Vec<Value>,
    qa: Vec<Value>,
    graph_nodes: Vec<Value>,
    graph_edges: Vec<Value>,
    references: Vec<Value>,
    /// Domain mind map: theme keywords + thematic branches extending the research field.
    mind_map: Value,
}

fn call_openrouter_analysis_once(
    openrouter_api_key: &str,
    openrouter_model: &str,
    transcript: &str,
    image_data_urls: &[String],
) -> Result<AnalysisOutput, String> {
    let prompt = format!(
        "You are an ML/AI research assistant. Analyze the following meeting/lecture transcript and screenshots \
and output STRICT JSON with this exact shape:\n\
{{\n\
  \"summary\": \"<concise summary, max 200 words>\",\n\
  \"tags\": [\"<topic tag>\", ...],\n\
  \"concepts\": [\n\
    {{\"term\": \"<technical term>\", \"definition\": \"<1-2 sentence explanation>\"}}\n\
  ],\n\
  \"qa\": [\n\
    {{\"question\": \"<interview/defense question>\", \"suggestedAnswerPoints\": [\"<point>\", ...]}}\n\
  ],\n\
  \"mindMap\": {{\n\
    \"topic\": \"<single line: the session's research theme / core question in this field>\",\n\
    \"keywords\": [\"<3-6 short theme keywords from this talk>\"],\n\
    \"categories\": [\n\
      {{\n\
        \"id\": \"b1\",\n\
        \"label\": \"<first branch: a facet of THIS research domain (bilingual short label OK)>\",\n\
        \"group\": \"concept\",\n\
        \"entries\": [\n\
          {{\"id\": \"e1\", \"label\": \"<concrete point from slides/transcript>\", \"children\": [{{\"id\": \"e1a\", \"label\": \"<detail>\"}}]}}\n\
        ]\n\
      }}\n\
    ]\n\
  }},\n\
  \"graphNodes\": [\n\
    {{\n\
      \"id\": \"<lowercase_snake_case>\",\n\
      \"label\": \"<Display Name>\",\n\
      \"group\": \"<method|dataset|metric|author|concept>\",\n\
      \"summary\": \"<1 sentence: why this node matters in THIS talk>\",\n\
      \"keyPoints\": [\"<concrete bullet from transcript/slides>\", \"<...>\"]\n\
    }}\n\
  ],\n\
  \"graphEdges\": [\n\
    {{\"source\": \"<node_id>\", \"target\": \"<node_id>\", \"relation\": \"<specific relation, not vague 'related'>\"}}\n\
  ],\n\
  \"references\": [\n\
    {{\"title\": \"<paper or article title>\", \"authors\": \"<author names>\", \"venue\": \"<journal/conference/blog>\", \"year\": \"<year>\", \"url\": \"<link to the paper or article>\", \"relevance\": \"<1 sentence explaining why this is relevant>\"}}\n\
  ]\n\
}}\n\
\n\
Mind map rules (PRIMARY — must be useful for understanding the RESEARCH FIELD, not a generic bucket list):\n\
- Goal: a **domain mind map** centered on this session: start from the **theme** and **extend outward** how this subfield is structured (problems, ideas, methods, evidence, limits, directions).\n\
- mindMap.topic: ONE line naming the **core research theme** (what field + what angle). Not a generic title like \"Meeting summary\".\n\
- mindMap.keywords: 3–6 **theme keywords** (short phrases) that anchor the map; must be specific to this talk.\n\
- mindMap.categories: **5 to 7** first-level branches. Each branch `label` must be a **facet of this research domain** that naturally extends the theme (examples of *types* of labels — pick what fits the content: 核心问题与动机 / 理论或数学基础 / 方法路线与算法 / 数据与实验设置 / 评测与指标 / 相关工作与脉络 / 局限与开放问题 / 应用与影响). **Do NOT** use a fixed 5-slot template if the talk does not cover that facet; **omit or merge** branches so every branch is substantive.\n\
- Each category: 2–4 `entries`; each entry: 0–3 `children`. Prefer **concrete** names (method names, dataset names, metrics, author/venue only when central to the narrative).\n\
- `group` on each category is only for UI color: use a mix of method|dataset|metric|author|concept|context|theme across branches.\n\
- Unique `id` for every category/entry/child across mindMap; labels under ~48 chars.\n\
- Total leaf-ish nodes across the whole mindMap roughly 25–45; stay readable.\n\
\n\
Interactive knowledge graph (for React Flow UI — prioritize CLARITY):\n\
- graphNodes: **6–8** nodes when the talk has enough content; otherwise fewer. Each node is a **distinct key concept** in the narrative.\n\
- Every graphNode MUST include: `summary` (one sentence, session-specific) and `keyPoints` (2–4 short strings: facts, names, or claims from the talk — no generic filler).\n\
- graphEdges: connect nodes that are **actually linked** in the talk (dependency, comparison, application, etc.). `relation` must be **specific** (e.g. \"uses loss\", \"trained on\", \"outperforms on\", \"extends\"), not \"related to\".\n\
- ids: lowercase_snake_case; edges must reference valid ids. Keep the graph **readable**: avoid a hairball — prefer a clear backbone chain or hub structure.\n\
\n\
Other constraints:\n\
- tags: 3-8 relevant topic tags\n\
- concepts: 3-10 key technical concepts with clear definitions\n\
- qa: 3-5 PhD interview/defense questions, each with 3-4 answer points\n\
- references: 3-8 real, well-known papers or high-quality technical articles closely related to the transcript topics. \
Prioritize seminal papers, recent survey papers, and authoritative blog posts. \
Use real arxiv/doi/blog URLs when possible. If you are unsure of the exact URL, provide the best known citation info and leave url as an empty string.\n\
\n\
Important:\n\
- Use BOTH transcript and screenshots to infer slide topics, method flow, equations/charts, and key claims.\n\
- If screenshot evidence conflicts with transcript, explain in summary conservatively.\n\
\n\
Transcript:\n{}",
        transcript
    );

    let mut user_content: Vec<Value> = vec![json!({
        "type": "text",
        "text": prompt
    })];
    for data_url in image_data_urls {
        user_content.push(json!({
            "type": "image_url",
            "image_url": { "url": data_url }
        }));
    }

    let payload = json!({
      "model": openrouter_model,
      "messages": [
        { "role": "system", "content": "Return only valid JSON. No markdown fences." },
        { "role": "user", "content": user_content }
      ],
      "temperature": 0.2
    })
    .to_string();

    let tmp_dir = env::temp_dir();
    let payload_path = tmp_dir.join(format!(
        "scholarclaw-openrouter-{}.json",
        current_unix_timestamp().unwrap_or(0)
    ));
    fs::write(&payload_path, payload.as_bytes())
        .map_err(|e| format!("failed to write temp payload file: {e}"))?;

    let output = Command::new("curl")
        .arg("-sS")
        .arg("-X")
        .arg("POST")
        .arg("https://openrouter.ai/api/v1/chat/completions")
        .arg("-H")
        .arg("Content-Type: application/json")
        .arg("-H")
        .arg(format!("Authorization: Bearer {}", openrouter_api_key))
        .arg("-d")
        .arg(format!("@{}", payload_path.to_string_lossy()))
        .output()
        .map_err(|error| format!("failed to call OpenRouter: {error}"))?;

    let _ = fs::remove_file(&payload_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("OpenRouter request failed: {stderr}"));
    }

    let body = String::from_utf8_lossy(&output.stdout).to_string();
    let outer: Value = serde_json::from_str(&body)
        .map_err(|error| format!("failed to parse OpenRouter response JSON: {error}"))?;

    if let Some(error_message) = outer
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
    {
        return Err(format!("OpenRouter API error: {error_message}"));
    }

    let content = outer
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .ok_or_else(|| "OpenRouter response missing choices[0].message.content".to_string())?;

    let inner_json = extract_json_block(content);
    let parsed: Value = serde_json::from_str(&inner_json)
        .map_err(|error| format!("model output is not valid JSON: {error}"))?;

    let summary = parsed
        .get("summary")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let tags: Vec<String> = parsed
        .get("tags")
        .and_then(Value::as_array)
        .map(|arr| arr.iter().filter_map(Value::as_str).map(String::from).collect())
        .unwrap_or_default();

    let concepts = parsed
        .get("concepts")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let qa = parsed
        .get("qa")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let graph_nodes = parsed
        .get("graphNodes")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let graph_edges = parsed
        .get("graphEdges")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let references = parsed
        .get("references")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mind_map = parsed
        .get("mindMap")
        .cloned()
        .unwrap_or_else(|| json!({"topic": "", "keywords": [], "categories": []}));

    if summary.is_empty() && qa.is_empty() {
        return Err("model output missing both summary and qa".to_string());
    }

    Ok(AnalysisOutput {
        summary,
        tags,
        concepts,
        qa,
        graph_nodes,
        graph_edges,
        references,
        mind_map,
    })
}

fn call_openrouter_analysis(
    openrouter_api_key: &str,
    openrouter_model: &str,
    transcript: &str,
    image_data_urls: &[String],
) -> Result<(AnalysisOutput, String), String> {
    let preferred_model = openrouter_model.trim();
    let mut candidates: Vec<String> = vec![preferred_model.to_string()];

    for fallback in [
        "openai/gpt-4o-mini",
        "google/gemini-2.0-flash-001",
        "anthropic/claude-3.5-haiku",
    ] {
        if fallback != preferred_model {
            candidates.push(fallback.to_string());
        }
    }

    let mut last_error = String::new();
    for candidate in &candidates {
        match call_openrouter_analysis_once(openrouter_api_key, candidate, transcript, image_data_urls) {
            Ok(output) => return Ok((output, candidate.clone())),
            Err(error) => {
                // Retry once without images if model rejects multimodal payload.
                let lower_error = error.to_lowercase();
                if !image_data_urls.is_empty()
                    && (lower_error.contains("image")
                        || lower_error.contains("multimodal")
                        || lower_error.contains("content type")
                        || lower_error.contains("unsupported"))
                {
                    if let Ok(output) = call_openrouter_analysis_once(openrouter_api_key, candidate, transcript, &[]) {
                        return Ok((output, candidate.clone()));
                    }
                }
                last_error = format!("model `{candidate}` failed: {error}");
                let lower = lower_error;
                let should_try_next = lower.contains("not available in your region")
                    || lower.contains("no endpoints found")
                    || lower.contains("model not found");
                if !should_try_next {
                    return Err(last_error);
                }
            }
        }
    }

    Err(format!(
        "all candidate models failed. Last error: {last_error}. Please change model in Settings."
    ))
}

fn knowledge_base_dir() -> Result<PathBuf, String> {
    let home = env::var("HOME").map_err(|_| "HOME is not set".to_string())?;
    let dir = PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join("ScholarClaw")
        .join("knowledge");
    fs::create_dir_all(&dir)
        .map_err(|e| format!("failed to create knowledge dir: {e}"))?;
    Ok(dir)
}

/// Expand `~` to `$HOME` for paths from Settings (Screenshot Directory).
fn expand_user_path(path_str: &str) -> PathBuf {
    let trimmed = path_str.trim();
    if trimmed.starts_with("~/") {
        if let Ok(home) = env::var("HOME") {
            return PathBuf::from(home).join(trimmed.trim_start_matches("~/"));
        }
    }
    if trimmed == "~" {
        if let Ok(home) = env::var("HOME") {
            return PathBuf::from(home);
        }
    }
    PathBuf::from(trimmed)
}

/// Persist absolute session folder path into `sessions_index.json` (called when capture stops and on AI merge).
fn upsert_session_capture_dir_in_index(session_id: &str, capture_dir: &Path) -> Result<(), String> {
    let kb_dir = knowledge_base_dir()?;
    let index_path = kb_dir.join("sessions_index.json");
    let mut sessions: Vec<Value> = if index_path.exists() {
        let raw = fs::read_to_string(&index_path).unwrap_or_else(|_| "[]".to_string());
        serde_json::from_str(&raw).unwrap_or_default()
    } else {
        vec![]
    };
    let abs = fs::canonicalize(capture_dir).unwrap_or_else(|_| capture_dir.to_path_buf());
    let abs_str = abs.to_string_lossy().to_string();
    let ts = current_unix_timestamp().unwrap_or(0);
    if let Some(entry) = sessions
        .iter_mut()
        .find(|s| s.get("id").and_then(Value::as_str) == Some(session_id))
    {
        if let Some(obj) = entry.as_object_mut() {
            obj.insert("captureDir".to_string(), json!(abs_str));
            obj.insert("updatedAt".to_string(), json!(ts));
        }
    } else {
        sessions.push(json!({
            "id": session_id,
            "captureDir": abs_str,
            "updatedAt": ts
        }));
    }
    fs::write(
        &index_path,
        serde_json::to_string_pretty(&sessions).unwrap_or_else(|_| "[]".to_string()),
    )
    .map_err(|e| format!("failed to write sessions_index.json: {e}"))
}

/// Append/replace one session's AI mind map in `global_mind_map.json` (trees[]).
fn merge_mind_map_tree(session_id: &str, mind_map: &Value) -> Result<(), String> {
    let kb_dir = knowledge_base_dir()?;
    let path = kb_dir.join("global_mind_map.json");
    let mut root: Value = if path.exists() {
        let raw = fs::read_to_string(&path).unwrap_or_else(|_| "{}".to_string());
        serde_json::from_str(&raw).unwrap_or_else(|_| json!({"version": 2, "trees": []}))
    } else {
        json!({"version": 2, "trees": []})
    };
    let trees = root
        .get_mut("trees")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| "global_mind_map invalid: missing trees".to_string())?;
    trees.retain(|t| t.get("sessionId").and_then(Value::as_str) != Some(session_id));
    let topic = mind_map
        .get("topic")
        .and_then(Value::as_str)
        .unwrap_or("Session");
    let categories = mind_map.get("categories").cloned().unwrap_or_else(|| json!([]));
    let keywords = mind_map.get("keywords").cloned().unwrap_or_else(|| json!([]));
    trees.push(json!({
        "sessionId": session_id,
        "topic": topic,
        "keywords": keywords,
        "categories": categories
    }));
    fs::write(
        &path,
        serde_json::to_string_pretty(&root).unwrap_or_else(|_| "{}".to_string()),
    )
    .map_err(|e| format!("failed to write global_mind_map.json: {e}"))?;
    Ok(())
}

fn remove_mind_map_tree(session_id: &str) -> Result<(), String> {
    let kb_dir = knowledge_base_dir()?;
    let path = kb_dir.join("global_mind_map.json");
    if !path.exists() {
        return Ok(());
    }
    let raw = fs::read_to_string(&path).unwrap_or_else(|_| "{}".to_string());
    let mut root: Value = serde_json::from_str(&raw).unwrap_or_else(|_| json!({"version": 2, "trees": []}));
    if let Some(trees) = root.get_mut("trees").and_then(Value::as_array_mut) {
        trees.retain(|t| t.get("sessionId").and_then(Value::as_str) != Some(session_id));
    }
    fs::write(
        &path,
        serde_json::to_string_pretty(&root).unwrap_or_else(|_| "{}".to_string()),
    )
    .map_err(|e| format!("failed to write global_mind_map.json: {e}"))?;
    Ok(())
}

/// One session tree from `mind_map.json` → API tree shape.
fn read_session_mind_map_tree(session_id: &str, cap_dir: &Path) -> Option<Value> {
    let mm_path = cap_dir.join("mind_map.json");
    if !mm_path.exists() {
        return None;
    }
    let mm_raw = fs::read_to_string(&mm_path).ok()?;
    let mm: Value = serde_json::from_str(&mm_raw).ok()?;
    let topic = mm.get("topic").cloned().unwrap_or_else(|| json!(""));
    let categories = mm.get("categories").cloned().unwrap_or_else(|| json!([]));
    let keywords = mm.get("keywords").cloned().unwrap_or_else(|| json!([]));
    let topic_empty = topic.as_str().map(|s| s.trim().is_empty()).unwrap_or(true);
    let cat_empty = categories.as_array().map(|a| a.is_empty()).unwrap_or(true);
    let kw_empty = keywords.as_array().map(|a| a.is_empty()).unwrap_or(true);
    if topic_empty && cat_empty && kw_empty {
        return None;
    }
    Some(json!({
        "sessionId": session_id,
        "topic": topic,
        "keywords": keywords,
        "categories": categories
    }))
}

/// Merge `global_mind_map.json` with any per-session `mind_map.json` not yet listed in `trees`.
/// Fixes cases where the graph merged but `global_mind_map.json` was missing or outdated.
fn build_mind_map_payload(kb_dir: &Path) -> Value {
    let mut trees: Vec<Value> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    let global_path = kb_dir.join("global_mind_map.json");
    if global_path.exists() {
        if let Ok(raw) = fs::read_to_string(&global_path) {
            if let Ok(mm) = serde_json::from_str::<Value>(&raw) {
                if let Some(arr) = mm.get("trees").and_then(Value::as_array) {
                    for t in arr {
                        if let Some(sid) = t.get("sessionId").and_then(Value::as_str) {
                            seen.insert(sid.to_string());
                        }
                        trees.push(t.clone());
                    }
                }
            }
        }
    }

    let index_path = kb_dir.join("sessions_index.json");
    if index_path.exists() {
        let raw = fs::read_to_string(&index_path).unwrap_or_else(|_| "[]".to_string());
        if let Ok(sessions) = serde_json::from_str::<Vec<Value>>(&raw) {
            for entry in sessions {
                let Some(sid) = entry.get("id").and_then(Value::as_str) else {
                    continue;
                };
                if seen.contains(sid) {
                    continue;
                }
                let cap_dir = entry
                    .get("captureDir")
                    .and_then(Value::as_str)
                    .map(|s| PathBuf::from(s.trim()))
                    .filter(|p| p.is_dir());
                let cap_dir = cap_dir.or_else(|| captures_root_dir().map(|r| r.join(sid)));
                let cap_dir = match cap_dir {
                    Some(p) if p.is_dir() => p,
                    _ => continue,
                };
                if let Some(tree) = read_session_mind_map_tree(sid, &cap_dir) {
                    seen.insert(sid.to_string());
                    trees.push(tree);
                }
            }
        }
    }

    if let Some(root) = captures_root_dir() {
        if let Ok(entries) = fs::read_dir(&root) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                let Some(sid) = path.file_name().and_then(|n| n.to_str()) else {
                    continue;
                };
                if seen.contains(sid) {
                    continue;
                }
                if let Some(tree) = read_session_mind_map_tree(sid, &path) {
                    seen.insert(sid.to_string());
                    trees.push(tree);
                }
            }
        }
    }

    json!({ "version": 2, "trees": trees })
}

fn merge_session_into_knowledge_base(
    session_id: &str,
    tags: &[String],
    summary: &str,
    graph_nodes: &[Value],
    graph_edges: &[Value],
    capture_session_dir: &Path,
    mind_map: &Value,
) -> Result<(), String> {
    let kb_dir = knowledge_base_dir()?;

    let capture_dir_abs = fs::canonicalize(capture_session_dir)
        .unwrap_or_else(|_| capture_session_dir.to_path_buf());
    let capture_dir_str = capture_dir_abs.to_string_lossy().to_string();

    let index_path = kb_dir.join("sessions_index.json");
    let mut sessions: Vec<Value> = if index_path.exists() {
        let raw = fs::read_to_string(&index_path).unwrap_or_else(|_| "[]".to_string());
        serde_json::from_str(&raw).unwrap_or_default()
    } else {
        vec![]
    };
    sessions.retain(|s| s.get("id").and_then(Value::as_str) != Some(session_id));
    sessions.push(json!({
        "id": session_id,
        "tags": tags,
        "summary": summary,
        "updatedAt": current_unix_timestamp().unwrap_or(0),
        "captureDir": capture_dir_str
    }));
    fs::write(
        &index_path,
        serde_json::to_string_pretty(&sessions).unwrap_or_else(|_| "[]".to_string()),
    )
    .map_err(|e| format!("failed to write sessions_index.json: {e}"))?;

    let graph_path = kb_dir.join("global_graph.json");
    let mut global: Value = if graph_path.exists() {
        let raw = fs::read_to_string(&graph_path).unwrap_or_else(|_| "{}".to_string());
        serde_json::from_str(&raw)
            .unwrap_or_else(|_| json!({"nodes": [], "edges": []}))
    } else {
        json!({"nodes": [], "edges": []})
    };

    if let Some(existing_nodes) = global.get_mut("nodes").and_then(Value::as_array_mut) {
        for node in graph_nodes {
            let node_id = node.get("id").and_then(Value::as_str).unwrap_or("");
            if node_id.is_empty() {
                continue;
            }
            let found = existing_nodes
                .iter_mut()
                .find(|n| n.get("id").and_then(Value::as_str) == Some(node_id));
            match found {
                Some(existing) => {
                    if let Some(obj) = existing.as_object_mut() {
                        let arr = obj
                            .entry("sessions")
                            .or_insert_with(|| json!([]));
                        if let Some(sessions) = arr.as_array_mut() {
                            if !sessions.iter().any(|s| s.as_str() == Some(session_id)) {
                                sessions.push(json!(session_id));
                            }
                        }
                    }
                }
                None => {
                    let mut new_node = node.clone();
                    if let Some(obj) = new_node.as_object_mut() {
                        obj.insert("sessions".to_string(), json!([session_id]));
                    }
                    existing_nodes.push(new_node);
                }
            }
        }
    }

    if let Some(existing_edges) = global.get_mut("edges").and_then(Value::as_array_mut) {
        for edge in graph_edges {
            let source = edge.get("source").and_then(Value::as_str).unwrap_or("");
            let target = edge.get("target").and_then(Value::as_str).unwrap_or("");
            if source.is_empty() || target.is_empty() {
                continue;
            }
            let found = existing_edges.iter_mut().find(|e| {
                e.get("source").and_then(Value::as_str) == Some(source)
                    && e.get("target").and_then(Value::as_str) == Some(target)
            });
            match found {
                Some(existing) => {
                    if let Some(obj) = existing.as_object_mut() {
                        let w = obj
                            .get("weight")
                            .and_then(Value::as_u64)
                            .unwrap_or(1)
                            + 1;
                        obj.insert("weight".to_string(), json!(w));
                        let arr = obj
                            .entry("sessions")
                            .or_insert_with(|| json!([]));
                        if let Some(sessions) = arr.as_array_mut() {
                            if !sessions.iter().any(|s| s.as_str() == Some(session_id)) {
                                sessions.push(json!(session_id));
                            }
                        }
                    }
                }
                None => {
                    let mut new_edge = edge.clone();
                    if let Some(obj) = new_edge.as_object_mut() {
                        obj.insert("weight".to_string(), json!(1));
                        obj.insert("sessions".to_string(), json!([session_id]));
                    }
                    existing_edges.push(new_edge);
                }
            }
        }
    }

    fs::write(
        &graph_path,
        serde_json::to_string_pretty(&global).unwrap_or_else(|_| "{}".to_string()),
    )
    .map_err(|e| format!("failed to write global_graph.json: {e}"))?;

    merge_mind_map_tree(session_id, mind_map)?;

    Ok(())
}

/// Remove a session from `sessions_index.json` and strip its contributions from `global_graph.json`
/// (nodes/edges with `sessions` arrays; orphan edges without `sessions` are dropped if endpoints vanish).
fn remove_session_from_knowledge_base(session_id: &str) -> Result<(), String> {
    let kb_dir = knowledge_base_dir()?;

    let index_path = kb_dir.join("sessions_index.json");
    if index_path.exists() {
        let raw = fs::read_to_string(&index_path).unwrap_or_else(|_| "[]".to_string());
        let mut sessions: Vec<Value> = serde_json::from_str(&raw).unwrap_or_default();
        sessions.retain(|s| s.get("id").and_then(Value::as_str) != Some(session_id));
        fs::write(
            &index_path,
            serde_json::to_string_pretty(&sessions).unwrap_or_else(|_| "[]".to_string()),
        )
        .map_err(|e| format!("failed to write sessions_index.json: {e}"))?;
    }

    let graph_path = kb_dir.join("global_graph.json");
    if !graph_path.exists() {
        remove_mind_map_tree(session_id)?;
        return Ok(());
    }

    let raw = fs::read_to_string(&graph_path).unwrap_or_else(|_| "{}".to_string());
    let mut global: Value = serde_json::from_str(&raw)
        .unwrap_or_else(|_| json!({"nodes": [], "edges": []}));

    if let Some(nodes) = global.get_mut("nodes").and_then(Value::as_array_mut) {
        for n in nodes.iter_mut() {
            if let Some(arr) = n.get_mut("sessions").and_then(Value::as_array_mut) {
                arr.retain(|s| s.as_str() != Some(session_id));
            }
        }
        nodes.retain(|n| match n.get("sessions").and_then(Value::as_array) {
            Some(arr) if arr.is_empty() => false,
            _ => true,
        });
    }

    let node_ids: HashSet<String> = global
        .get("nodes")
        .and_then(|v| v.as_array())
        .map(|nodes| {
            nodes
                .iter()
                .filter_map(|n| n.get("id").and_then(Value::as_str).map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    if let Some(edges) = global.get_mut("edges").and_then(Value::as_array_mut) {
        for e in edges.iter_mut() {
            if let Some(arr) = e.get_mut("sessions").and_then(Value::as_array_mut) {
                let before = arr.len();
                arr.retain(|s| s.as_str() != Some(session_id));
                let removed = before.saturating_sub(arr.len());
                if removed > 0 {
                    if let Some(obj) = e.as_object_mut() {
                        if let Some(w) = obj.get("weight").and_then(Value::as_u64) {
                            let nw = w.saturating_sub(removed as u64);
                            obj.insert("weight".to_string(), json!(nw));
                        }
                    }
                }
            }
        }
        edges.retain(|e| {
            if let Some(arr) = e.get("sessions").and_then(Value::as_array) {
                if arr.is_empty() {
                    return false;
                }
                if let Some(w) = e.get("weight").and_then(Value::as_u64) {
                    if w == 0 {
                        return false;
                    }
                }
                true
            } else {
                let src = e.get("source").and_then(Value::as_str).unwrap_or("");
                let tgt = e.get("target").and_then(Value::as_str).unwrap_or("");
                !src.is_empty()
                    && !tgt.is_empty()
                    && node_ids.contains(src)
                    && node_ids.contains(tgt)
            }
        });
    }

    fs::write(
        &graph_path,
        serde_json::to_string_pretty(&global).unwrap_or_else(|_| "{}".to_string()),
    )
    .map_err(|e| format!("failed to write global_graph.json: {e}"))?;

    remove_mind_map_tree(session_id)?;

    Ok(())
}

/// Resolve the on-disk session folder for deletion. Order:
/// 1) `captureDir` from `sessions_index.json` (recorded at capture stop / AI merge)
/// 2) Default `~/Library/Application Support/ScholarClaw/captures/<id>`
/// 3) Settings "Screenshot Directory": `<expanded>/<id>` then `<expanded>/captures/<id>`
fn find_session_folder_on_disk(
    session_id: &str,
    index_entry: Option<&Value>,
    settings_screenshots_root: Option<&str>,
) -> Result<PathBuf, String> {
    let mut tried: Vec<String> = Vec::new();

    if let Some(entry) = index_entry {
        if let Some(s) = entry.get("captureDir").and_then(Value::as_str) {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                let p = PathBuf::from(trimmed);
                tried.push(p.to_string_lossy().to_string());
                if p.is_dir() {
                    return Ok(p);
                }
            }
        }
    }

    if let Some(root) = captures_root_dir() {
        let p = root.join(session_id);
        tried.push(p.to_string_lossy().to_string());
        if p.is_dir() {
            return Ok(p);
        }
    }

    if let Some(raw) = settings_screenshots_root {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            let base = expand_user_path(trimmed);
            let p1 = base.join(session_id);
            tried.push(p1.to_string_lossy().to_string());
            if p1.is_dir() {
                return Ok(p1);
            }
            let p2 = base.join("captures").join(session_id);
            tried.push(p2.to_string_lossy().to_string());
            if p2.is_dir() {
                return Ok(p2);
            }
        }
    }

    Err(format!(
        "SESSION_FOLDER_NOT_FOUND: Could not find session folder on disk. Tried: {}. \
         Check Settings → Screenshot Directory, or restore/move the folder, then try again.",
        tried.join(" | ")
    ))
}

#[tauri::command]
fn delete_session(id: String, screenshots_root: Option<String>) -> Result<String, String> {
    let id = id.trim();
    if id.is_empty() {
        return Err("Session id is empty.".to_string());
    }
    if is_capture_running(id) {
        return Err("Cannot delete a session while capture is running.".to_string());
    }

    let index_entry: Option<Value> = match knowledge_base_dir() {
        Ok(kb) => {
            let index_path = kb.join("sessions_index.json");
            if !index_path.exists() {
                None
            } else {
                let raw = fs::read_to_string(&index_path).unwrap_or_else(|_| "[]".to_string());
                let sessions: Vec<Value> = serde_json::from_str(&raw).unwrap_or_default();
                sessions
                    .into_iter()
                    .find(|s| s.get("id").and_then(Value::as_str) == Some(id))
            }
        }
        Err(_) => None,
    };

    let settings_ref = screenshots_root.as_deref();
    let dir_to_remove = find_session_folder_on_disk(id, index_entry.as_ref(), settings_ref)?;

    if let Ok(mut store) = last_capture_store().lock() {
        if store.as_ref().map(|c| c.id.as_str()) == Some(id) {
            *store = None;
        }
    }

    fs::remove_dir_all(&dir_to_remove).map_err(|e| format!("failed to delete session folder: {e}"))?;

    remove_session_from_knowledge_base(id)?;

    Ok(format!(
        "Session deleted (removed: {}).",
        dir_to_remove.to_string_lossy()
    ))
}

#[tauri::command]
fn check_capture_prerequisites() -> CapturePrerequisites {
    let mut notes: Vec<String> = Vec::new();
    if !ffmpeg_is_available() {
        notes.push("ffmpeg not found: screen capture works, audio capture is disabled".to_string());
    } else {
        notes.push("ffmpeg detected: audio capture can be attempted on default input".to_string());
    }
    notes.push("Frame sampler interval is configurable (e.g. 2s / 5s / 10s) with content deduplication".to_string());
    notes.push("macOS may prompt for Screen Recording and Microphone permissions".to_string());

    CapturePrerequisites {
        platform: env::consts::OS.to_string(),
        ffmpeg_available: ffmpeg_is_available(),
        notes,
    }
}

#[tauri::command]
fn list_audio_input_devices() -> Result<Vec<AudioInputDevice>, String> {
    list_avfoundation_audio_devices()
}

#[tauri::command]
fn list_capture_displays(app: AppHandle) -> Result<Vec<CaptureDisplayInfo>, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let monitors = window
        .available_monitors()
        .map_err(|e| format!("failed to list monitors: {e}"))?;
    Ok(monitors
        .into_iter()
        .enumerate()
        .map(|(i, m)| {
            let size = m.size();
            let idx = (i + 1) as u32;
            let label = m
                .name()
                .map(|n| n.to_string())
                .unwrap_or_else(|| format!("Display {}", idx));
            CaptureDisplayInfo {
                index: idx,
                label,
                width: size.width,
                height: size.height,
            }
        })
        .collect())
}

#[tauri::command]
fn open_region_selector(app: AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("region-selector") {
        let _ = existing.set_focus();
        return Ok(());
    }

    let monitor = app
        .primary_monitor()
        .map_err(|e| format!("failed to get primary monitor: {e}"))?
        .ok_or_else(|| "no primary monitor found".to_string())?;
    let phys = monitor.size();
    let scale = monitor.scale_factor();
    let w = phys.width as f64 / scale;
    let h = phys.height as f64 / scale;

    tauri::WebviewWindowBuilder::new(
        &app,
        "region-selector",
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("Select Capture Region")
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .position(0.0, 0.0)
    .inner_size(w, h)
    .build()
    .map_err(|e| format!("failed to open region selector: {e}"))?;
    Ok(())
}

#[tauri::command]
fn close_region_selector(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("region-selector") {
        win.close().map_err(|e| format!("failed to close region selector: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
fn confirm_region_selection(region: Option<CaptureRegion>, app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("region-selector") {
        let _ = win.close();
    }
    app.emit("region-confirmed", &region)
        .map_err(|e| format!("failed to emit region-confirmed: {e}"))?;
    Ok(())
}

#[tauri::command]
fn cancel_region_selection(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("region-selector") {
        let _ = win.close();
    }
    app.emit("region-cancelled", ())
        .map_err(|e| format!("failed to emit region-cancelled: {e}"))?;
    Ok(())
}

pub(crate) fn start_capture_session_inner(
    app: AppHandle,
    options: Option<CaptureStartOptions>,
    region: Option<CaptureRegion>,
    display_index: Option<u32>,
    silent: Option<bool>,
) -> Result<String, String> {
    let mut store = active_capture_store()
        .lock()
        .map_err(|_| "failed to lock capture state".to_string())?;

    if store.is_some() {
        return Err("capture session is already running".to_string());
    }

    let timestamp = current_unix_timestamp()?;
    let session_id = format!("session-{timestamp}");
    let capture_dir = build_capture_dir(&session_id)?;
    let screenshot_path = capture_dir.join("screen-start.png");
    let audio_path = capture_dir.join("audio.wav");
    let audio_log_path = capture_dir.join("audio-ffmpeg.log");
    let resolved_specs = options
        .as_ref()
        .map(|value| value.audio_input_specs.clone())
        .unwrap_or_else(|| vec!["none:0".to_string()]);
    let resolved_sample_rate = options
        .as_ref()
        .and_then(|value| value.sample_rate)
        .unwrap_or(16000);
    let resolved_channels = options
        .as_ref()
        .and_then(|value| value.channels)
        .unwrap_or(1);
    let resolved_frame_interval = options
        .as_ref()
        .and_then(|value| value.frame_interval_sec)
        .unwrap_or(2)
        .max(1)
        .min(60);

    let display_index = display_index.filter(|&d| d >= 1);
    if let Some(d) = display_index {
        let n = list_capture_displays(app.clone())?.len();
        if n == 0 {
            return Err("no displays detected".to_string());
        }
        if d as usize > n {
            return Err(format!(
                "display index {d} is out of range (found {n} display(s))"
            ));
        }
    }

    let region_for_sampler = if display_index.is_some() {
        None
    } else {
        region.clone()
    };

    capture_screenshot(
        &screenshot_path,
        region_for_sampler.as_ref(),
        display_index,
    )?;
    write_capture_meta(&capture_dir, resolved_frame_interval);
    let initial_hash = hash_file(&screenshot_path)?;
    let audio_process = spawn_audio_capture(
        &audio_path,
        &audio_log_path,
        &resolved_specs,
        resolved_sample_rate,
        resolved_channels,
    )?;
    let stop_signal = Arc::new(AtomicBool::new(false));
    let pause_signal = Arc::new(AtomicBool::new(false));
    let sampler_handle = spawn_frame_sampler(
        capture_dir.clone(),
        Arc::clone(&stop_signal),
        Arc::clone(&pause_signal),
        initial_hash,
        region_for_sampler.clone(),
        display_index,
        resolved_frame_interval,
    );

    println!("start_capture_session invoked: {}", session_id);

    *store = Some(ActiveCapture {
        id: session_id.clone(),
        dir: capture_dir,
        first_screenshot_path: screenshot_path,
        audio_process,
        frame_sampler_stop: stop_signal,
        frame_sampler_handle: Some(sampler_handle),
        pause_signal,
        region: region_for_sampler,
        display_index,
    });

    let _ = silent;
    if app.get_webview_window("floating-controller").is_none() {
        match tauri::WebviewWindowBuilder::new(
            &app,
            "floating-controller",
            tauri::WebviewUrl::App("index.html".into()),
        )
        .title("ScholarClaw Recording")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .inner_size(280.0, 48.0)
        .resizable(false)
        .build()
        {
            Ok(win) => {
                position_floating_window(&app, &win);
            }
            Err(e) => println!("Warning: floating controller window: {e}"),
        }
    }

    Ok(session_id)
}

#[tauri::command]
fn start_capture_session(
    options: Option<CaptureStartOptions>,
    region: Option<CaptureRegion>,
    display_index: Option<u32>,
    silent: Option<bool>,
    app: AppHandle,
) -> Result<String, String> {
    start_capture_session_inner(app, options, region, display_index, silent)
}

#[tauri::command]
fn stop_capture_session(app: AppHandle) -> Result<String, String> {
    let mut active_store = active_capture_store()
        .lock()
        .map_err(|_| "failed to lock capture state".to_string())?;

    let mut current = active_store
        .take()
        .ok_or_else(|| "no running capture session".to_string())?;

    current.frame_sampler_stop.store(true, Ordering::Relaxed);
    if let Some(handle) = current.frame_sampler_handle.take() {
        let _ = handle.join();
    }

    if let Some(audio_process) = current.audio_process.as_mut() {
        let _ = audio_process.kill();
        let _ = audio_process.wait();
    }

    let end_shot_path = current.dir.join("screen-stop.png");
    let _ = capture_screenshot(
        &end_shot_path,
        current.region.as_ref(),
        current.display_index,
    );

    println!("stop_capture_session invoked: {}", current.id);

    let finished = CompletedCapture {
        id: current.id.clone(),
        dir: current.dir.clone(),
        first_screenshot_path: current.first_screenshot_path.clone(),
    };

    let mut last_store = last_capture_store()
        .lock()
        .map_err(|_| "failed to lock last capture state".to_string())?;
    *last_store = Some(finished);

    if let Err(e) = upsert_session_capture_dir_in_index(&current.id, &current.dir) {
        println!("Warning: failed to persist captureDir in sessions_index: {e}");
    }

    if let Some(win) = app.get_webview_window("floating-controller") {
        let _ = win.close();
    }

    let _ = app.emit("capture-stopped", &current.id);

    Ok(current.id)
}

#[tauri::command]
fn transcribe_session_audio(
    id: String,
    asr_provider: String,
    asr_endpoint: String,
    asr_api_key: String,
    asr_model: String,
    asr_language: String,
) -> Result<String, String> {
    if is_capture_running(&id) {
        return Err("capture is still running. Please click Stop before Transcribe.".to_string());
    }

    let capture_dir = resolve_capture_dir_for_id(&id)
        .ok_or_else(|| format!("capture session not found for id: {id}"))?;
    let audio_path = capture_dir.join("audio.wav");
    if !audio_path.exists() {
        return Err("audio.wav not found. Start and stop capture first.".to_string());
    }

    let mut audio_size: u64 = 0;
    // ffmpeg may still be flushing when stop was just triggered; retry briefly.
    for _ in 0..8 {
        audio_size = fs::metadata(&audio_path)
            .map(|meta| meta.len())
            .unwrap_or(0);
        if audio_size > 44 {
            break;
        }
        thread::sleep(Duration::from_millis(250));
    }

    if audio_size <= 44 {
        let log_path = capture_dir.join("audio-ffmpeg.log");
        let raw_log = fs::read_to_string(&log_path).unwrap_or_else(|_| "ffmpeg log unavailable".to_string());
        let log_tail = tail_lines(&raw_log, 40);
        return Err(format!(
            "audio.wav is empty or invalid (size={audio_size}). Check microphone permission/device. ffmpeg log tail:\n{log_tail}"
        ));
    }

    if asr_endpoint.trim().is_empty() {
        return Err("ASR endpoint is empty".to_string());
    }

    let provider = asr_provider.trim();
    let transcript = match provider {
        "whisper_cpp" => call_whisper_cpp(asr_endpoint.trim(), &audio_path, asr_language.trim())?,
        "openai_compatible" => {
            if asr_api_key.trim().is_empty() {
                return Err("ASR API key is empty for openai_compatible provider".to_string());
            }
            if asr_model.trim().is_empty() {
                return Err("ASR model is empty for openai_compatible provider".to_string());
            }
            call_openai_compatible_asr(
                asr_endpoint.trim(),
                asr_api_key.trim(),
                asr_model.trim(),
                &audio_path,
                asr_language.trim(),
            )?
        }
        _ => {
            return Err(format!(
                "Unsupported ASR provider `{provider}`. Use whisper_cpp or openai_compatible."
            ))
        }
    };
    let transcript_path = capture_dir.join("transcript.txt");
    fs::write(&transcript_path, transcript.as_bytes())
        .map_err(|error| format!("failed to write transcript.txt: {error}"))?;

    Ok(transcript_path.to_string_lossy().to_string())
}

#[tauri::command]
fn generate_session_analysis(
    id: String,
    open_router_api_key: String,
    open_router_model: String,
) -> Result<String, String> {
    if open_router_api_key.trim().is_empty() {
        return Err("OpenRouter API key is empty".to_string());
    }
    if open_router_model.trim().is_empty() {
        return Err("OpenRouter model is empty".to_string());
    }

    let capture_dir = resolve_capture_dir_for_id(&id)
        .ok_or_else(|| format!("capture session not found for id: {id}"))?;
    let transcript_path = capture_dir.join("transcript.txt");
    let transcript = fs::read_to_string(&transcript_path)
        .map_err(|_| "transcript.txt not found. Run Transcribe first.".to_string())?;

    let image_data_urls = collect_analysis_images(&capture_dir, 6);
    let (output, used_model) = call_openrouter_analysis(
        open_router_api_key.trim(),
        open_router_model.trim(),
        transcript.trim(),
        &image_data_urls,
    )?;

    let write = |name: &str, data: &str| -> Result<(), String> {
        fs::write(capture_dir.join(name), data.as_bytes())
            .map_err(|e| format!("failed to write {name}: {e}"))
    };

    write("summary.txt", &output.summary)?;
    write(
        "qa.json",
        &serde_json::to_string_pretty(&output.qa).unwrap_or_else(|_| "[]".to_string()),
    )?;
    write(
        "tags.json",
        &serde_json::to_string_pretty(&output.tags).unwrap_or_else(|_| "[]".to_string()),
    )?;
    write(
        "concepts.json",
        &serde_json::to_string_pretty(&output.concepts).unwrap_or_else(|_| "[]".to_string()),
    )?;
    write(
        "session_graph.json",
        &serde_json::to_string_pretty(&json!({
            "nodes": output.graph_nodes,
            "edges": output.graph_edges
        }))
        .unwrap_or_else(|_| "{}".to_string()),
    )?;
    write(
        "mind_map.json",
        &serde_json::to_string_pretty(&output.mind_map).unwrap_or_else(|_| "{}".to_string()),
    )?;
    write(
        "references.json",
        &serde_json::to_string_pretty(&output.references).unwrap_or_else(|_| "[]".to_string()),
    )?;

    if let Err(e) = merge_session_into_knowledge_base(
        &id,
        &output.tags,
        &output.summary,
        &output.graph_nodes,
        &output.graph_edges,
        &capture_dir,
        &output.mind_map,
    ) {
        println!("Warning: knowledge base merge failed: {e}");
    }

    let cat_count = output
        .mind_map
        .get("categories")
        .and_then(Value::as_array)
        .map(|a| a.len())
        .unwrap_or(0);
    let stats = format!(
        "tags={} concepts={} refs={} mindCategories={} graphNodes={} graphEdges={}",
        output.tags.len(),
        output.concepts.len(),
        output.references.len(),
        cat_count,
        output.graph_nodes.len(),
        output.graph_edges.len()
    );
    Ok(format!("Analysis complete (model={used_model}, {stats})"))
}

#[tauri::command]
fn get_session_data(id: String) -> String {
    println!("get_session_data invoked with id: {}", id);
    let mut capture_status = "idle".to_string();
    let mut report_note = "Returning fallback mock payload (no capture directory found)".to_string();

    // Determine capture status from memory stores
    if is_capture_running(&id) {
        capture_status = "running".to_string();
    } else if let Ok(store) = last_capture_store().lock() {
        if store.as_ref().map(|l| l.id == id).unwrap_or(false) {
            capture_status = "stopped".to_string();
        }
    }

    // Use the unified resolver which includes filesystem fallback for historical sessions
    let capture_dir = resolve_capture_dir_for_id(&id);

    if let Some(ref dir) = capture_dir {
        report_note = format!("Session directory: {}", dir.to_string_lossy());
        if capture_status == "idle" {
            capture_status = "history".to_string();
        }
    }

    let timeline = if let Some(dir) = capture_dir.as_ref() {
        let built = build_timeline_from_dir(dir);
        if built.is_empty() {
            vec![json!({
              "id": "tl-rs-live-000",
              "timestamp": 0,
              "pptScreenshotPath": "/placeholders/ppt-slide-01.png",
              "originalTranscript": "No sampled frame found yet.",
              "summary": "Start capture and wait a few seconds for sampled frames.",
              "annotations": [
                { "term": "Capture Warmup", "definition": "The sampler writes frames by configured interval when content changes." }
              ]
            })]
        } else {
            built
        }
    } else {
        vec![json!({
          "id": "tl-rs-live-000",
          "timestamp": 0,
          "pptScreenshotPath": "/placeholders/ppt-slide-01.png",
          "originalTranscript": "No local capture found for this session id.",
          "summary": "Fallback payload returned. Run Start Capture -> Stop -> Sync Session.",
          "annotations": [
            { "term": "Fallback", "definition": "No matching capture artifacts were found in local storage." }
          ]
        })]
    };

    let mut extended_report = report_note.clone();
    let mut qa_simulator: Vec<Value> = vec![];
    let mut tags: Vec<Value> = vec![json!(format!("status:{capture_status}"))];
    let mut concepts: Vec<Value> = vec![];
    let mut references: Vec<Value> = vec![];

    if let Some(dir) = capture_dir.as_ref() {
        if let Ok(summary) = fs::read_to_string(dir.join("summary.txt")) {
            if !summary.trim().is_empty() {
                extended_report = summary;
            }
        }
        if let Ok(raw) = fs::read_to_string(dir.join("qa.json")) {
            if let Ok(parsed) = serde_json::from_str::<Value>(&raw) {
                if let Some(arr) = parsed.as_array() {
                    qa_simulator = arr.clone();
                }
            }
        }
        if let Ok(raw) = fs::read_to_string(dir.join("tags.json")) {
            if let Ok(parsed) = serde_json::from_str::<Value>(&raw) {
                if let Some(arr) = parsed.as_array() {
                    tags = arr.clone();
                    tags.push(json!(format!("status:{capture_status}")));
                }
            }
        }
        if let Ok(raw) = fs::read_to_string(dir.join("concepts.json")) {
            if let Ok(parsed) = serde_json::from_str::<Value>(&raw) {
                if let Some(arr) = parsed.as_array() {
                    concepts = arr.clone();
                }
            }
        }
        if let Ok(raw) = fs::read_to_string(dir.join("references.json")) {
            if let Ok(parsed) = serde_json::from_str::<Value>(&raw) {
                if let Some(arr) = parsed.as_array() {
                    references = arr.clone();
                }
            }
        }
    }

    json!({
      "id": id,
      "title": "Local Capture Session",
      "date": "2026-03-17T00:00:00Z",
      "tags": tags,
      "concepts": concepts,
      "timeline": timeline,
      "extendedReport": extended_report,
      "qaSimulator": qa_simulator,
      "references": references
    })
    .to_string()
}

#[tauri::command]
fn list_capture_sessions() -> String {
    let root = match captures_root_dir() {
        Some(d) if d.is_dir() => d,
        _ => return "[]".to_string(),
    };
    let mut sessions: Vec<Value> = Vec::new();

    let mut entries: Vec<_> = match fs::read_dir(&root) {
        Ok(rd) => rd.filter_map(|e| e.ok()).collect(),
        Err(_) => return "[]".to_string(),
    };
    entries.sort_by(|a, b| b.file_name().cmp(&a.file_name()));

    for entry in entries {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        if !name.starts_with("session-") {
            continue;
        }

        let has_audio = path.join("audio.wav").exists();
        let has_transcript = path.join("transcript.txt").exists();
        let has_summary = path.join("summary.txt").exists();
        let frame_count = fs::read_dir(&path)
            .map(|rd| {
                rd.filter_map(|e| e.ok())
                    .filter(|e| {
                        e.file_name()
                            .to_str()
                            .map(|n| n.starts_with("frame-") && n.ends_with(".png"))
                            .unwrap_or(false)
                    })
                    .count()
            })
            .unwrap_or(0);

        let tags: Vec<Value> = if let Ok(raw) = fs::read_to_string(path.join("tags.json")) {
            serde_json::from_str(&raw).unwrap_or_default()
        } else {
            vec![]
        };

        let is_running = is_capture_running(&name);

        sessions.push(json!({
            "id": name,
            "hasAudio": has_audio,
            "hasTranscript": has_transcript,
            "hasSummary": has_summary,
            "frameCount": frame_count,
            "tags": tags,
            "isRunning": is_running
        }));
    }

    serde_json::to_string(&sessions).unwrap_or_else(|_| "[]".to_string())
}

#[tauri::command]
fn get_knowledge_graph() -> String {
    let kb_dir = match knowledge_base_dir() {
        Ok(d) => d,
        Err(_) => {
            return json!({"nodes": [], "edges": [], "mindMap": Value::Null}).to_string();
        }
    };
    let graph_path = kb_dir.join("global_graph.json");

    let mut out = if graph_path.exists() {
        fs::read_to_string(&graph_path)
            .ok()
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
            .unwrap_or_else(|| json!({"nodes": [], "edges": []}))
    } else {
        json!({"nodes": [], "edges": []})
    };

    out["mindMap"] = build_mind_map_payload(&kb_dir);

    out.to_string()
}

#[tauri::command]
fn get_all_sessions() -> String {
    let index_path = match knowledge_base_dir() {
        Ok(dir) => dir.join("sessions_index.json"),
        Err(_) => return "[]".to_string(),
    };
    if !index_path.exists() {
        return "[]".to_string();
    }
    fs::read_to_string(&index_path).unwrap_or_else(|_| "[]".to_string())
}

#[tauri::command]
fn sync_bot_capture_prefs(prefs: bot_endpoint::BotCapturePrefs) -> Result<(), String> {
    bot_endpoint::sync_bot_capture_prefs_file(&prefs)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetBotEndpointArgs {
    enabled: bool,
    port: u16,
    /// When `None`, keep the existing secret on disk. When `Some("")`, clear. Otherwise replace.
    secret: Option<String>,
}

#[tauri::command]
fn set_bot_endpoint_config(args: SetBotEndpointArgs, app: AppHandle) -> Result<(), String> {
    if !(1024..=65535).contains(&args.port) {
        return Err("port must be between 1024 and 65535".to_string());
    }
    let mut cfg = bot_endpoint::load_bot_config();
    cfg.enabled = args.enabled;
    cfg.port = args.port;
    if let Some(s) = args.secret {
        cfg.secret = s;
    }
    bot_endpoint::save_bot_config(&cfg)?;
    if cfg.enabled {
        bot_endpoint::start_bot_http_server(app)?;
    } else {
        bot_endpoint::stop_bot_http_server();
    }
    Ok(())
}

#[tauri::command]
fn get_bot_endpoint_status() -> String {
    let c = bot_endpoint::load_bot_config();
    let listening = bot_endpoint::is_bot_server_running();
    let base = bot_endpoint::bot_endpoint_base_url();
    json!({
        "enabled": c.enabled,
        "port": c.port,
        "listening": listening,
        "baseUrl": base,
        "secretConfigured": !c.secret.trim().is_empty(),
    })
    .to_string()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle().clone();
            if let Err(e) = bot_endpoint::start_bot_http_server(handle) {
                eprintln!("ScholarClaw bot endpoint startup: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            check_capture_prerequisites,
            list_audio_input_devices,
            list_capture_displays,
            open_region_selector,
            close_region_selector,
            confirm_region_selection,
            cancel_region_selection,
            start_capture_session,
            stop_capture_session,
            set_capture_paused,
            get_capture_paused,
            transcribe_session_audio,
            generate_session_analysis,
            get_session_data,
            list_capture_sessions,
            get_knowledge_graph,
            get_all_sessions,
            delete_session,
            sync_bot_capture_prefs,
            set_bot_endpoint_config,
            get_bot_endpoint_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
