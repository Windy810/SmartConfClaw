import { invoke } from "@tauri-apps/api/core";

import { mockAcademicSession } from "./mockData";
import type { AcademicSession } from "../types";

export interface CapturePrerequisites {
  platform: string;
  ffmpegAvailable: boolean;
  notes: string[];
}

export interface AudioInputDevice {
  index: number;
  label: string;
  ffmpegSpec: string;
}

export interface CaptureStartOptions {
  audioInputSpecs: string[];
  sampleRate: number;
  channels: number;
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
    return [{ index: 0, label: "Default Microphone (web preview)", ffmpegSpec: "none:0" }];
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
