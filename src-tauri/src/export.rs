//! Markdown export of a session ("meeting minutes"): metadata, AI summary and minutes, slides with
//! the transcript spoken while each slide was on screen, concepts, references and Q&A.
//! Screenshots are copied next to the `.md` file into `<name>_assets/`.

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::asr::{self, TranscriptSegment};
use crate::{
    collect_frame_paths, read_capture_meta, read_frame_offsets_map, resolve_timeline_offset_sec,
};

pub fn format_clock(sec: f64) -> String {
    let total = if sec.is_finite() && sec > 0.0 {
        sec.round() as u64
    } else {
        0
    };
    let (h, m, s) = (total / 3600, (total % 3600) / 60, total % 60);
    if h > 0 {
        format!("{h}:{m:02}:{s:02}")
    } else {
        format!("{m:02}:{s:02}")
    }
}

fn read_json(dir: &Path, name: &str) -> Value {
    fs::read_to_string(dir.join(name))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Null)
}

fn str_field<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("").trim()
}

fn string_list(v: &Value) -> Vec<String> {
    v.as_array()
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(|s| s.trim().to_string()))
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

/// Escape characters that would break a single-line Markdown list item / table cell.
fn inline(s: &str) -> String {
    s.replace('\n', " ").replace('|', "\\|").trim().to_string()
}

struct Labels {
    date: &'static str,
    duration: &'static str,
    session: &'static str,
    tags: &'static str,
    summary: &'static str,
    minutes: &'static str,
    key_points: &'static str,
    decisions: &'static str,
    action_items: &'static str,
    open_questions: &'static str,
    owner: &'static str,
    due: &'static str,
    slides: &'static str,
    slide: &'static str,
    concepts: &'static str,
    references: &'static str,
    qa: &'static str,
    transcript: &'static str,
    no_speech: &'static str,
}

const EN: Labels = Labels {
    date: "Date",
    duration: "Duration",
    session: "Session",
    tags: "Tags",
    summary: "Summary",
    minutes: "Minutes",
    key_points: "Key points",
    decisions: "Decisions",
    action_items: "Action items",
    open_questions: "Open questions",
    owner: "owner",
    due: "due",
    slides: "Slides & notes",
    slide: "Slide",
    concepts: "Key concepts",
    references: "Related reading",
    qa: "Q&A practice",
    transcript: "Transcript",
    no_speech: "(no speech transcribed for this slide)",
};

const ZH: Labels = Labels {
    date: "日期",
    duration: "时长",
    session: "会话",
    tags: "标签",
    summary: "摘要",
    minutes: "会议纪要",
    key_points: "要点",
    decisions: "结论 / 决定",
    action_items: "待办事项",
    open_questions: "待解决问题",
    owner: "负责人",
    due: "截止",
    slides: "幻灯片与讲解",
    slide: "幻灯片",
    concepts: "核心概念",
    references: "延伸阅读",
    qa: "问答练习",
    transcript: "转写全文",
    no_speech: "（该页没有转写到语音）",
};

pub struct MarkdownExport {
    pub markdown: String,
    /// (source screenshot, file name inside the assets folder)
    pub images: Vec<(PathBuf, String)>,
}

pub fn build_session_markdown(
    session_id: &str,
    dir: &Path,
    assets_dir_name: &str,
    date_label: &str,
    language: &str,
) -> MarkdownExport {
    let l = if language == "zh" { &ZH } else { &EN };
    let meta = read_capture_meta(&dir.to_path_buf());
    let mind_map = read_json(dir, "mind_map.json");
    let title = meta
        .title
        .clone()
        .filter(|t| !t.trim().is_empty())
        .or_else(|| {
            let topic = str_field(&mind_map, "topic");
            (!topic.is_empty()).then(|| topic.to_string())
        })
        .unwrap_or_else(|| session_id.to_string());

    let frames = collect_frame_paths(&dir.to_path_buf());
    let offsets = read_frame_offsets_map(&dir.to_path_buf());
    let interval = meta.frame_interval_sec.max(1);
    let frame_times: Vec<f64> = frames
        .iter()
        .enumerate()
        .map(|(i, p)| resolve_timeline_offset_sec(p, i, &offsets, interval))
        .collect();
    let segments = asr::read_segments(dir);
    let duration = meta
        .duration_sec
        .or_else(|| frame_times.last().copied())
        .or_else(|| segments.last().map(|s| s.end_sec))
        .unwrap_or(0.0);

    let mut md = String::new();
    md.push_str(&format!("# {}\n\n", inline(&title)));
    if !date_label.trim().is_empty() {
        md.push_str(&format!("- **{}:** {}\n", l.date, date_label.trim()));
    }
    if duration > 0.0 {
        md.push_str(&format!(
            "- **{}:** {}\n",
            l.duration,
            format_clock(duration)
        ));
    }
    md.push_str(&format!("- **{}:** `{}`\n", l.session, session_id));
    let tags = string_list(&read_json(dir, "tags.json"));
    if !tags.is_empty() {
        md.push_str(&format!(
            "- **{}:** {}\n",
            l.tags,
            tags.iter()
                .map(|t| format!("`{}`", inline(t)))
                .collect::<Vec<_>>()
                .join(" ")
        ));
    }
    md.push('\n');

    let summary = fs::read_to_string(dir.join("summary.txt")).unwrap_or_default();
    if !summary.trim().is_empty() {
        md.push_str(&format!("## {}\n\n{}\n\n", l.summary, summary.trim()));
    }

    let minutes = read_json(dir, "minutes.json");
    if minutes.is_object() {
        let mut body = String::new();
        for (label, key) in [
            (l.key_points, "keyPoints"),
            (l.decisions, "decisions"),
            (l.open_questions, "openQuestions"),
        ] {
            let items = string_list(minutes.get(key).unwrap_or(&Value::Null));
            if !items.is_empty() {
                body.push_str(&format!("### {label}\n\n"));
                for item in items {
                    body.push_str(&format!("- {}\n", inline(&item)));
                }
                body.push('\n');
            }
        }
        if let Some(actions) = minutes.get("actionItems").and_then(Value::as_array) {
            let lines: Vec<String> = actions
                .iter()
                .filter_map(|a| {
                    let task = str_field(a, "task");
                    if task.is_empty() {
                        return None;
                    }
                    let mut extra = Vec::new();
                    let owner = str_field(a, "owner");
                    if !owner.is_empty() {
                        extra.push(format!("{}: {}", l.owner, inline(owner)));
                    }
                    let due = str_field(a, "due");
                    if !due.is_empty() {
                        extra.push(format!("{}: {}", l.due, inline(due)));
                    }
                    let suffix = if extra.is_empty() {
                        String::new()
                    } else {
                        format!(" ({})", extra.join(", "))
                    };
                    Some(format!("- [ ] {}{}\n", inline(task), suffix))
                })
                .collect();
            if !lines.is_empty() {
                body.push_str(&format!("### {}\n\n{}\n", l.action_items, lines.concat()));
            }
        }
        if !body.is_empty() {
            md.push_str(&format!("## {}\n\n{}", l.minutes, body));
        }
    }

    let mut images = Vec::new();
    if !frames.is_empty() {
        md.push_str(&format!("## {}\n\n", l.slides));
        for (i, path) in frames.iter().enumerate() {
            let start = frame_times[i];
            let end = frame_times.get(i + 1).copied().unwrap_or(f64::INFINITY);
            let file_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("frame.png")
                .to_string();
            md.push_str(&format!(
                "### [{}] {} {}\n\n![{} {}]({}/{})\n\n",
                format_clock(start),
                l.slide,
                i + 1,
                l.slide,
                i + 1,
                assets_dir_name,
                file_name
            ));
            images.push((path.clone(), file_name));
            if !segments.is_empty() {
                let spoken: Vec<&TranscriptSegment> = segments
                    .iter()
                    .filter(|s| {
                        let mid = (s.start_sec + s.end_sec) / 2.0;
                        (i == 0 && mid < start) || (mid >= start && mid < end)
                    })
                    .collect();
                if spoken.is_empty() {
                    md.push_str(&format!("> {}\n\n", l.no_speech));
                } else {
                    for s in spoken {
                        md.push_str(&format!(
                            "> **[{}]** {}\n>\n",
                            format_clock(s.start_sec),
                            inline(&s.text)
                        ));
                    }
                    md.push('\n');
                }
            }
        }
    }

    let concepts = read_json(dir, "concepts.json");
    if let Some(arr) = concepts.as_array().filter(|a| !a.is_empty()) {
        md.push_str(&format!("## {}\n\n", l.concepts));
        for c in arr {
            let term = str_field(c, "term");
            if !term.is_empty() {
                md.push_str(&format!(
                    "- **{}** — {}\n",
                    inline(term),
                    inline(str_field(c, "definition"))
                ));
            }
        }
        md.push('\n');
    }

    let refs = read_json(dir, "references.json");
    if let Some(arr) = refs.as_array().filter(|a| !a.is_empty()) {
        md.push_str(&format!("## {}\n\n", l.references));
        for r in arr {
            let title = inline(str_field(r, "title"));
            if title.is_empty() {
                continue;
            }
            let url = str_field(r, "url");
            let head = if url.is_empty() {
                title
            } else {
                format!("[{title}]({url})")
            };
            let meta: Vec<String> = ["authors", "venue", "year"]
                .iter()
                .map(|k| inline(str_field(r, k)))
                .filter(|s| !s.is_empty())
                .collect();
            md.push_str(&format!("- {head}"));
            if !meta.is_empty() {
                md.push_str(&format!(" — {}", meta.join(", ")));
            }
            let relevance = str_field(r, "relevance");
            if !relevance.is_empty() {
                md.push_str(&format!("  \n  {}", inline(relevance)));
            }
            md.push('\n');
        }
        md.push('\n');
    }

    let qa = read_json(dir, "qa.json");
    if let Some(arr) = qa.as_array().filter(|a| !a.is_empty()) {
        md.push_str(&format!("## {}\n\n", l.qa));
        for (i, q) in arr.iter().enumerate() {
            md.push_str(&format!(
                "{}. **{}**\n",
                i + 1,
                inline(str_field(q, "question"))
            ));
            for p in string_list(q.get("suggestedAnswerPoints").unwrap_or(&Value::Null)) {
                md.push_str(&format!("   - {}\n", inline(&p)));
            }
        }
        md.push('\n');
    }

    // With timestamped segments the transcript already appears under each slide.
    if segments.is_empty() || frames.is_empty() {
        let transcript = if segments.is_empty() {
            fs::read_to_string(dir.join("transcript.txt")).unwrap_or_default()
        } else {
            segments
                .iter()
                .map(|s| format!("**[{}]** {}", format_clock(s.start_sec), s.text.trim()))
                .collect::<Vec<_>>()
                .join("\n\n")
        };
        if !transcript.trim().is_empty() {
            md.push_str(&format!("## {}\n\n{}\n", l.transcript, transcript.trim()));
        }
    }

    MarkdownExport {
        markdown: md,
        images,
    }
}

/// Writes `<output>.md` plus `<stem>_assets/` with the screenshots. Returns the Markdown path.
pub fn export_session_markdown(
    session_id: &str,
    dir: &Path,
    output_path: &Path,
    date_label: &str,
    language: &str,
) -> Result<PathBuf, String> {
    let mut output = output_path.to_path_buf();
    if output
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        != Some("md".into())
    {
        output.set_extension("md");
    }
    let stem = output
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("meeting")
        .to_string();
    let assets_name = format!("{stem}_assets");
    let parent = output
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));

    let export = build_session_markdown(session_id, dir, &assets_name, date_label, language);
    if !export.images.is_empty() {
        let assets_dir = parent.join(&assets_name);
        fs::create_dir_all(&assets_dir)
            .map_err(|e| format!("failed to create assets folder: {e}"))?;
        for (src, name) in &export.images {
            fs::copy(src, assets_dir.join(name))
                .map_err(|e| format!("failed to copy screenshot {name}: {e}"))?;
        }
    }
    fs::write(&output, export.markdown.as_bytes())
        .map_err(|e| format!("failed to write Markdown file: {e}"))?;
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clock_format() {
        assert_eq!(format_clock(0.0), "00:00");
        assert_eq!(format_clock(65.4), "01:05");
        assert_eq!(format_clock(3725.0), "1:02:05");
    }

    #[test]
    fn markdown_contains_minutes_slides_and_transcript() {
        let dir = std::env::temp_dir().join(format!("scc-export-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("screen-start.png"), b"png").unwrap();
        fs::write(dir.join("frame-000001.png"), b"png").unwrap();
        fs::write(
            dir.join("frame_offsets.jsonl"),
            "{\"frame\":\"frame-000001.png\",\"offsetSec\":60.0}\n",
        )
        .unwrap();
        fs::write(
            dir.join("capture_meta.json"),
            "{\"frameIntervalSec\":2,\"title\":\"Attention Is All You Need\"}",
        )
        .unwrap();
        fs::write(dir.join("summary.txt"), "A talk about transformers.").unwrap();
        fs::write(
            dir.join("minutes.json"),
            r#"{"keyPoints":["Self-attention"],"actionItems":[{"task":"Read the paper","owner":"me","due":""}]}"#,
        )
        .unwrap();
        fs::write(
            dir.join("transcript_segments.jsonl"),
            "{\"index\":0,\"startSec\":5.0,\"endSec\":15.0,\"text\":\"Intro words\"}\n{\"index\":1,\"startSec\":62.0,\"endSec\":72.0,\"text\":\"Second slide words\"}\n",
        )
        .unwrap();

        let out =
            build_session_markdown("session-1", &dir, "notes_assets", "2026-10-30 10:00", "en");
        let md = out.markdown;
        assert!(md.starts_with("# Attention Is All You Need"));
        assert!(md.contains("## Summary"));
        assert!(md.contains("- [ ] Read the paper (owner: me)"));
        assert!(md.contains("![Slide 1](notes_assets/screen-start.png)"));
        let first = md.find("Intro words").unwrap();
        let second_slide = md.find("### [01:00] Slide 2").unwrap();
        let second_words = md.find("Second slide words").unwrap();
        assert!(first < second_slide && second_slide < second_words);
        assert_eq!(out.images.len(), 2);
        let _ = fs::remove_dir_all(&dir);
    }
}
