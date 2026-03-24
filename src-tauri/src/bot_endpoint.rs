//! Local HTTP endpoint so external bots / scripts can POST a meeting URL; the app opens the
//! meeting in the default handler (browser or native client) and starts display capture using
//! preferences synced from the React settings store.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};

use crate::start_capture_session_inner;
use crate::CaptureStartOptions;

static BOT_SERVER_TASK: Mutex<Option<tauri::async_runtime::JoinHandle<()>>> = Mutex::new(None);

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BotEndpointConfig {
    pub enabled: bool,
    pub port: u16,
    pub secret: String,
}

impl Default for BotEndpointConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            port: 18765,
            secret: String::new(),
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BotCapturePrefs {
    pub audio_input_specs: Vec<String>,
    pub sample_rate: u32,
    pub channels: u8,
    pub frame_interval_sec: u64,
    pub capture_display_index: u32,
    pub silent_capture_minimize_main: bool,
}

impl Default for BotCapturePrefs {
    fn default() -> Self {
        Self {
            audio_input_specs: vec!["none:0".to_string()],
            sample_rate: 16000,
            channels: 1,
            frame_interval_sec: 2,
            capture_display_index: 1,
            silent_capture_minimize_main: true,
        }
    }
}

fn scholarclaw_support_dir() -> Result<PathBuf, String> {
    let home = env::var("HOME").map_err(|_| "HOME is not set".to_string())?;
    Ok(PathBuf::from(home)
        .join("Library")
        .join("Application Support")
        .join("ScholarClaw"))
}

fn bot_config_path() -> Result<PathBuf, String> {
    Ok(scholarclaw_support_dir()?.join("bot_endpoint.json"))
}

fn bot_capture_prefs_path() -> Result<PathBuf, String> {
    Ok(scholarclaw_support_dir()?.join("bot_capture_prefs.json"))
}

pub fn load_bot_config() -> BotEndpointConfig {
    let path = match bot_config_path() {
        Ok(p) => p,
        Err(_) => return BotEndpointConfig::default(),
    };
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_bot_config(config: &BotEndpointConfig) -> Result<(), String> {
    let dir = scholarclaw_support_dir()?;
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create app support dir: {e}"))?;
    let path = bot_config_path()?;
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("failed to serialize bot config: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("failed to write bot config: {e}"))?;
    Ok(())
}

fn load_bot_capture_prefs() -> BotCapturePrefs {
    let path = match bot_capture_prefs_path() {
        Ok(p) => p,
        Err(_) => return BotCapturePrefs::default(),
    };
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn sync_bot_capture_prefs_file(prefs: &BotCapturePrefs) -> Result<(), String> {
    let dir = scholarclaw_support_dir()?;
    fs::create_dir_all(&dir).map_err(|e| format!("failed to create app support dir: {e}"))?;
    let path = bot_capture_prefs_path()?;
    let json = serde_json::to_string_pretty(prefs)
        .map_err(|e| format!("failed to serialize bot capture prefs: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("failed to write bot capture prefs: {e}"))?;
    Ok(())
}

fn open_meeting_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("open")
            .arg(url)
            .status()
            .map_err(|e| format!("failed to run open: {e}"))?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("open exited with status {status}"))
        }
    }
    #[cfg(target_os = "windows")]
    {
        let status = std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .status()
            .map_err(|e| format!("failed to run start: {e}"))?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("start exited with status {status}"))
        }
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let status = std::process::Command::new("xdg-open")
            .arg(url)
            .status()
            .map_err(|e| format!("failed to run xdg-open: {e}"))?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("xdg-open exited with status {status}"))
        }
    }
}

fn validate_meeting_url(url: &str) -> Result<(), String> {
    let t = url.trim();
    if t.is_empty() {
        return Err("meetingUrl is empty".to_string());
    }
    if t.len() > 4096 {
        return Err("meetingUrl is too long".to_string());
    }
    if !(t.starts_with("https://") || t.starts_with("http://")) {
        return Err("meetingUrl must start with http:// or https://".to_string());
    }
    Ok(())
}

fn verify_secret(config: &BotEndpointConfig, headers: &HeaderMap, body_secret: Option<&str>) -> bool {
    let expected = config.secret.trim();
    if expected.is_empty() {
        return true;
    }
    if let Some(auth) = headers.get(axum::http::header::AUTHORIZATION) {
        if let Ok(s) = auth.to_str() {
            if let Some(tok) = s.strip_prefix("Bearer ") {
                if tok.trim() == expected {
                    return true;
                }
            }
        }
    }
    body_secret.map(|s| s == expected).unwrap_or(false)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MeetingPostBody {
    meeting_url: String,
    secret: Option<String>,
}

#[derive(Clone)]
struct HttpState {
    app: AppHandle,
}

async fn health_handler() -> impl IntoResponse {
    (StatusCode::OK, "ok")
}

async fn meeting_handler(
    State(state): State<HttpState>,
    headers: HeaderMap,
    Json(body): Json<MeetingPostBody>,
) -> Response {
    let config = load_bot_config();
    if !verify_secret(&config, &headers, body.secret.as_deref()) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "ok": false, "error": "unauthorized" })),
        )
            .into_response();
    }

    if let Err(e) = validate_meeting_url(&body.meeting_url) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "ok": false, "error": e })),
        )
            .into_response();
    }

    let app = state.app.clone();
    let url = body.meeting_url.trim().to_string();

    let result = thread::spawn(move || {
        open_meeting_url(&url)?;
        thread::sleep(Duration::from_millis(400));
        let prefs = load_bot_capture_prefs();
        let options = CaptureStartOptions {
            audio_input_specs: prefs.audio_input_specs.clone(),
            sample_rate: Some(prefs.sample_rate),
            channels: Some(prefs.channels),
            frame_interval_sec: Some(prefs.frame_interval_sec),
        };
        let display_idx = prefs.capture_display_index.max(1);
        let session_id = start_capture_session_inner(
            app.clone(),
            Some(options),
            None,
            Some(display_idx),
            Some(true),
        )?;
        if prefs.silent_capture_minimize_main {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.minimize();
            }
        }
        let _ = app.emit(
            "bot-capture-started",
            json!({ "sessionId": session_id.clone() }),
        );
        Ok::<String, String>(session_id)
    })
    .join();

    match result {
        Ok(Ok(session_id)) => (
            StatusCode::OK,
            Json(json!({ "ok": true, "sessionId": session_id })),
        )
            .into_response(),
        Ok(Err(e)) => {
            let code = if e.contains("already running") {
                StatusCode::CONFLICT
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            };
            (code, Json(json!({ "ok": false, "error": e }))).into_response()
        }
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "ok": false, "error": "join failed" })),
        )
            .into_response(),
    }
}

async fn run_server(app: AppHandle, port: u16) {
    let state = HttpState { app };
    let app_router = Router::new()
        .route("/health", get(health_handler))
        .route("/v1/meeting", post(meeting_handler))
        .with_state(state);

    let addr = format!("127.0.0.1:{port}");
    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("ScholarClaw bot endpoint: bind {addr} failed: {e}");
            return;
        }
    };

    eprintln!("ScholarClaw bot endpoint listening on http://{addr}");
    if let Err(e) = axum::serve(listener, app_router.into_make_service()).await {
        eprintln!("ScholarClaw bot endpoint server error: {e}");
    }
}

/// Stops the background server if running.
pub fn stop_bot_http_server() {
    let handle = BOT_SERVER_TASK.lock().ok().and_then(|mut g| g.take());
    if let Some(h) = handle {
        h.abort();
    }
}

/// Starts the local HTTP server if `config.enabled` is true. Binds `127.0.0.1:config.port`.
pub fn start_bot_http_server(app: AppHandle) -> Result<(), String> {
    stop_bot_http_server();
    let config = load_bot_config();
    if !config.enabled {
        return Ok(());
    }
    if config.port < 1024 {
        return Err("bot endpoint port must be >= 1024".to_string());
    }

    let handle = app.clone();
    let join = tauri::async_runtime::spawn(async move {
        run_server(handle, config.port).await;
    });
    {
        let mut guard = BOT_SERVER_TASK
            .lock()
            .map_err(|_| "bot task mutex poisoned".to_string())?;
        *guard = Some(join);
    }
    Ok(())
}

pub fn bot_endpoint_base_url() -> String {
    let c = load_bot_config();
    format!("http://127.0.0.1:{}", c.port)
}

/// True while the async task for the local HTTP server is active.
pub fn is_bot_server_running() -> bool {
    BOT_SERVER_TASK
        .lock()
        .ok()
        .map(|g| g.is_some())
        .unwrap_or(false)
}
