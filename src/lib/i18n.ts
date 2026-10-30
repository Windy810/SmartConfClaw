import { type AppLanguage, useSettingsStore } from "../store/settingsStore";

const en = {
	// Nav
	"nav.capture": "Meeting Capture",
	"nav.graph": "Knowledge Graph",
	"nav.qa": "Q&A Simulator",
	"nav.settings": "Settings",
	"app.subtitle": "ScholarClaw · AI research copilot",

	// Capture toolbar
	"capture.capturing": "Capturing",
	"capture.idle": "Idle",
	"capture.browseSessions": "Browse Sessions",
	"capture.hideSessions": "Hide Sessions",
	"capture.syncSession": "Sync Session",
	"capture.sessionSynced": "Session synced: {id}",
	"capture.syncFailedAfterStop": "Capture stopped, but failed to load session.",
	"capture.transcribe": "Transcribe",
	"capture.refineTranscriptVisual": "Fix transcript (visual)",
	"capture.refineTranscriptVisualHint":
		"Uses OpenRouter with sampled screenshots to correct ASR errors (terms, slide text). Needs transcript.txt + frames. Backup: transcript.pre-visual-refine.backup.txt",
	"capture.generateAi": "Generate AI",
	"capture.stop": "Stop",
	"capture.startCapture": "Start Capture",
	"capture.ready": "Ready to capture",
	"capture.sourceMode": "Capture source",
	"capture.sourceRegion": "Region (overlay)",
	"capture.sourceDisplay": "Full-screen desktop (per monitor)",
	"capture.sourceDisplaySub":
		"Targets the physical screen. After you full-screen an app, macOS puts it on its own Space; we capture whatever is currently shown on that monitor.",
	"capture.selectDisplay": "Display",
	"capture.refreshDisplays": "Refresh",
	"capture.silentHint":
		"A compact floating bar stays on top (all desktops); use Pause/Stop there. macOS may show the screen-recording indicator.",
	"capture.fullscreenSpaceExplainer":
		"On macOS, a full-screen app uses a separate Space (Mission Control “desktop”). This mode records the monitor’s current pixels each interval—so stay on the Space you want, or use a second monitor for slides while you work on the other screen. Switching Spaces on the same monitor changes what is recorded.",
	"capture.minimizeOnStart": "Minimize app when capture starts",
	"capture.backgroundStarted": "Recording started: {id}",
	"capture.botStarted": "Capture started from bot: {id}",
	"capture.noDisplays":
		"No displays found. Click Refresh or check Screen Recording permission.",

	// Capture: sources, audio, live transcript
	"capture.sourceWindow": "Meeting window (background)",
	"capture.selectWindow": "Window",
	"capture.windowAuto": "Auto-detect meeting window",
	"capture.windowOffscreen": "other Space",
	"capture.windowHint":
		"Records only this window, even while other windows cover it — keep working in other apps. Don't minimize it. If the app recreates the window (e.g. entering share view) the recorder follows it.",
	"capture.autoStopOnClose": "Stop automatically when the meeting window closes",
	"capture.windowUnavailable":
		"Window capture needs the macOS capture helper (built with Xcode command line tools).",
	"capture.audioAndTranscript": "Audio & transcript",
	"capture.systemAudio": "Record meeting audio (system sound)",
	"capture.systemAudioHint":
		"Captures what your Mac plays — Zoom, Teams, browser — directly. No BlackHole or audio routing needed; you still hear everything normally.",
	"capture.systemAudioUnavailable":
		"Needs macOS 13 or later. The input devices from Settings (e.g. BlackHole) are used instead.",
	"capture.includeMic": "Also record my microphone",
	"capture.includeMicHint":
		"Mixes in the microphones selected in Settings → Audio Inputs (for when you speak).",
	"capture.devicesUsedHint":
		"Without system audio, the input devices selected in Settings are recorded.",
	"capture.liveTranscript": "Live transcript",
	"capture.liveTranscriptHint":
		"Transcribes in small chunks while recording; captions appear here and on the floating bar. The transcript is ready when you stop.",
	"capture.liveTranscriptNoAsr":
		"Configure an ASR endpoint in Settings to enable live transcription.",
	"capture.permissionMissing":
		"Screen Recording permission is not granted yet — window capture and system audio need it.",
	"capture.permissionGrant": "Grant permission",
	"capture.noMeetingWindow":
		"No meeting window found. Open the meeting first, or pick a window from the list.",
	"capture.autoStopped": "The meeting window closed — capture stopped automatically.",
	"capture.targetLost":
		"Can't see the captured window (closed or minimized?). Waiting for it to come back…",
	"capture.transcribeProgress": "Transcribing… {done}/{total} chunks",
	"capture.transcribeHint":
		"Transcribe the recorded audio in 30-second chunks (timestamped). Not needed when live transcript was on.",
	"capture.analyzing": "Generating AI summary and minutes…",
	"capture.sessionTools": "Session",

	// Live transcript
	"live.title": "Live transcript",
	"live.listening": "Listening",
	"live.finished": "Done",
	"live.waiting":
		"Waiting for speech… the first lines appear a few seconds after someone talks.",
	"live.empty": "No speech was transcribed.",
	"live.error": "Transcription error:",
	"live.finishedMessage": "Transcript ready ({count} segments).",

	// Join meeting
	"join.title": "Join a meeting",
	"join.subtitle":
		"Paste a Zoom / Teams / Meet / Tencent Meeting link (or the whole invitation). The app opens it, finds the meeting window and starts recording in the background.",
	"join.linkPlaceholder": "https://zoom.us/j/… or paste the invitation text",
	"join.titlePlaceholder": "Title (optional), e.g. Lab seminar",
	"join.opensApp": "opens directly in the desktop app",
	"join.opensBrowser": "opens in the browser / app handler",
	"join.noLink": "No meeting link found in the text.",
	"join.joinNow": "Join & record now",
	"join.or": "or at",
	"join.schedule": "Schedule",
	"join.hint":
		"Scheduled meetings are joined one minute before start while this app is running. Tip: enable “automatically join audio by computer” in your meeting client.",
	"join.busy": "A capture is already running.",
	"join.recordingWindow": "Recording meeting window: {window}",
	"join.recordingDisplay":
		"Meeting window not found — recording the whole display instead.",
	"join.failed": "Could not join",
	"join.statusScheduled": "Scheduled",
	"join.statusJoining": "Joining…",
	"join.statusJoined": "Recorded",
	"join.statusFailed": "Failed",
	"join.statusMissed": "Missed",

	// Export
	"export.button": "Export Markdown",
	"export.hint":
		"Save meeting minutes as Markdown: summary, minutes, slides with what was said, concepts, references. Screenshots go into a folder next to the file.",
	"export.done": "Exported: {path}",
	"export.failed": "Export failed",
	"export.reveal": "Show in Finder",

	// Session picker
	"sessions.title": "Local Sessions",
	"sessions.refresh": "Refresh",
	"sessions.empty": "No local sessions found. Start a capture to create one.",
	"sessions.frames": "frames",
	"sessions.audio": "audio",
	"sessions.transcript": "transcript",
	"sessions.analyzed": "analyzed",
	"sessions.delete": "Delete",
	"sessions.deleteConfirm":
		"Delete this session? This removes local capture files and its entries from the knowledge graph index.",
	"sessions.confirmDeleteBtn": "Confirm",
	"sessions.cancelDeleteBtn": "Cancel",
	"sessions.deleteRunning": "Stop capture before deleting this session.",
	"sessions.deleteNotFound":
		"Session folder not found on disk. Check Screenshot Directory in Settings or whether files were moved.",
	"sessions.deleteFailed": "Failed to delete session",

	// SessionViewer
	"viewer.noTimeline": "No timeline data",
	"viewer.minutes": "Meeting minutes",
	"viewer.keyPoints": "Key points",
	"viewer.decisions": "Decisions / conclusions",
	"viewer.actionItems": "Action items",
	"viewer.openQuestions": "Open questions",
	"viewer.fullTranscript": "Full transcript",
	"viewer.show": "Show",
	"viewer.duration": "Duration",
	"viewer.originalTranscript": "Original Transcript",
	"viewer.aiAnalysis": "AI Analysis",
	"viewer.summary": "Summary",
	"viewer.keyConcepts": "Key Concepts",
	"viewer.relatedPapers": "Related Papers & Articles",
	"viewer.relatedPapersEmpty":
		"Run AI analysis to discover related papers and articles.",
	"viewer.sessionAskTitle": "Ask about this session",
	"viewer.sessionAskHint":
		"OpenRouter + this session’s transcript, summary, timeline, and concepts. Use the toggles below to add web search (Tavily) or other local sessions. Chat history is saved automatically in this browser (per session).",
	"viewer.sessionAskClear": "Clear chat",
	"viewer.sessionAskWebOnly":
		"Session Q&A runs in the desktop app (Tauri); the web preview cannot call OpenRouter from here.",
	"viewer.sessionAskEmpty":
		"Ask anything about what was said or shown in this capture.",
	"viewer.sessionAskYou": "You",
	"viewer.sessionAskAssistant": "Assistant",
	"viewer.sessionAskThinking": "Thinking…",
	"viewer.sessionAskPlaceholder":
		"e.g. What main method did they compare against the baseline?",
	"viewer.sessionAskSend": "Ask",
	"viewer.sessionAskCopy": "Copy",
	"viewer.sessionAskCopied": "Copied",
	"viewer.sessionAskNoKey":
		"OpenRouter API key is empty. Add it under Settings to ask questions.",
	"viewer.sessionAskError": "Could not get an answer: {message}",
	"viewer.sessionAskWebSearch": "Web search",
	"viewer.sessionAskPriorSessions": "Prior sessions",
	"viewer.sessionAskWebSearchHint":
		"Web: Tavily snippets are appended (configure API key in Settings).",
	"viewer.sessionAskWebSearchOffHint": "Web: off — answers use local context only.",
	"viewer.sessionAskPriorSessionsHint":
		"Prior: other indexed sessions’ summaries/transcripts are included as background.",
	"viewer.sessionAskPriorSessionsOffHint":
		"Prior: off — only the current session is used as meeting context.",
	"viewer.sessionAskWebNeedsTavily":
		"Web search is on but the Tavily API key is empty. Add it under Settings → OpenRouter, or turn off Web search.",

	// GraphViewer
	"graph.title": "Knowledge Graph",
	"graph.edges": "edges",
	"graph.loading": "Loading knowledge graph...",
	"graph.empty": "Knowledge graph is empty",
	"graph.emptyHint": 'Run "Generate AI" on a session to populate it',
	"graph.mindMap": "Mind map",
	"graph.mindMapDomain": "Domain mind map",
	"graph.mindMapSubtitle":
		"Branches extend from the session theme — a concise map of this research area.",
	"graph.themeKeywords": "Keywords",
	"graph.network": "Network graph",
	"graph.selectSession": "Session",
	"graph.topicFallback": "Untitled topic",
	"graph.group.method": "Methods",
	"graph.group.dataset": "Datasets",
	"graph.group.metric": "Metrics",
	"graph.group.author": "Authors",
	"graph.group.concept": "Concepts",
	"graph.group.context": "Context",
	"graph.group.theme": "Theme",
	"graph.clickNodeHint": "Click for details",
	"graph.closePanel": "Close",
	"graph.nodeSummary": "In this session",
	"graph.noNodeSummary":
		"No extra summary for this node. Re-run AI analysis to refresh structured graph data.",
	"graph.keyPoints": "Key points",
	"graph.sourceSessions": "Sessions",

	// QAPanel
	"qa.drill": "Questions",
	"qa.reveal": "Reveal Suggested Answer Points",
	"qa.hide": "Hide Answer Points",

	// FloatingController
	"float.stop": "Stop",
	"float.pause": "Pause",
	"float.resume": "Resume",
	"float.dragHandle": "Drag to move window",
	"float.targetLost": "Window not visible — waiting…",
	"float.systemAudio": "system audio",
	"float.micAudio": "input devices",
	"float.noAudio": "no audio",
	"float.liveOn": "live captions",

	// RegionSelector
	"region.dragHint": "Drag to select capture region",
	"region.subHint": "Or click below for full screen · Press Esc to cancel",
	"region.confirm": "Confirm Selection",
	"region.reset": "Reselect",
	"region.fullscreen": "Full Screen",
	"region.cancel": "Cancel",

	// Settings
	"settings.modelProvider": "Model Provider",
	"settings.modelProviderDesc":
		"Choose default provider for summarization and extraction.",
	"settings.captureBehavior": "Capture Behavior",
	"settings.captureBehaviorDesc":
		"Configure screenshot storage and automation toggles.",
	"settings.screenshotDir": "Screenshot Directory",
	"settings.browseScreenshotDir": "Choose folder…",
	"settings.screenshotDirManualHint":
		"You can also type or paste a path manually.",
	"settings.saveDir": "Save Directory",
	"settings.audioInputs": "Audio Inputs (multi-source)",
	"settings.audioInputsHint":
		"Microphones to mix in (used when “Also record my microphone” is on, or when system audio is unavailable).",
	"settings.refreshAudioDevices": "Refresh device list",
	"settings.audioOrphanSpecs":
		"Saved specs not in current list (uncheck to remove)",
	"settings.audioNoDevices":
		"No devices in the list (unusual). Tap Refresh or check the error message above.",
	"settings.audioMicSection": "Microphones",
	"settings.audioLoopbackSection": "System audio (loopback / internal capture)",
	"settings.audioLoopbackBadge": "Loopback",
	"settings.audioLoopbackEmpty":
		"Meeting audio is recorded with the built-in system audio capture (macOS 13+, toggle on the Capture page) — no driver needed. Only on older macOS: install a virtual loopback driver such as BlackHole 2ch, route Sound › Output to it, then refresh.",
	"settings.audioDeviceErrorTitle": "Could not load audio devices",
	"settings.frameInterval": "Frame Interval (seconds)",
	"settings.frameIntervalDesc":
		"How often the screen is checked. A slide is saved once it changed and settled; unchanged screens, video tiles and repeats are skipped.",
	"settings.frameIntervalHint": "Examples: 2 / 5 / 10",
	"settings.saveFrameInterval": "Save frame interval",
	"settings.saveAudioConfig": "Save Audio Capture Config",
	"settings.autoSummarize": "Auto-generate AI summary & minutes when the live transcript is ready",
	"settings.appearance": "Appearance",
	"settings.appearanceDesc": "Choose light, dark, or follow system appearance.",
	"settings.language": "Language",
	"settings.languageDesc": "Interface display language.",
	"settings.resetDefaults": "Reset Defaults",
	"settings.asr": "Speech-to-Text (ASR)",
	"settings.asrDesc": "Switch provider and language for transcription.",
	"settings.saveAsrConfig": "Save ASR Config",
	"settings.liveSegmentSec": "Live transcript chunk length (seconds)",
	"settings.liveSegmentSecDesc":
		"Shorter = captions appear sooner; longer = better accuracy and fewer requests. 8–15 s works well.",
	"settings.openRouter": "OpenRouter",
	"settings.openRouterDesc":
		"Reserved for LLM summarization and question generation API calls.",
	"settings.openRouterModel": "Model",
	"settings.openRouterApiKey": "API Key",
	"settings.openRouterMaxTokens": "Max output tokens",
	"settings.openRouterMaxTokensDesc":
		"Caps each OpenRouter completion (default 8192). Some models default to very large limits and trigger credit errors—lower this if needed. If the API returns “can only afford N”, the app retries once with that budget automatically.",
	"settings.tavilyApiKey": "Tavily API key (session Q&A web search)",
	"settings.tavilyApiKeyDesc":
		"Optional. Get a key at tavily.com — used when you enable “Web search” under session Q&A. Stored locally like other keys.",
	"settings.saveOpenRouterConfig": "Save OpenRouter Config",
	"settings.storedLocally": "Stored locally for prototype",
	"settings.persistentZustand": "Persistent via Zustand",
	"settings.botEndpoint": "Bot / automation hook",
	"settings.botEndpointDesc":
		"Local HTTP API on this machine. Send a meeting link (Zoom, Teams, Meet, Webex, etc.); the app joins it like “Join a meeting” on the Capture page (native client, meeting-window capture, system audio, live transcript) using your current settings.",
	"settings.botEndpointEnable": "Enable localhost listener",
	"settings.botEndpointPort": "Port",
	"settings.botEndpointSecret": "Shared secret (optional)",
	"settings.botEndpointSecretHint":
		'If set, requests must include this value in the JSON body as "secret" or Authorization: Bearer … Leave blank when saving to keep the existing secret; type a new value to replace; clear and save to remove.',
	"settings.botEndpointSave": "Save bot endpoint",
	"settings.botEndpointListening": "Listening",
	"settings.botEndpointIdle": "Stopped",
	"settings.botEndpointUrl": "POST endpoint",
	"settings.botEndpointExample": "Example (curl)",
} as const;

const zh: Record<string, string> = {
	// Nav
	"nav.capture": "会议捕获",
	"nav.graph": "知识图谱",
	"nav.qa": "Q&A",
	"nav.settings": "设置",
	"app.subtitle": "学术领航虾 · AI 科研助手",

	// Capture toolbar
	"capture.capturing": "捕获中",
	"capture.idle": "空闲",
	"capture.browseSessions": "浏览会话",
	"capture.hideSessions": "隐藏会话",
	"capture.syncSession": "同步会话",
	"capture.sessionSynced": "会话已同步：{id}",
	"capture.syncFailedAfterStop": "已结束捕获，但加载会话失败。",
	"capture.transcribe": "语音转写",
	"capture.refineTranscriptVisual": "画面纠错转写",
	"capture.refineTranscriptVisualHint":
		"用 OpenRouter 结合本会话抽样截图，纠正语音转写中的术语/幻灯片文字等明显错误。需已有 transcript.txt 与截图；原稿备份为 transcript.pre-visual-refine.backup.txt",
	"capture.generateAi": "AI 分析",
	"capture.stop": "停止",
	"capture.startCapture": "开始捕获",
	"capture.ready": "准备就绪",
	"capture.sourceMode": "捕获来源",
	"capture.sourceRegion": "框选区域（遮罩）",
	"capture.sourceDisplay": "全屏桌面（按显示器）",
	"capture.sourceDisplaySub":
		"按物理屏幕抓取。全屏应用会进入独立桌面（Space）；录制的是该显示器「当前画面上」的内容。",
	"capture.selectDisplay": "显示器",
	"capture.refreshDisplays": "刷新",
	"capture.silentHint":
		"顶部会保留小型悬浮条（可跨桌面），可用暂停/停止。macOS 可能在菜单栏显示录屏指示。",
	"capture.fullscreenSpaceExplainer":
		"macOS 进入全屏后会有独立「桌面」（调度中心里多出来的那一页）。本模式按固定间隔截取**整块物理显示器**的当前画面：请先切到要录的全屏/桌面再点开始；若在同一块屏上切换到别的桌面，画面会跟着变。若希望一边录全屏幻灯片、一边在本机做别的事，建议使用**双屏**（一屏放全屏演示、另一屏办公）。",
	"capture.minimizeOnStart": "开始捕获时最小化主窗口",
	"capture.backgroundStarted": "已开始录制：{id}",
	"capture.botStarted": "已通过机器人开始捕获：{id}",
	"capture.noDisplays": "未检测到显示器，请点击刷新或检查「屏幕录制」权限。",

	// Capture: sources, audio, live transcript
	"capture.sourceWindow": "会议窗口（后台）",
	"capture.selectWindow": "窗口",
	"capture.windowAuto": "自动识别会议窗口",
	"capture.windowOffscreen": "其它桌面",
	"capture.windowHint":
		"只录制这个窗口，即使被其它窗口挡住也能录——可以放心切去做别的事。请不要最小化它。若会议软件重建窗口（如进入共享视图），会自动跟随。",
	"capture.autoStopOnClose": "会议窗口关闭后自动停止",
	"capture.windowUnavailable":
		"窗口捕获需要 macOS 捕获助手（使用 Xcode 命令行工具构建）。",
	"capture.audioAndTranscript": "音频与转写",
	"capture.systemAudio": "录制会议声音（系统声音）",
	"capture.systemAudioHint":
		"直接录制电脑正在播放的声音（Zoom、Teams、浏览器等），无需安装 BlackHole、无需切换输出设备，你照常能听到。",
	"capture.systemAudioUnavailable":
		"需要 macOS 13 或更高版本；将改用设置中选择的输入设备（如 BlackHole）。",
	"capture.includeMic": "同时录制我的麦克风",
	"capture.includeMicHint": "混入「设置 → 音频输入」中勾选的麦克风（自己要发言时打开）。",
	"capture.devicesUsedHint": "未使用系统声音时，将录制设置中勾选的输入设备。",
	"capture.liveTranscript": "实时转写",
	"capture.liveTranscriptHint":
		"录制时分小段转写，字幕显示在此处和悬浮条上；停止时转写稿即已完成。",
	"capture.liveTranscriptNoAsr": "请先在设置中配置 ASR 服务地址以启用实时转写。",
	"capture.permissionMissing":
		"尚未授予「屏幕录制」权限——窗口捕获与系统声音都需要该权限。",
	"capture.permissionGrant": "去授权",
	"capture.noMeetingWindow": "没有找到会议窗口。请先打开会议，或在列表中手动选择窗口。",
	"capture.autoStopped": "会议窗口已关闭，已自动停止捕获。",
	"capture.targetLost": "看不到被录制的窗口（已关闭或最小化？），等待其恢复…",
	"capture.transcribeProgress": "转写中… {done}/{total} 段",
	"capture.transcribeHint":
		"将录音按 30 秒分段转写（带时间戳）。若录制时已开启实时转写则无需再点。",
	"capture.analyzing": "正在生成 AI 摘要与会议纪要…",
	"capture.sessionTools": "会话",

	// Live transcript
	"live.title": "实时转写",
	"live.listening": "收听中",
	"live.finished": "已完成",
	"live.waiting": "等待发言… 有人说话几秒后会出现第一行字幕。",
	"live.empty": "没有转写到语音。",
	"live.error": "转写出错：",
	"live.finishedMessage": "转写稿已生成（{count} 段）。",

	// Join meeting
	"join.title": "加入会议",
	"join.subtitle":
		"粘贴 Zoom / Teams / Meet / 腾讯会议链接（或整段会议邀请），应用会自动打开会议、找到会议窗口并在后台开始录制。",
	"join.linkPlaceholder": "https://zoom.us/j/… 或粘贴整段邀请文字",
	"join.titlePlaceholder": "标题（可选），如：组会报告",
	"join.opensApp": "将直接在客户端中打开",
	"join.opensBrowser": "将通过浏览器 / 系统关联程序打开",
	"join.noLink": "文本中没有找到会议链接。",
	"join.joinNow": "立即加入并录制",
	"join.or": "或于",
	"join.schedule": "定时加入",
	"join.hint":
		"应用保持运行时，会在开始前 1 分钟自动加入已预约的会议。建议在会议客户端中开启「自动使用电脑音频」。",
	"join.busy": "已有捕获正在进行。",
	"join.recordingWindow": "正在录制会议窗口：{window}",
	"join.recordingDisplay": "未找到会议窗口，改为录制整块屏幕。",
	"join.failed": "加入失败",
	"join.statusScheduled": "已预约",
	"join.statusJoining": "加入中…",
	"join.statusJoined": "已录制",
	"join.statusFailed": "失败",
	"join.statusMissed": "已错过",

	// Export
	"export.button": "导出 Markdown",
	"export.hint":
		"将会议纪要导出为 Markdown：摘要、纪要、每页幻灯片及对应讲解、概念、参考文献；截图保存在文件旁的文件夹中。",
	"export.done": "已导出：{path}",
	"export.failed": "导出失败",
	"export.reveal": "在访达中显示",

	// Session picker
	"sessions.title": "本地会话",
	"sessions.refresh": "刷新",
	"sessions.empty": "暂无本地会话，开始捕获以创建。",
	"sessions.frames": "帧",
	"sessions.audio": "音频",
	"sessions.transcript": "转写",
	"sessions.analyzed": "已分析",
	"sessions.delete": "删除",
	"sessions.deleteConfirm":
		"确定删除该会话？将删除本地捕获目录，并从知识图谱索引中移除与该会话相关的节点/边。",
	"sessions.confirmDeleteBtn": "确认删除",
	"sessions.cancelDeleteBtn": "取消",
	"sessions.deleteRunning": "请先停止捕获后再删除该会话。",
	"sessions.deleteNotFound":
		"未在磁盘上找到该会话文件夹。请检查设置中的截图目录，或确认会话数据是否已被移动。",
	"sessions.deleteFailed": "删除会话失败",

	// SessionViewer
	"viewer.noTimeline": "暂无时间轴数据",
	"viewer.minutes": "会议纪要",
	"viewer.keyPoints": "要点",
	"viewer.decisions": "结论 / 决定",
	"viewer.actionItems": "待办事项",
	"viewer.openQuestions": "待解决问题",
	"viewer.fullTranscript": "转写全文",
	"viewer.show": "展开",
	"viewer.duration": "时长",
	"viewer.originalTranscript": "原始转录",
	"viewer.aiAnalysis": "AI 分析",
	"viewer.summary": "摘要",
	"viewer.keyConcepts": "核心概念",
	"viewer.relatedPapers": "相关论文与文章",
	"viewer.relatedPapersEmpty": "运行 AI 分析以发现相关论文与文章。",
	"viewer.sessionAskTitle": "针对本场会议提问",
	"viewer.sessionAskHint":
		"通过 OpenRouter 使用本场转写、摘要、时间轴与概念。下方开关可开启联网检索（Tavily）或纳入其它本地会议摘要。对话记录会自动保存在本浏览器（按会话区分）。",
	"viewer.sessionAskClear": "清空对话",
	"viewer.sessionAskWebOnly":
		"针对会话的问答需在桌面版（Tauri）中使用；网页预览无法在此调用 OpenRouter。",
	"viewer.sessionAskEmpty": "可以询问本场讲解中提到的观点、方法或细节。",
	"viewer.sessionAskYou": "你",
	"viewer.sessionAskAssistant": "助手",
	"viewer.sessionAskThinking": "正在思考…",
	"viewer.sessionAskPlaceholder": "例如：主讲人提出的核心方法是什么？",
	"viewer.sessionAskSend": "提问",
	"viewer.sessionAskCopy": "复制",
	"viewer.sessionAskCopied": "已复制",
	"viewer.sessionAskNoKey": "尚未填写 OpenRouter API 密钥，请先在「设置」中配置。",
	"viewer.sessionAskError": "无法获取回答：{message}",
	"viewer.sessionAskWebSearch": "联网检索",
	"viewer.sessionAskPriorSessions": "其它会议",
	"viewer.sessionAskWebSearchHint":
		"联网：将附加 Tavily 检索摘要（需在设置中填写 Tavily 密钥）。",
	"viewer.sessionAskWebSearchOffHint": "联网：已关闭，仅使用本地上下文。",
	"viewer.sessionAskPriorSessionsHint":
		"其它会议：会并入已索引会话的摘要/转写片段作为参考。",
	"viewer.sessionAskPriorSessionsOffHint":
		"其它会议：已关闭，仅当前会话作为会议依据。",
	"viewer.sessionAskWebNeedsTavily":
		"已开启联网检索，但尚未填写 Tavily API 密钥。请在「设置」OpenRouter 卡片中填写并保存，或关闭「联网检索」。",

	// GraphViewer
	"graph.title": "知识图谱",
	"graph.edges": "条边",
	"graph.loading": "正在加载知识图谱…",
	"graph.empty": "知识图谱为空",
	"graph.emptyHint": "对会话运行「AI 分析」以填充数据",
	"graph.mindMap": "思维导图",
	"graph.mindMapDomain": "领域思维导图",
	"graph.mindMapSubtitle": "围绕本场主题向外延伸，整理该研究方向的关键脉络。",
	"graph.themeKeywords": "主题词",
	"graph.network": "关系网络图",
	"graph.selectSession": "会话",
	"graph.topicFallback": "未命名主题",
	"graph.group.method": "方法",
	"graph.group.dataset": "数据集",
	"graph.group.metric": "指标",
	"graph.group.author": "作者",
	"graph.group.concept": "概念",
	"graph.group.context": "背景",
	"graph.group.theme": "主题延伸",
	"graph.clickNodeHint": "点击查看详情",
	"graph.closePanel": "关闭",
	"graph.nodeSummary": "在本场中的含义",
	"graph.noNodeSummary":
		"暂无摘要。可重新运行 AI 分析以生成带说明的知识图谱节点。",
	"graph.keyPoints": "要点",
	"graph.sourceSessions": "来源会话",

	// QAPanel
	"qa.drill": "问题思考",
	"qa.reveal": "展开参考答案要点",
	"qa.hide": "收起答案要点",

	// FloatingController
	"float.stop": "停止",
	"float.pause": "暂停",
	"float.resume": "继续",
	"float.dragHandle": "拖拽以移动窗口",
	"float.targetLost": "看不到窗口，等待中…",
	"float.systemAudio": "系统声音",
	"float.micAudio": "输入设备",
	"float.noAudio": "无音频",
	"float.liveOn": "实时字幕",

	// RegionSelector
	"region.dragHint": "拖拽鼠标选择截屏区域",
	"region.subHint": "或点击下方按钮选择全屏 · 按 Esc 取消",
	"region.confirm": "确认选区",
	"region.reset": "重新选择",
	"region.fullscreen": "全屏捕获",
	"region.cancel": "取消",

	// Settings
	"settings.modelProvider": "模型提供商",
	"settings.modelProviderDesc": "选择用于摘要和提取的默认提供商。",
	"settings.captureBehavior": "捕获行为",
	"settings.captureBehaviorDesc": "配置截图存储和自动化开关。",
	"settings.screenshotDir": "截图目录",
	"settings.browseScreenshotDir": "选择文件夹…",
	"settings.screenshotDirManualHint": "也可手动输入或粘贴路径。",
	"settings.saveDir": "保存目录",
	"settings.audioInputs": "音频输入（多源）",
	"settings.audioInputsHint":
		"需要混入的麦克风（开启「同时录制我的麦克风」或系统声音不可用时使用）。",
	"settings.refreshAudioDevices": "刷新设备列表",
	"settings.audioOrphanSpecs": "已保存但当前列表中无此设备（取消勾选可移除）",
	"settings.audioNoDevices":
		"列表为空（少见）。请点击刷新，或查看上方错误说明。",
	"settings.audioMicSection": "麦克风",
	"settings.audioLoopbackSection": "系统内录（电脑播放的声音）",
	"settings.audioLoopbackBadge": "内录",
	"settings.audioLoopbackEmpty":
		"会议声音默认由内置的系统声音捕获录制（macOS 13+，在「会议捕获」页开关），无需安装任何驱动。仅旧版 macOS 需要安装虚拟声卡（如 BlackHole 2ch）并将声音输出设为它，再点刷新。",
	"settings.audioDeviceErrorTitle": "无法加载音频设备",
	"settings.frameInterval": "截图间隔（秒）",
	"settings.frameIntervalDesc":
		"多久检查一次画面。画面变化并稳定后才保存一页；未变化的画面、视频小窗和重复页会被跳过。",
	"settings.frameIntervalHint": "例如：2 / 5 / 10",
	"settings.saveFrameInterval": "保存截图间隔",
	"settings.saveAudioConfig": "保存音频配置",
	"settings.autoSummarize": "实时转写完成后自动生成 AI 摘要与纪要",
	"settings.appearance": "外观",
	"settings.appearanceDesc": "选择浅色、深色或跟随系统外观。",
	"settings.language": "语言",
	"settings.languageDesc": "界面显示语言。",
	"settings.resetDefaults": "恢复默认",
	"settings.asr": "语音转文字 (ASR)",
	"settings.asrDesc": "切换转写服务提供商和语言。",
	"settings.saveAsrConfig": "保存 ASR 配置",
	"settings.liveSegmentSec": "实时转写分段长度（秒）",
	"settings.liveSegmentSecDesc":
		"越短字幕出现越快；越长准确率越高、请求越少。建议 8–15 秒。",
	"settings.openRouter": "OpenRouter",
	"settings.openRouterDesc": "用于 LLM 摘要和问题生成的 API 调用。",
	"settings.openRouterModel": "模型",
	"settings.openRouterApiKey": "API 密钥",
	"settings.openRouterMaxTokens": "单次回复最大 token 数",
	"settings.openRouterMaxTokensDesc":
		"限制每次 OpenRouter 补全的上限（默认 8192）。部分模型默认上限很大，容易触发余额不足；可调小。若接口提示 “can only afford N”，应用会自动按该数值重试一次。",
	"settings.tavilyApiKey": "Tavily API 密钥（会话问答联网）",
	"settings.tavilyApiKeyDesc":
		"选填。在 tavily.com 申请，用于在「针对本场提问」中开启「联网检索」时拉取网页摘要；与其它密钥一样仅存本地。",
	"settings.saveOpenRouterConfig": "保存 OpenRouter 配置",
	"settings.storedLocally": "原型阶段，本地存储",
	"settings.persistentZustand": "通过 Zustand 持久化",
	"settings.botEndpoint": "机器人 / 自动化接入",
	"settings.botEndpointDesc":
		"本机 HTTP 服务。把会议链接（Zoom、Teams、Meet、Webex 等）POST 过来后，应用会像「加入会议」一样处理：用客户端打开、录制会议窗口与系统声音、实时转写（使用当前设置）。",
	"settings.botEndpointEnable": "启用本机监听",
	"settings.botEndpointPort": "端口",
	"settings.botEndpointSecret": "共享密钥（可选）",
	"settings.botEndpointSecretHint":
		'若填写，则请求需在 JSON 中携带 "secret" 字段，或使用 Authorization: Bearer。保存时留空表示不修改已有密钥；填写新值表示替换；清空后保存可删除密钥。',
	"settings.botEndpointSave": "保存接入点配置",
	"settings.botEndpointListening": "监听中",
	"settings.botEndpointIdle": "未监听",
	"settings.botEndpointUrl": "POST 地址",
	"settings.botEndpointExample": "示例（curl）",
};

type TranslationKey = keyof typeof en;

const dictionaries: Record<AppLanguage, Record<string, string>> = { en, zh };

export function useT(): (key: TranslationKey) => string {
	const language = useSettingsStore((s) => s.language);
	return (key: TranslationKey) =>
		dictionaries[language]?.[key] ?? en[key] ?? key;
}

export type TranslateFn = ReturnType<typeof useT>;
