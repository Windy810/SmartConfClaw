//! Joining online meetings: turn a pasted link (or a whole invitation text) into the native
//! client deep link, open it, find the meeting window that appears and start background capture
//! of that window. Used by the "Join meeting" UI, scheduled meetings and the bot HTTP endpoint.

use std::collections::HashSet;
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};

use crate::mac_helper::{self, WindowInfo};
use crate::{start_capture_session_inner, CaptureStartOptions, CaptureWindowTarget};

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MeetingLink {
    pub platform: String,
    pub web_url: String,
    /// Deep link that opens the desktop client directly (skips the browser landing page).
    pub native_url: Option<String>,
}

/// Picks the meeting URL out of free text (e.g. a pasted calendar invitation).
pub fn extract_meeting_url(text: &str) -> Option<String> {
    let mut candidates: Vec<String> = Vec::new();
    for raw in text.split(|c: char| c.is_whitespace() || "<>\"'()[]{}，。；".contains(c)) {
        // A link may be glued to text, e.g. "会议链接：https://…" (full-width colon).
        let lower = raw.to_ascii_lowercase();
        let start = ["https://", "http://", "zoommtg://", "msteams:"]
            .iter()
            .filter_map(|scheme| lower.find(scheme))
            .min();
        if let Some(start) = start {
            let token = raw[start..].trim_end_matches(['.', ',', ';', ':', '!', '?']);
            candidates.push(token.to_string());
        }
    }
    candidates
        .iter()
        .find(|u| platform_for_host(&split_url(u).1) != "web")
        .or_else(|| candidates.first())
        .cloned()
}

/// (scheme, host, path, query) without pulling in a URL crate; good enough for meeting links.
fn split_url(url: &str) -> (String, String, String, String) {
    let (scheme, rest) = match url.find("://") {
        Some(i) => (url[..i].to_lowercase(), &url[i + 3..]),
        None => match url.find(':') {
            Some(i) => (url[..i].to_lowercase(), &url[i + 1..]),
            None => (String::new(), url),
        },
    };
    let rest = rest.split('#').next().unwrap_or("");
    let (before_query, query) = match rest.find('?') {
        Some(i) => (&rest[..i], &rest[i + 1..]),
        None => (rest, ""),
    };
    let (host, path) = match before_query.find('/') {
        Some(i) => (&before_query[..i], &before_query[i..]),
        None => (before_query, ""),
    };
    (
        scheme,
        host.to_lowercase(),
        path.to_string(),
        query.to_string(),
    )
}

fn query_param<'a>(query: &'a str, key: &str) -> Option<&'a str> {
    query.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=')?;
        (k == key && !v.is_empty()).then_some(v)
    })
}

fn platform_for_host(host: &str) -> &'static str {
    let h = host.to_lowercase();
    if h.ends_with("zoom.us") || h.ends_with("zoom.com") || h.ends_with("zoom.com.cn") {
        "zoom"
    } else if h.ends_with("teams.microsoft.com") || h.ends_with("teams.live.com") {
        "teams"
    } else if h == "meet.google.com" {
        "meet"
    } else if h.ends_with("meeting.tencent.com") || h.ends_with("voovmeeting.com") {
        "tencent"
    } else if h.ends_with("webex.com") {
        "webex"
    } else if h.ends_with("feishu.cn") || h.ends_with("larksuite.com") {
        "feishu"
    } else if h.ends_with("dingtalk.com") {
        "dingtalk"
    } else {
        "web"
    }
}

pub fn analyze_meeting_link(url: &str) -> MeetingLink {
    let url = url.trim().to_string();
    let (scheme, host, path, query) = split_url(&url);
    if scheme == "zoommtg" {
        return MeetingLink {
            platform: "zoom".into(),
            web_url: url.clone(),
            native_url: Some(url),
        };
    }
    if scheme == "msteams" {
        return MeetingLink {
            platform: "teams".into(),
            web_url: url.clone(),
            native_url: Some(url),
        };
    }
    let platform = platform_for_host(&host);
    let native_url = match platform {
        "zoom" => {
            // https://<sub>.zoom.us/j/<id>?pwd=… (also /w/ webinars and /s/ start links)
            let mut parts = path.trim_matches('/').split('/');
            match (parts.next(), parts.next()) {
                (Some("j" | "w" | "s"), Some(id)) if id.chars().all(|c| c.is_ascii_digit()) => {
                    let mut native = format!("zoommtg://{host}/join?action=join&confno={id}");
                    for key in ["pwd", "tk", "uname"] {
                        if let Some(v) = query_param(&query, key) {
                            native.push_str(&format!("&{key}={v}"));
                        }
                    }
                    Some(native)
                }
                _ => None,
            }
        }
        "teams" if host.ends_with("teams.microsoft.com") && path.starts_with("/l/") => {
            let mut native = format!("msteams:{path}");
            if !query.is_empty() {
                native.push('?');
                native.push_str(&query);
            }
            Some(native)
        }
        _ => None,
    };
    MeetingLink {
        platform: platform.to_string(),
        web_url: url,
        native_url,
    }
}

fn app_platform(app: &str, bundle_id: &str) -> Option<&'static str> {
    let a = app.to_lowercase();
    let b = bundle_id.to_lowercase();
    if a.contains("zoom") || b.starts_with("us.zoom") {
        Some("zoom")
    } else if a.contains("teams") || b.contains("teams") {
        Some("teams")
    } else if a.contains("腾讯会议")
        || a.contains("tencentmeeting")
        || a.contains("wemeet")
        || a.contains("voov")
        || b.contains("tencent.meeting")
    {
        Some("tencent")
    } else if a.contains("webex") || b.contains("webex") {
        Some("webex")
    } else if a.contains("飞书") || a.contains("feishu") || a.contains("lark") {
        Some("feishu")
    } else if a.contains("钉钉") || a.contains("dingtalk") {
        Some("dingtalk")
    } else {
        None
    }
}

fn is_browser(app: &str) -> bool {
    let a = app.to_lowercase();
    [
        "chrome", "safari", "edge", "firefox", "arc", "brave", "opera", "vivaldi", "chromium",
    ]
    .iter()
    .any(|b| a.contains(b))
}

/// Heuristic "is this the meeting window" score; higher is better, ≥ 4 is a good candidate.
pub fn score_meeting_window(
    w: &WindowInfo,
    new_ids: Option<&HashSet<u32>>,
    platform_hint: &str,
) -> i32 {
    let title = w.title.to_lowercase();
    let mut score = 0;
    let app_kind = app_platform(&w.app, &w.bundle_id);
    if let Some(kind) = app_kind {
        score += 3;
        if kind == platform_hint {
            score += 1;
        }
    }
    let meeting_words = [
        "meeting",
        "webinar",
        "会议",
        "研讨会",
        "通话",
        "call",
        "meet -",
        "meet –",
        "google meet",
    ];
    if meeting_words.iter().any(|k| title.contains(k)) {
        score += 2;
    }
    if is_browser(&w.app)
        && [
            "meet", "zoom", "teams", "webex", "会议", "腾讯", "飞书", "lark",
        ]
        .iter()
        .any(|k| title.contains(k))
    {
        score += 3;
    }
    // Client home/launcher windows are not the meeting.
    if app_kind.is_some()
        && (title == "zoom" || title.starts_with("zoom workplace") || title.is_empty())
    {
        score -= 2;
    }
    if let Some(ids) = new_ids {
        if ids.contains(&w.id) {
            score += 2;
        }
    }
    if w.width >= 640.0 && w.height >= 400.0 {
        score += 1;
    }
    if w.width < 420.0 || w.height < 300.0 {
        score -= 5;
    }
    if !w.on_screen {
        score -= 1;
    }
    score
}

pub fn best_meeting_window<'a>(
    windows: &'a [WindowInfo],
    new_ids: Option<&HashSet<u32>>,
    platform_hint: &str,
    min_score: i32,
) -> Option<&'a WindowInfo> {
    windows
        .iter()
        .map(|w| (score_meeting_window(w, new_ids, platform_hint), w))
        .filter(|(s, _)| *s >= min_score)
        .max_by(|a, b| {
            a.0.cmp(&b.0)
                .then((a.1.width * a.1.height).total_cmp(&(b.1.width * b.1.height)))
        })
        .map(|(_, w)| w)
}

/// After the captured window disappeared (closed / recreated by the client): find its successor.
pub fn reresolve_window(target: &CaptureWindowTarget) -> Option<WindowInfo> {
    if target.app.trim().is_empty() {
        return None;
    }
    let windows = mac_helper::list_windows().ok()?;
    let same_app: Vec<WindowInfo> = windows
        .into_iter()
        .filter(|w| {
            w.app.eq_ignore_ascii_case(&target.app) && w.width >= 420.0 && w.height >= 300.0
        })
        .collect();
    if let Some(exact) = same_app
        .iter()
        .find(|w| !target.title.is_empty() && w.title == target.title)
    {
        return Some(exact.clone());
    }
    let hint = app_platform(&target.app, "").unwrap_or("web");
    best_meeting_window(&same_app, None, hint, 4).cloned()
}

pub fn open_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut c = std::process::Command::new("open");
        c.arg(url);
        c
    };
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", "start", "", url]);
        c
    };
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let mut command = {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(url);
        c
    };
    let status = command
        .status()
        .map_err(|e| format!("failed to open link: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("opening the link exited with status {status}"))
    }
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinMeetingRequest {
    /// A meeting link or a whole invitation text containing one.
    pub meeting: String,
    pub capture: CaptureStartOptions,
    /// Display to record if no meeting window can be found (1-based).
    #[serde(default)]
    pub fallback_display_index: Option<u32>,
    #[serde(default)]
    pub wait_window_sec: Option<u64>,
    #[serde(default)]
    pub minimize_main: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinMeetingResult {
    pub session_id: String,
    pub platform: String,
    /// "window" when the meeting window was found, otherwise "display".
    pub captured: String,
    pub window_title: String,
}

fn emit_status(app: &AppHandle, stage: &str, message: &str) {
    let _ = app.emit("join-status", json!({ "stage": stage, "message": message }));
}

fn platform_label(platform: &str) -> &'static str {
    match platform {
        "zoom" => "Zoom",
        "teams" => "Teams",
        "meet" => "Google Meet",
        "tencent" => "Tencent Meeting",
        "webex" => "Webex",
        "feishu" => "Feishu",
        "dingtalk" => "DingTalk",
        _ => "Online",
    }
}

/// Blocking: opens the meeting, waits for its window and starts capture. Run off the main thread.
pub fn join_meeting_and_capture(
    app: &AppHandle,
    req: JoinMeetingRequest,
) -> Result<JoinMeetingResult, String> {
    let url = extract_meeting_url(&req.meeting)
        .ok_or_else(|| "No meeting link (https://…) found in the text.".to_string())?;
    let link = analyze_meeting_link(&url);

    let before: Option<HashSet<u32>> = mac_helper::list_windows()
        .ok()
        .map(|ws| ws.into_iter().map(|w| w.id).collect());

    emit_status(
        app,
        "opening",
        &format!("Opening {} meeting…", platform_label(&link.platform)),
    );
    let opened_native = match &link.native_url {
        Some(native) => open_url(native).is_ok(),
        None => false,
    };
    if !opened_native {
        open_url(&link.web_url)?;
    }

    let mut target: Option<WindowInfo> = None;
    if let Some(before_ids) = before.as_ref() {
        emit_status(app, "waiting", "Waiting for the meeting window…");
        let wait = Duration::from_secs(req.wait_window_sec.unwrap_or(90).clamp(10, 600));
        let deadline = Instant::now() + wait;
        while Instant::now() < deadline {
            thread::sleep(Duration::from_millis(1500));
            let Ok(windows) = mac_helper::list_windows() else {
                break;
            };
            let new_ids: HashSet<u32> = windows
                .iter()
                .map(|w| w.id)
                .filter(|id| !before_ids.contains(id))
                .collect();
            if best_meeting_window(&windows, Some(&new_ids), &link.platform, 5).is_some() {
                // Clients often show a "connecting…" window first; let it settle and re-pick.
                thread::sleep(Duration::from_millis(2500));
                let windows = mac_helper::list_windows().unwrap_or(windows);
                let new_ids: HashSet<u32> = windows
                    .iter()
                    .map(|w| w.id)
                    .filter(|id| !before_ids.contains(id))
                    .collect();
                target = best_meeting_window(&windows, Some(&new_ids), &link.platform, 5).cloned();
                if target.is_some() {
                    break;
                }
            }
        }
    } else {
        // No window listing (helper unavailable): give the client time to come up.
        thread::sleep(Duration::from_secs(8));
    }

    let mut capture = req.capture.clone();
    if capture
        .title
        .as_deref()
        .map(str::trim)
        .unwrap_or("")
        .is_empty()
    {
        capture.title = Some(format!("{} meeting", platform_label(&link.platform)));
    }
    if capture.auto_stop_on_window_close.is_none() {
        capture.auto_stop_on_window_close = Some(true);
    }

    let (window_target, display, captured, window_title) = match &target {
        Some(w) => (
            Some(CaptureWindowTarget {
                window_id: w.id,
                app: w.app.clone(),
                title: w.title.clone(),
            }),
            None,
            "window",
            w.title.clone(),
        ),
        None => {
            emit_status(
                app,
                "fallback",
                "Meeting window not found — recording the whole display instead.",
            );
            (
                None,
                Some(req.fallback_display_index.unwrap_or(1).max(1)),
                "display",
                String::new(),
            )
        }
    };

    let session_id =
        start_capture_session_inner(app.clone(), Some(capture), None, display, window_target)?;

    if req.minimize_main {
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.minimize();
        }
    }
    emit_status(app, "recording", &format!("Recording {session_id}"));
    Ok(JoinMeetingResult {
        session_id,
        platform: link.platform,
        captured: captured.to_string(),
        window_title,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zoom_link_becomes_deep_link() {
        let l = analyze_meeting_link("https://us02web.zoom.us/j/81234567890?pwd=AbC123.1");
        assert_eq!(l.platform, "zoom");
        assert_eq!(
            l.native_url.as_deref(),
            Some("zoommtg://us02web.zoom.us/join?action=join&confno=81234567890&pwd=AbC123.1")
        );
    }

    #[test]
    fn teams_link_becomes_deep_link() {
        let l = analyze_meeting_link(
            "https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7b%7d",
        );
        assert_eq!(l.platform, "teams");
        assert_eq!(
            l.native_url.as_deref(),
            Some("msteams:/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7b%7d")
        );
    }

    #[test]
    fn other_links_open_in_browser() {
        let l = analyze_meeting_link("https://meet.google.com/abc-defg-hij");
        assert_eq!(l.platform, "meet");
        assert!(l.native_url.is_none());
        let l = analyze_meeting_link("https://meeting.tencent.com/dm/AbCdEf");
        assert_eq!(l.platform, "tencent");
    }

    #[test]
    fn url_extracted_from_invitation() {
        let invite = "Join Zoom Meeting\nhttps://example.com/agenda\nhttps://zoom.us/j/123456789?pwd=xyz\nMeeting ID: 123 456 789";
        assert_eq!(
            extract_meeting_url(invite).as_deref(),
            Some("https://zoom.us/j/123456789?pwd=xyz")
        );
        assert_eq!(
            extract_meeting_url("会议链接：https://meeting.tencent.com/dm/abc。").as_deref(),
            Some("https://meeting.tencent.com/dm/abc")
        );
        assert!(extract_meeting_url("no link here").is_none());
    }

    fn win(id: u32, app: &str, title: &str, w: f64, h: f64) -> WindowInfo {
        WindowInfo {
            id,
            pid: 1,
            app: app.into(),
            bundle_id: String::new(),
            title: title.into(),
            x: 0.0,
            y: 0.0,
            width: w,
            height: h,
            on_screen: true,
        }
    }

    #[test]
    fn picks_meeting_window_over_home_window() {
        let windows = vec![
            win(1, "zoom.us", "Zoom Workplace", 900.0, 600.0),
            win(2, "zoom.us", "Zoom Meeting", 1280.0, 800.0),
            win(3, "Safari", "Docs", 1400.0, 900.0),
            win(4, "zoom.us", "", 300.0, 200.0),
        ];
        let new_ids: HashSet<u32> = [2, 4].into_iter().collect();
        let best = best_meeting_window(&windows, Some(&new_ids), "zoom", 5).unwrap();
        assert_eq!(best.id, 2);
    }

    #[test]
    fn browser_meet_tab_is_a_candidate() {
        let windows = vec![
            win(1, "Google Chrome", "Meet - abc-defg-hij", 1400.0, 900.0),
            win(2, "Finder", "Downloads", 800.0, 500.0),
        ];
        let best = best_meeting_window(&windows, None, "meet", 4).unwrap();
        assert_eq!(best.id, 1);
    }
}
