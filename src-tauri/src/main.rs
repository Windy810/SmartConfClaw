#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::env;
use std::fs;
use std::fs::File;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
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

struct ActiveCapture {
    id: String,
    dir: PathBuf,
    first_screenshot_path: PathBuf,
    audio_process: Option<Child>,
    frame_sampler_stop: Arc<AtomicBool>,
    frame_sampler_handle: Option<JoinHandle<()>>,
    region: Option<CaptureRegion>,
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
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaptureStartOptions {
    audio_input_specs: Vec<String>,
    sample_rate: Option<u32>,
    channels: Option<u8>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaptureRegion {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

static ACTIVE_CAPTURE: OnceLock<Mutex<Option<ActiveCapture>>> = OnceLock::new();
static LAST_CAPTURE: OnceLock<Mutex<Option<CompletedCapture>>> = OnceLock::new();

fn active_capture_store() -> &'static Mutex<Option<ActiveCapture>> {
    ACTIVE_CAPTURE.get_or_init(|| Mutex::new(None))
}

fn last_capture_store() -> &'static Mutex<Option<CompletedCapture>> {
    LAST_CAPTURE.get_or_init(|| Mutex::new(None))
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

fn capture_screenshot(path: &PathBuf, region: Option<&CaptureRegion>) -> Result<(), String> {
    let mut cmd = Command::new("screencapture");
    cmd.arg("-x");
    if let Some(r) = region {
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

fn spawn_frame_sampler(dir: PathBuf, stop_signal: Arc<AtomicBool>, initial_hash: u64, region: Option<CaptureRegion>) -> JoinHandle<()> {
    thread::spawn(move || {
        let mut frame_index: u32 = 1;
        let mut last_hash: u64 = initial_hash;

        loop {
            thread::sleep(Duration::from_secs(2));
            if stop_signal.load(Ordering::Relaxed) {
                break;
            }

            let temp_path = dir.join("frame-tmp.png");
            if capture_screenshot(&temp_path, region.as_ref()).is_err() {
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

fn ffmpeg_is_available() -> bool {
    Command::new("ffmpeg")
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn list_avfoundation_audio_devices() -> Result<Vec<AudioInputDevice>, String> {
    if !ffmpeg_is_available() {
        return Ok(Vec::new());
    }

    let output = Command::new("ffmpeg")
        .arg("-f")
        .arg("avfoundation")
        .arg("-list_devices")
        .arg("true")
        .arg("-i")
        .arg("")
        .output()
        .map_err(|error| format!("failed to list avfoundation devices: {error}"))?;

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let mut in_audio_section = false;
    let mut devices: Vec<AudioInputDevice> = Vec::new();

    for line in stderr.lines() {
        let lower = line.to_lowercase();
        if lower.contains("avfoundation audio devices") {
            in_audio_section = true;
            continue;
        }
        if lower.contains("avfoundation video devices") {
            in_audio_section = false;
        }
        if !in_audio_section {
            continue;
        }

        let start = match line.find('[') {
            Some(value) => value,
            None => continue,
        };
        let end = match line[start + 1..].find(']') {
            Some(value) => start + 1 + value,
            None => continue,
        };
        let index_text = line[start + 1..end].trim();
        let index = match index_text.parse::<i32>() {
            Ok(value) => value,
            Err(_) => continue,
        };
        let label = line[end + 1..].trim().to_string();
        if label.is_empty() {
            continue;
        }
        devices.push(AudioInputDevice {
            index,
            label,
            ffmpeg_spec: format!("none:{index}"),
        });
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

    items
        .iter()
        .enumerate()
        .map(|(index, (_, path))| {
            json!({
              "id": format!("tl-rs-live-{index:03}"),
              "timestamp": (index as i64) * 2,
              "pptScreenshotPath": to_displayable_image_src(path),
              "originalTranscript": transcript.clone(),
              "summary": "Frame is included only when it differs from the previous sampled frame (2s sampling, deduplicated).",
              "annotations": [
                { "term": "Frame Deduplication", "definition": "If current frame hash equals previous frame hash, the frame is ignored." },
                { "term": "Sampling Interval", "definition": "Screenshots are sampled every 2 seconds while capture is running." }
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

struct AnalysisOutput {
    summary: String,
    tags: Vec<String>,
    concepts: Vec<Value>,
    qa: Vec<Value>,
    graph_nodes: Vec<Value>,
    graph_edges: Vec<Value>,
    references: Vec<Value>,
}

fn call_openrouter_analysis_once(
    openrouter_api_key: &str,
    openrouter_model: &str,
    transcript: &str,
) -> Result<AnalysisOutput, String> {
    let prompt = format!(
        "You are an ML/AI research assistant. Analyze the following meeting/lecture transcript \
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
  \"graphNodes\": [\n\
    {{\"id\": \"<lowercase_snake_case>\", \"label\": \"<Display Name>\", \"group\": \"<method|dataset|metric|author|concept>\"}}\n\
  ],\n\
  \"graphEdges\": [\n\
    {{\"source\": \"<node_id>\", \"target\": \"<node_id>\", \"relation\": \"<short relationship label>\"}}\n\
  ],\n\
  \"references\": [\n\
    {{\"title\": \"<paper or article title>\", \"authors\": \"<author names>\", \"venue\": \"<journal/conference/blog>\", \"year\": \"<year>\", \"url\": \"<link to the paper or article>\", \"relevance\": \"<1 sentence explaining why this is relevant>\"}}\n\
  ]\n\
}}\n\
\n\
Constraints:\n\
- tags: 3-8 relevant topic tags\n\
- concepts: 3-10 key technical concepts with clear definitions\n\
- qa: 3-5 PhD interview/defense questions, each with 3-4 answer points\n\
- graphNodes: 5-15 nodes (methods, datasets, metrics, authors, concepts)\n\
- graphEdges: 5-20 edges connecting nodes by their relationships\n\
- All node ids must be lowercase_snake_case and unique\n\
- All edge source/target must reference valid node ids\n\
- references: 3-8 real, well-known papers or high-quality technical articles closely related to the transcript topics. \
Prioritize seminal papers, recent survey papers, and authoritative blog posts. \
Use real arxiv/doi/blog URLs when possible. If you are unsure of the exact URL, provide the best known citation info and leave url as an empty string.\n\
\n\
Transcript:\n{}",
        transcript
    );

    let payload = json!({
      "model": openrouter_model,
      "messages": [
        { "role": "system", "content": "Return only valid JSON. No markdown fences." },
        { "role": "user", "content": prompt }
      ],
      "temperature": 0.2
    })
    .to_string();

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
        .arg(payload)
        .output()
        .map_err(|error| format!("failed to call OpenRouter: {error}"))?;

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

    if summary.is_empty() && qa.is_empty() {
        return Err("model output missing both summary and qa".to_string());
    }

    Ok(AnalysisOutput { summary, tags, concepts, qa, graph_nodes, graph_edges, references })
}

fn call_openrouter_analysis(
    openrouter_api_key: &str,
    openrouter_model: &str,
    transcript: &str,
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
        match call_openrouter_analysis_once(openrouter_api_key, candidate, transcript) {
            Ok(output) => return Ok((output, candidate.clone())),
            Err(error) => {
                last_error = format!("model `{candidate}` failed: {error}");
                let lower = error.to_lowercase();
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

fn merge_session_into_knowledge_base(
    session_id: &str,
    tags: &[String],
    summary: &str,
    graph_nodes: &[Value],
    graph_edges: &[Value],
) -> Result<(), String> {
    let kb_dir = knowledge_base_dir()?;

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
        "updatedAt": current_unix_timestamp().unwrap_or(0)
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

    Ok(())
}

#[tauri::command]
fn check_capture_prerequisites() -> CapturePrerequisites {
    let mut notes: Vec<String> = Vec::new();
    if !ffmpeg_is_available() {
        notes.push("ffmpeg not found: screen capture works, audio capture is disabled".to_string());
    } else {
        notes.push("ffmpeg detected: audio capture can be attempted on default input".to_string());
    }
    notes.push("Frame sampler runs every 2s with content deduplication".to_string());
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

#[tauri::command]
fn start_capture_session(
    options: Option<CaptureStartOptions>,
    region: Option<CaptureRegion>,
    app: AppHandle,
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

    capture_screenshot(&screenshot_path, region.as_ref())?;
    let initial_hash = hash_file(&screenshot_path)?;
    let audio_process = spawn_audio_capture(
        &audio_path,
        &audio_log_path,
        &resolved_specs,
        resolved_sample_rate,
        resolved_channels,
    )?;
    let stop_signal = Arc::new(AtomicBool::new(false));
    let sampler_handle = spawn_frame_sampler(
        capture_dir.clone(),
        Arc::clone(&stop_signal),
        initial_hash,
        region.clone(),
    );

    println!("start_capture_session invoked: {}", session_id);

    *store = Some(ActiveCapture {
        id: session_id.clone(),
        dir: capture_dir,
        first_screenshot_path: screenshot_path,
        audio_process,
        frame_sampler_stop: stop_signal,
        frame_sampler_handle: Some(sampler_handle),
        region,
    });

    if app.get_webview_window("floating-controller").is_none() {
        let _ = tauri::WebviewWindowBuilder::new(
            &app,
            "floating-controller",
            tauri::WebviewUrl::App("index.html".into()),
        )
        .title("ScholarClaw Recording")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .inner_size(300.0, 64.0)
        .resizable(false)
        .build();
    }

    Ok(session_id)
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
    let _ = capture_screenshot(&end_shot_path, current.region.as_ref());

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

    let (output, used_model) = call_openrouter_analysis(
        open_router_api_key.trim(),
        open_router_model.trim(),
        transcript.trim(),
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
        "references.json",
        &serde_json::to_string_pretty(&output.references).unwrap_or_else(|_| "[]".to_string()),
    )?;

    if let Err(e) = merge_session_into_knowledge_base(
        &id,
        &output.tags,
        &output.summary,
        &output.graph_nodes,
        &output.graph_edges,
    ) {
        println!("Warning: knowledge base merge failed: {e}");
    }

    let stats = format!(
        "tags={} concepts={} refs={} nodes={} edges={}",
        output.tags.len(),
        output.concepts.len(),
        output.references.len(),
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
                { "term": "Capture Warmup", "definition": "The sampler writes frames every 2 seconds when content changes." }
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
      "title": "ScholarClaw Local Capture Session",
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
    let graph_path = match knowledge_base_dir() {
        Ok(dir) => dir.join("global_graph.json"),
        Err(_) => return json!({"nodes": [], "edges": []}).to_string(),
    };
    if !graph_path.exists() {
        return json!({"nodes": [], "edges": []}).to_string();
    }
    fs::read_to_string(&graph_path).unwrap_or_else(|_| json!({"nodes": [], "edges": []}).to_string())
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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            check_capture_prerequisites,
            list_audio_input_devices,
            open_region_selector,
            close_region_selector,
            confirm_region_selection,
            cancel_region_selection,
            start_capture_session,
            stop_capture_session,
            transcribe_session_audio,
            generate_session_analysis,
            get_session_data,
            list_capture_sessions,
            get_knowledge_graph,
            get_all_sessions
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
