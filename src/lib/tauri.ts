import { homeDir } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import { mockAcademicSession } from "./mockData";
import type { AcademicSession, GlobalMindMapFile, KnowledgeGraph, MindMapCategory } from "../types";
import { normalizeGraphEdge, normalizeGraphNode } from "./graphNormalize";

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
          categories: (Array.isArray(o.categories) ? o.categories : []) as MindMapCategory[],
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

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean(window.__TAURI__ || window.__TAURI_INTERNALS__);
}

/** Resolve `~/…` or absolute paths for use as dialog `defaultPath` (native folder picker). */
async function resolveDirectoryDefaultPath(currentPath: string | undefined): Promise<string | undefined> {
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
export async function pickScreenshotDirectory(currentPath?: string): Promise<string | null> {
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
      { index: 0, label: "Default Microphone (web preview)", ffmpegSpec: "none:0", isLoopback: false },
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

export async function startCaptureSession(
  options: CaptureStartOptions,
  region?: CaptureRegion | null,
): Promise<string> {
  if (!isTauriRuntime()) {
    return "session-web-preview";
  }
  return invoke<string>("start_capture_session", {
    options,
    region: region ?? null,
  });
}

export async function stopCaptureSession(): Promise<string> {
  if (!isTauriRuntime()) {
    return "session-web-preview";
  }
  return invoke<string>("stop_capture_session");
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
  const payload = await invoke<CaptureSessionMeta[] | string>("list_capture_sessions");
  if (typeof payload === "string") {
    return JSON.parse(payload) as CaptureSessionMeta[];
  }
  return payload;
}

export async function getSessionData(id: string): Promise<AcademicSession> {
  if (!isTauriRuntime()) {
    return { ...mockAcademicSession, id };
  }

  const payload = await invoke<AcademicSession | string>("get_session_data", { id });
  if (typeof payload === "string") {
    return JSON.parse(payload) as AcademicSession;
  }

  return payload;
}

export async function transcribeSessionAudio(id: string, options: TranscribeOptions): Promise<string> {
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

export async function generateSessionAnalysis(
  id: string,
  openRouterApiKey: string,
  openRouterModel: string,
): Promise<string> {
  if (!isTauriRuntime()) {
    return "Web preview mode: OpenRouter analysis is unavailable.";
  }

  return invoke<string>("generate_session_analysis", {
    id,
    openRouterApiKey,
    openRouterModel,
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
    nodes: Array.isArray(graph.nodes) ? graph.nodes.map(normalizeGraphNode) : [],
    edges: Array.isArray(graph.edges) ? graph.edges.map(normalizeGraphEdge) : [],
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
