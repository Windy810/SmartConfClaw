import type { AppSettings } from "../store/settingsStore";
import type {
	BotCapturePrefsPayload,
	CaptureStartOptions,
	LiveAsrConfig,
} from "./tauri";

function liveAsrFromSettings(s: AppSettings): LiveAsrConfig | null {
	if (!s.liveTranscriptEnabled || !s.asrEndpoint.trim()) {
		return null;
	}
	return {
		provider: s.asrProvider,
		endpoint: s.asrEndpoint,
		apiKey: s.asrApiKey,
		model: s.asrModel,
		language: s.asrLanguage,
	};
}

/** Capture options shared by manual start, "Join meeting" and scheduled meetings. */
export function buildCaptureStartOptions(
	s: AppSettings,
	title?: string | null,
): CaptureStartOptions {
	return {
		audioInputSpecs: s.audioInputSpecs,
		sampleRate: s.audioSampleRate,
		channels: s.audioChannels,
		frameIntervalSec: s.frameIntervalSec,
		systemAudio: s.captureSystemAudio,
		includeMicrophone: s.captureIncludeMic,
		liveAsr: liveAsrFromSettings(s),
		liveSegmentSec: s.liveSegmentSec,
		title: title?.trim() ? title.trim() : null,
		autoStopOnWindowClose: s.autoStopOnWindowClose,
	};
}

/** Preferences the local bot endpoint uses when a meeting link is POSTed. */
export function buildBotCapturePrefs(s: AppSettings): BotCapturePrefsPayload {
	return {
		audioInputSpecs: s.audioInputSpecs,
		sampleRate: s.audioSampleRate,
		channels: s.audioChannels,
		frameIntervalSec: s.frameIntervalSec,
		captureDisplayIndex: s.captureDisplayIndex,
		silentCaptureMinimizeMain: s.silentCaptureMinimizeMain,
		systemAudio: s.captureSystemAudio,
		includeMicrophone: s.captureIncludeMic,
		liveAsr: liveAsrFromSettings(s),
		liveSegmentSec: s.liveSegmentSec,
	};
}

export function formatClock(sec: number): string {
	const total = Number.isFinite(sec) && sec > 0 ? Math.round(sec) : 0;
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const ss = total % 60;
	const pad = (n: number) => n.toString().padStart(2, "0");
	return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
}
