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
  "settings.saveDir": "Save Directory",
  "settings.audioInputs": "Audio Inputs (multi-source)",
  "settings.audioInputsHint": "One ffmpeg spec per line, e.g. `none:0` and `none:2`.",
  "settings.frameInterval": "Frame Interval (seconds)",
  "settings.frameIntervalHint": "Examples: 2 / 5 / 10",
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
  "settings.saveDir": "保存目录",
  "settings.audioInputs": "音频输入（多源）",
  "settings.audioInputsHint": "每行一个 ffmpeg 规格，如 `none:0` 和 `none:2`。",
  "settings.frameInterval": "截图间隔（秒）",
  "settings.frameIntervalHint": "例如：2 / 5 / 10",
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
