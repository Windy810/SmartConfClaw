import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ModelProvider = "openai" | "anthropic" | "local";
export type ThemeDensity = "compact" | "comfortable";
export type ThemeMode = "light" | "dark" | "system";
export type AppLanguage = "en" | "zh";
export type AsrProvider = "whisper_cpp" | "openai_compatible";
/** Region overlay selection vs whole-screen capture on a chosen display (background-friendly). */
export type CaptureSourceMode = "region" | "display";

export interface AppSettings {
	modelProvider: ModelProvider;
	screenshotDirectory: string;
	autoSummarizeOnCapture: boolean;
	themeDensity: ThemeDensity;
	themeMode: ThemeMode;
	language: AppLanguage;
	audioInputSpecs: string[];
	audioSampleRate: number;
	audioChannels: number;
	frameIntervalSec: number;
	asrProvider: AsrProvider;
	asrEndpoint: string;
	asrApiKey: string;
	asrModel: string;
	asrLanguage: string;
	openRouterModel: string;
	openRouterApiKey: string;
	captureSourceMode: CaptureSourceMode;
	/** 1-based display index (matches system picker / `screencapture -D`). */
	captureDisplayIndex: number;
	/** Minimize main window when starting whole-display silent capture. */
	silentCaptureMinimizeMain: boolean;
}

interface SettingsState extends AppSettings {
	setModelProvider: (provider: ModelProvider) => void;
	setScreenshotDirectory: (directory: string) => void;
	setAutoSummarizeOnCapture: (value: boolean) => void;
	setThemeDensity: (density: ThemeDensity) => void;
	setThemeMode: (mode: ThemeMode) => void;
	setLanguage: (lang: AppLanguage) => void;
	setAudioInputSpecs: (specs: string[]) => void;
	setAudioSampleRate: (sampleRate: number) => void;
	setAudioChannels: (channels: number) => void;
	setFrameIntervalSec: (sec: number) => void;
	setAsrProvider: (provider: AsrProvider) => void;
	setAsrEndpoint: (endpoint: string) => void;
	setAsrApiKey: (apiKey: string) => void;
	setAsrModel: (model: string) => void;
	setAsrLanguage: (language: string) => void;
	setOpenRouterModel: (model: string) => void;
	setOpenRouterApiKey: (apiKey: string) => void;
	setCaptureSourceMode: (mode: CaptureSourceMode) => void;
	setCaptureDisplayIndex: (index: number) => void;
	setSilentCaptureMinimizeMain: (value: boolean) => void;
	resetDefaults: () => void;
}

const defaultSettings: AppSettings = {
	modelProvider: "openai",
	screenshotDirectory: "~/Library/Application Support/ScholarClaw/captures",
	autoSummarizeOnCapture: true,
	themeDensity: "comfortable",
	themeMode: "system",
	language: "en",
	audioInputSpecs: ["none:0"],
	audioSampleRate: 16000,
	audioChannels: 1,
	frameIntervalSec: 2,
	asrProvider: "whisper_cpp",
	asrEndpoint: "http://127.0.0.1:8080/inference",
	asrApiKey: "",
	asrModel: "gpt-4o-mini-transcribe",
	asrLanguage: "zh",
	openRouterModel: "minimax/minimax-m2.5-chat",
	openRouterApiKey: "",
	captureSourceMode: "region",
	captureDisplayIndex: 1,
	silentCaptureMinimizeMain: true,
};

export const useSettingsStore = create<SettingsState>()(
	persist(
		(set) => ({
			...defaultSettings,
			setModelProvider: (provider) => set({ modelProvider: provider }),
			setScreenshotDirectory: (directory) =>
				set({ screenshotDirectory: directory }),
			setAutoSummarizeOnCapture: (value) =>
				set({ autoSummarizeOnCapture: value }),
			setThemeDensity: (density) => set({ themeDensity: density }),
			setThemeMode: (mode) => set({ themeMode: mode }),
			setLanguage: (lang) => set({ language: lang }),
			setAudioInputSpecs: (specs) => set({ audioInputSpecs: specs }),
			setAudioSampleRate: (sampleRate) => set({ audioSampleRate: sampleRate }),
			setAudioChannels: (channels) => set({ audioChannels: channels }),
			setFrameIntervalSec: (sec) =>
				set({
					frameIntervalSec: Number.isFinite(sec)
						? Math.max(1, Math.min(60, Math.floor(sec)))
						: 2,
				}),
			setAsrProvider: (provider) => set({ asrProvider: provider }),
			setAsrEndpoint: (endpoint) => set({ asrEndpoint: endpoint }),
			setAsrApiKey: (apiKey) => set({ asrApiKey: apiKey }),
			setAsrModel: (model) => set({ asrModel: model }),
			setAsrLanguage: (language) => set({ asrLanguage: language }),
			setOpenRouterModel: (model) => set({ openRouterModel: model }),
			setOpenRouterApiKey: (apiKey) => set({ openRouterApiKey: apiKey }),
			setCaptureSourceMode: (mode) => set({ captureSourceMode: mode }),
			setCaptureDisplayIndex: (index) =>
				set({
					captureDisplayIndex:
						Number.isFinite(index) && index >= 1 ? Math.floor(index) : 1,
				}),
			setSilentCaptureMinimizeMain: (value) =>
				set({ silentCaptureMinimizeMain: value }),
			resetDefaults: () => set(defaultSettings),
		}),
		{
			name: "scholarclaw-settings-v1",
			storage: createJSONStorage(() => localStorage),
			partialize: (state) => ({
				modelProvider: state.modelProvider,
				screenshotDirectory: state.screenshotDirectory,
				autoSummarizeOnCapture: state.autoSummarizeOnCapture,
				themeDensity: state.themeDensity,
				themeMode: state.themeMode,
				language: state.language,
				audioInputSpecs: state.audioInputSpecs,
				audioSampleRate: state.audioSampleRate,
				audioChannels: state.audioChannels,
				frameIntervalSec: state.frameIntervalSec,
				asrProvider: state.asrProvider,
				asrEndpoint: state.asrEndpoint,
				asrApiKey: state.asrApiKey,
				asrModel: state.asrModel,
				asrLanguage: state.asrLanguage,
				openRouterModel: state.openRouterModel,
				openRouterApiKey: state.openRouterApiKey,
				captureSourceMode: state.captureSourceMode,
				captureDisplayIndex: state.captureDisplayIndex,
				silentCaptureMinimizeMain: state.silentCaptureMinimizeMain,
			}),
		},
	),
);
