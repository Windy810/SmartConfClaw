import { invoke } from "@tauri-apps/api/core";
import { homeDir } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import type {
	AcademicSession,
	GlobalMindMapFile,
	KnowledgeGraph,
	MindMapCategory,
} from "../types";
import { normalizeGraphEdge, normalizeGraphNode } from "./graphNormalize";
import { mockAcademicSession } from "./mockData";

function normalizeMindMap(raw: unknown): GlobalMindMapFile | null {
	if (raw == null) return null;
	if (typeof raw !== "object") return null;
	const o = raw as Record<string, unknown>;
	if ("trees" in o && Array.isArray(o.trees)) {
		return raw as GlobalMindMapFile;
	}
	if ("topic" in o || "categories" in o || "keywords" in o) {
		const kw = o.keywords;
		const keywords =
			Array.isArray(kw) && kw.length > 0 ? kw.map((k) => String(k)) : undefined;
		return {
			version: 2,
			trees: [
				{
					sessionId: "legacy",
					topic: String(o.topic ?? ""),
					...(keywords ? { keywords } : {}),
					categories: (Array.isArray(o.categories)
						? o.categories
						: []) as MindMapCategory[],
				},
			],
		};
	}
	return null;
}

export interface CapturePrerequisites {
	platform: string;
	ffmpegAvailable: boolean;
	notes: string[];
}

export interface AudioInputDevice {
	index: number;
	label: string;
	ffmpegSpec: string;
	/** Virtual loopback (e.g. BlackHole) for capturing system/app playback audio */
	isLoopback?: boolean;
}

export interface CaptureStartOptions {
	audioInputSpecs: string[];
	sampleRate: number;
	channels: number;
	frameIntervalSec: number;
}

export interface CaptureRegion {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface TranscribeOptions {
	provider: "whisper_cpp" | "openai_compatible";
	endpoint: string;
	apiKey: string;
	model: string;
	language: string;
}

export function isTauriRuntime(): boolean {
	if (typeof window === "undefined") {
		return false;
	}

	return Boolean(window.__TAURI__ || window.__TAURI_INTERNALS__);
}

/** Resolve `~/…` or absolute paths for use as dialog `defaultPath` (native folder picker). */
async function resolveDirectoryDefaultPath(
	currentPath: string | undefined,
): Promise<string | undefined> {
	const trimmed = currentPath?.trim();
	if (!trimmed) {
		return undefined;
	}
	if (trimmed === "~") {
		return homeDir();
	}
	if (trimmed.startsWith("~/")) {
		const home = await homeDir();
		return `${home}/${trimmed.slice(2)}`;
	}
	if (trimmed.startsWith("/")) {
		return trimmed;
	}
	return undefined;
}

/**
 * Opens the system folder picker (e.g. Finder on macOS). Returns `null` if cancelled or not in Tauri.
 */
export async function pickScreenshotDirectory(
	currentPath?: string,
): Promise<string | null> {
	if (!isTauriRuntime()) {
		return null;
	}

	const defaultPath = await resolveDirectoryDefaultPath(currentPath);
	const selected = await open({
		directory: true,
		multiple: false,
		defaultPath,
	});

	if (selected === null) {
		return null;
	}
	if (typeof selected === "string") {
		return selected;
	}
	return selected[0] ?? null;
}

export async function checkCapturePrerequisites(): Promise<CapturePrerequisites> {
	if (!isTauriRuntime()) {
		return {
			platform: "web",
			ffmpegAvailable: false,
			notes: ["Web preview mode: OS-level capture commands are unavailable."],
		};
	}

	return invoke<CapturePrerequisites>("check_capture_prerequisites");
}

export async function listAudioInputDevices(): Promise<AudioInputDevice[]> {
	if (!isTauriRuntime()) {
		return [
			{
				index: 0,
				label: "Default Microphone (web preview)",
				ffmpegSpec: "none:0",
				isLoopback: false,
			},
		];
	}

	return invoke<AudioInputDevice[]>("list_audio_input_devices");
}

export async function openRegionSelector(): Promise<void> {
	if (!isTauriRuntime()) {
		return;
	}
	return invoke<void>("open_region_selector");
}

export async function closeRegionSelector(): Promise<void> {
	if (!isTauriRuntime()) {
		return;
	}
	return invoke<void>("close_region_selector");
}

export async function confirmRegionSelection(
	region: CaptureRegion | null,
): Promise<void> {
	if (!isTauriRuntime()) {
		return;
	}
	return invoke<void>("confirm_region_selection", {
		region: region ?? null,
	});
}

export async function cancelRegionSelection(): Promise<void> {
	if (!isTauriRuntime()) {
		return;
	}
	return invoke<void>("cancel_region_selection");
}

export interface CaptureDisplayInfo {
	index: number;
	label: string;
	width: number;
	height: number;
}

export async function listCaptureDisplays(): Promise<CaptureDisplayInfo[]> {
	if (!isTauriRuntime()) {
		return [
			{
				index: 1,
				label: "Primary display (web preview)",
				width: 1920,
				height: 1080,
			},
		];
	}
	return invoke<CaptureDisplayInfo[]>("list_capture_displays");
}

export async function startCaptureSession(args: {
	options: CaptureStartOptions;
	region?: CaptureRegion | null;
	displayIndex?: number | null;
	silent?: boolean;
}): Promise<string> {
	if (!isTauriRuntime()) {
		return "session-web-preview";
	}
	return invoke<string>("start_capture_session", {
		options: args.options,
		region: args.region ?? null,
		displayIndex: args.displayIndex ?? null,
		silent: args.silent ?? null,
	});
}

export async function stopCaptureSession(): Promise<string> {
	if (!isTauriRuntime()) {
		return "session-web-preview";
	}
	return invoke<string>("stop_capture_session");
}

export async function setCapturePaused(paused: boolean): Promise<void> {
	if (!isTauriRuntime()) {
		return;
	}
	return invoke<void>("set_capture_paused", { paused });
}

export async function getCapturePaused(): Promise<boolean> {
	if (!isTauriRuntime()) {
		return false;
	}
	return invoke<boolean>("get_capture_paused");
}

export interface CaptureSessionMeta {
	id: string;
	hasAudio: boolean;
	hasTranscript: boolean;
	hasSummary: boolean;
	frameCount: number;
	tags: string[];
	isRunning: boolean;
}

export async function listCaptureSessions(): Promise<CaptureSessionMeta[]> {
	if (!isTauriRuntime()) {
		return [];
	}
	const payload = await invoke<CaptureSessionMeta[] | string>(
		"list_capture_sessions",
	);
	if (typeof payload === "string") {
		return JSON.parse(payload) as CaptureSessionMeta[];
	}
	return payload;
}

export async function getSessionData(id: string): Promise<AcademicSession> {
	if (!isTauriRuntime()) {
		return { ...mockAcademicSession, id };
	}

	const payload = await invoke<AcademicSession | string>("get_session_data", {
		id,
	});
	if (typeof payload === "string") {
		return JSON.parse(payload) as AcademicSession;
	}

	return payload;
}

export async function transcribeSessionAudio(
	id: string,
	options: TranscribeOptions,
): Promise<string> {
	if (!isTauriRuntime()) {
		return "Web preview mode: transcription is unavailable.";
	}

	return invoke<string>("transcribe_session_audio", {
		id,
		asrProvider: options.provider,
		asrEndpoint: options.endpoint,
		asrApiKey: options.apiKey,
		asrModel: options.model,
		asrLanguage: options.language,
	});
}

export async function refineTranscriptWithVisuals(
	id: string,
	openRouterApiKey: string,
	openRouterModel: string,
	openRouterMaxTokens: number,
): Promise<string> {
	if (!isTauriRuntime()) {
		return "Web preview mode: transcript visual refine is unavailable.";
	}
	return invoke<string>("refine_transcript_with_visuals", {
		id,
		openRouterApiKey,
		openRouterModel,
		openRouterMaxTokens,
	});
}

export async function generateSessionAnalysis(
	id: string,
	openRouterApiKey: string,
	openRouterModel: string,
	openRouterMaxTokens: number,
): Promise<string> {
	if (!isTauriRuntime()) {
		return "Web preview mode: OpenRouter analysis is unavailable.";
	}

	return invoke<string>("generate_session_analysis", {
		id,
		openRouterApiKey,
		openRouterModel,
		openRouterMaxTokens,
	});
}

export interface SessionQaTurn {
	role: "user" | "assistant";
	content: string;
}

export async function askSessionQuestion(
	id: string,
	question: string,
	openRouterApiKey: string,
	openRouterModel: string,
	openRouterMaxTokens: number,
	options: {
		useWebSearch: boolean;
		usePriorSessions: boolean;
		tavilyApiKey: string;
	},
	chatHistory?: SessionQaTurn[],
): Promise<string> {
	if (!isTauriRuntime()) {
		return "Web 预览模式下无法调用本机 OpenRouter，请在桌面应用中针对已同步的会话提问。";
	}

	return invoke<string>("ask_session_question", {
		id,
		question,
		openRouterApiKey,
		openRouterModel,
		openRouterMaxTokens,
		useWebSearch: options.useWebSearch,
		usePriorSessions: options.usePriorSessions,
		tavilyApiKey: options.tavilyApiKey,
		chatHistory: chatHistory ?? null,
	});
}

export async function getKnowledgeGraph(): Promise<KnowledgeGraph> {
	if (!isTauriRuntime()) {
		return { nodes: [], edges: [], mindMap: null };
	}
	const payload = await invoke<KnowledgeGraph | string>("get_knowledge_graph");
	const graph =
		typeof payload === "string"
			? (JSON.parse(payload) as Record<string, unknown>)
			: (payload as unknown as Record<string, unknown>);
	const rawMindMap = graph.mindMap ?? graph.mind_map;
	return {
		nodes: Array.isArray(graph.nodes)
			? graph.nodes.map(normalizeGraphNode)
			: [],
		edges: Array.isArray(graph.edges)
			? graph.edges.map(normalizeGraphEdge)
			: [],
		mindMap: normalizeMindMap(rawMindMap),
	};
}

export async function getAllSessions(): Promise<
	Array<{ id: string; tags: string[]; summary: string; updatedAt: number }>
> {
	if (!isTauriRuntime()) {
		return [];
	}
	const payload = await invoke<string>("get_all_sessions");
	return JSON.parse(payload);
}

export async function deleteSession(
	id: string,
	options?: { screenshotsRoot?: string },
): Promise<string> {
	if (!isTauriRuntime()) {
		return "Web preview mode: delete session is unavailable.";
	}
	return invoke<string>("delete_session", {
		id,
		screenshotsRoot: options?.screenshotsRoot ?? null,
	});
}

/** Written to disk for the local bot HTTP handler so POST /v1/meeting uses current capture prefs. */
export interface BotCapturePrefsPayload {
	audioInputSpecs: string[];
	sampleRate: number;
	channels: number;
	frameIntervalSec: number;
	captureDisplayIndex: number;
	silentCaptureMinimizeMain: boolean;
}

export async function syncBotCapturePrefs(
	prefs: BotCapturePrefsPayload,
): Promise<void> {
	if (!isTauriRuntime()) {
		return;
	}
	return invoke<void>("sync_bot_capture_prefs", { prefs });
}

export interface BotEndpointStatus {
	enabled: boolean;
	port: number;
	listening: boolean;
	baseUrl: string;
	secretConfigured: boolean;
}

export async function getBotEndpointStatus(): Promise<BotEndpointStatus> {
	if (!isTauriRuntime()) {
		return {
			enabled: false,
			port: 18765,
			listening: false,
			baseUrl: "http://127.0.0.1:18765",
			secretConfigured: false,
		};
	}
	const raw = await invoke<string>("get_bot_endpoint_status");
	return JSON.parse(raw) as BotEndpointStatus;
}

export async function setBotEndpointConfig(args: {
	enabled: boolean;
	port: number;
	/** When set, updates the shared secret. Omit to keep the existing secret. */
	secret?: string;
}): Promise<void> {
	if (!isTauriRuntime()) {
		return;
	}
	const payload: {
		args: { enabled: boolean; port: number; secret?: string };
	} = {
		args: {
			enabled: args.enabled,
			port: args.port,
		},
	};
	if (args.secret !== undefined) {
		payload.args.secret = args.secret;
	}
	return invoke<void>("set_bot_endpoint_config", payload);
}
