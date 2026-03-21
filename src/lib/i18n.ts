import { useSettingsStore, type AppLanguage } from "../store/settingsStore";

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
  "capture.generateAi": "Generate AI",
  "capture.stop": "Stop",
  "capture.startCapture": "Start Capture",
  "capture.ready": "Ready to capture",

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
  "viewer.originalTranscript": "Original Transcript",
  "viewer.aiAnalysis": "AI Analysis",
  "viewer.summary": "Summary",
  "viewer.keyConcepts": "Key Concepts",
  "viewer.relatedPapers": "Related Papers & Articles",
  "viewer.relatedPapersEmpty": "Run AI analysis to discover related papers and articles.",

  // GraphViewer
  "graph.title": "Knowledge Graph",
  "graph.edges": "edges",
  "graph.loading": "Loading knowledge graph...",
  "graph.empty": "Knowledge graph is empty",
  "graph.emptyHint": "Run \"Generate AI\" on a session to populate it",
  "graph.mindMap": "Mind map",
  "graph.mindMapDomain": "Domain mind map",
  "graph.mindMapSubtitle": "Branches extend from the session theme — a concise map of this research area.",
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
  "graph.noNodeSummary": "No extra summary for this node. Re-run AI analysis to refresh structured graph data.",
  "graph.keyPoints": "Key points",
  "graph.sourceSessions": "Sessions",

  // QAPanel
  "qa.drill": "Questions",
  "qa.reveal": "Reveal Suggested Answer Points",
  "qa.hide": "Hide Answer Points",

  // FloatingController
  "float.stop": "Stop",

  // RegionSelector
  "region.dragHint": "Drag to select capture region",
  "region.subHint": "Or click below for full screen · Press Esc to cancel",
  "region.confirm": "Confirm Selection",
  "region.reset": "Reselect",
  "region.fullscreen": "Full Screen",
  "region.cancel": "Cancel",

  // Settings
  "settings.modelProvider": "Model Provider",
  "settings.modelProviderDesc": "Choose default provider for summarization and extraction.",
  "settings.captureBehavior": "Capture Behavior",
  "settings.captureBehaviorDesc": "Configure screenshot storage and automation toggles.",
  "settings.screenshotDir": "Screenshot Directory",
  "settings.browseScreenshotDir": "Choose folder…",
  "settings.screenshotDirManualHint": "You can also type or paste a path manually.",
  "settings.saveDir": "Save Directory",
  "settings.audioInputs": "Audio Inputs (multi-source)",
  "settings.audioInputsHint": "Select one or more inputs to mix. Order follows the list below.",
  "settings.refreshAudioDevices": "Refresh device list",
  "settings.audioOrphanSpecs": "Saved specs not in current list (uncheck to remove)",
  "settings.audioNoDevices": "No devices in the list (unusual). Tap Refresh or check the error message above.",
  "settings.audioMicSection": "Microphones",
  "settings.audioLoopbackSection": "System audio (loopback / internal capture)",
  "settings.audioLoopbackBadge": "Loopback",
  "settings.audioLoopbackEmpty":
    "macOS cannot capture “what the computer plays” directly. Install a free virtual loopback driver (e.g. BlackHole 2ch), set System Settings › Sound › Output to BlackHole, then refresh — the device appears here. You can check it together with a mic and mix in one recording.",
  "settings.audioDeviceErrorTitle": "Could not load audio devices",
  "settings.frameInterval": "Frame Interval (seconds)",
  "settings.frameIntervalDesc":
    "How often to grab a screenshot while capturing (independent of audio sample rate).",
  "settings.frameIntervalHint": "Examples: 2 / 5 / 10",
  "settings.saveFrameInterval": "Save frame interval",
  "settings.saveAudioConfig": "Save Audio Capture Config",
  "settings.autoSummarize": "Auto summarize while capturing",
  "settings.appearance": "Appearance",
  "settings.appearanceDesc": "Choose light, dark, or follow system appearance.",
  "settings.language": "Language",
  "settings.languageDesc": "Interface display language.",
  "settings.resetDefaults": "Reset Defaults",
  "settings.asr": "Speech-to-Text (ASR)",
  "settings.asrDesc": "Switch provider and language for transcription.",
  "settings.saveAsrConfig": "Save ASR Config",
  "settings.openRouter": "OpenRouter",
  "settings.openRouterDesc": "Reserved for LLM summarization and question generation API calls.",
  "settings.openRouterModel": "Model",
  "settings.openRouterApiKey": "API Key",
  "settings.saveOpenRouterConfig": "Save OpenRouter Config",
  "settings.storedLocally": "Stored locally for prototype",
  "settings.persistentZustand": "Persistent via Zustand",
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
  "capture.generateAi": "AI 分析",
  "capture.stop": "停止",
  "capture.startCapture": "开始捕获",
  "capture.ready": "准备就绪",

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
  "viewer.originalTranscript": "原始转录",
  "viewer.aiAnalysis": "AI 分析",
  "viewer.summary": "摘要",
  "viewer.keyConcepts": "核心概念",
  "viewer.relatedPapers": "相关论文与文章",
  "viewer.relatedPapersEmpty": "运行 AI 分析以发现相关论文与文章。",

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
  "graph.noNodeSummary": "暂无摘要。可重新运行 AI 分析以生成带说明的知识图谱节点。",
  "graph.keyPoints": "要点",
  "graph.sourceSessions": "来源会话",

  // QAPanel
  "qa.drill": "问题思考",
  "qa.reveal": "展开参考答案要点",
  "qa.hide": "收起答案要点",

  // FloatingController
  "float.stop": "停止",

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
  "settings.audioInputsHint": "勾选需要采集的输入（可多选混音）。顺序与下方列表一致。",
  "settings.refreshAudioDevices": "刷新设备列表",
  "settings.audioOrphanSpecs": "已保存但当前列表中无此设备（取消勾选可移除）",
  "settings.audioNoDevices": "列表为空（少见）。请点击刷新，或查看上方错误说明。",
  "settings.audioMicSection": "麦克风",
  "settings.audioLoopbackSection": "系统内录（电脑播放的声音）",
  "settings.audioLoopbackBadge": "内录",
  "settings.audioLoopbackEmpty":
    "macOS 无法像 Windows 那样直接「立体声混音」内录。请安装虚拟声卡（推荐免费 BlackHole 2ch），在「系统设置 › 声音」把输出设为 BlackHole，再点刷新，列表中会出现对应设备；可与麦克风同时勾选，由 FFmpeg 混音录制。",
  "settings.audioDeviceErrorTitle": "无法加载音频设备",
  "settings.frameInterval": "截图间隔（秒）",
  "settings.frameIntervalDesc": "录制过程中多久截取一次屏幕画面（与音频采样率无关）。",
  "settings.frameIntervalHint": "例如：2 / 5 / 10",
  "settings.saveFrameInterval": "保存截图间隔",
  "settings.saveAudioConfig": "保存音频配置",
  "settings.autoSummarize": "捕获时自动摘要",
  "settings.appearance": "外观",
  "settings.appearanceDesc": "选择浅色、深色或跟随系统外观。",
  "settings.language": "语言",
  "settings.languageDesc": "界面显示语言。",
  "settings.resetDefaults": "恢复默认",
  "settings.asr": "语音转文字 (ASR)",
  "settings.asrDesc": "切换转写服务提供商和语言。",
  "settings.saveAsrConfig": "保存 ASR 配置",
  "settings.openRouter": "OpenRouter",
  "settings.openRouterDesc": "用于 LLM 摘要和问题生成的 API 调用。",
  "settings.openRouterModel": "模型",
  "settings.openRouterApiKey": "API 密钥",
  "settings.saveOpenRouterConfig": "保存 OpenRouter 配置",
  "settings.storedLocally": "原型阶段，本地存储",
  "settings.persistentZustand": "通过 Zustand 持久化",
};

type TranslationKey = keyof typeof en;

const dictionaries: Record<AppLanguage, Record<string, string>> = { en, zh };

export function useT(): (key: TranslationKey) => string {
  const language = useSettingsStore((s) => s.language);
  return (key: TranslationKey) => dictionaries[language]?.[key] ?? en[key] ?? key;
}

export type TranslateFn = ReturnType<typeof useT>;
