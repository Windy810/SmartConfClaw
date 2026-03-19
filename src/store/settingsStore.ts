import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ModelProvider = "openai" | "anthropic" | "local";
export type ThemeDensity = "compact" | "comfortable";
export type ThemeMode = "light" | "dark" | "system";
export type AsrProvider = "whisper_cpp" | "openai_compatible";

export interface AppSettings {
  modelProvider: ModelProvider;
  screenshotDirectory: string;
  autoSummarizeOnCapture: boolean;
  themeDensity: ThemeDensity;
  themeMode: ThemeMode;
  audioInputSpecs: string[];
  audioSampleRate: number;
  audioChannels: number;
  asrProvider: AsrProvider;
  asrEndpoint: string;
  asrApiKey: string;
  asrModel: string;
  asrLanguage: string;
  openRouterModel: string;
  openRouterApiKey: string;
}

interface SettingsState extends AppSettings {
  setModelProvider: (provider: ModelProvider) => void;
  setScreenshotDirectory: (directory: string) => void;
  setAutoSummarizeOnCapture: (value: boolean) => void;
  setThemeDensity: (density: ThemeDensity) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setAudioInputSpecs: (specs: string[]) => void;
  setAudioSampleRate: (sampleRate: number) => void;
  setAudioChannels: (channels: number) => void;
  setAsrProvider: (provider: AsrProvider) => void;
  setAsrEndpoint: (endpoint: string) => void;
  setAsrApiKey: (apiKey: string) => void;
  setAsrModel: (model: string) => void;
  setAsrLanguage: (language: string) => void;
  setOpenRouterModel: (model: string) => void;
  setOpenRouterApiKey: (apiKey: string) => void;
  resetDefaults: () => void;
}

const defaultSettings: AppSettings = {
  modelProvider: "openai",
  screenshotDirectory: "~/Library/Application Support/ScholarClaw/captures",
  autoSummarizeOnCapture: true,
  themeDensity: "comfortable",
  themeMode: "system",
  audioInputSpecs: ["none:0"],
  audioSampleRate: 16000,
  audioChannels: 1,
  asrProvider: "whisper_cpp",
  asrEndpoint: "http://127.0.0.1:8080/inference",
  asrApiKey: "",
  asrModel: "gpt-4o-mini-transcribe",
  asrLanguage: "zh",
  openRouterModel: "minimax/minimax-m2.5-chat",
  openRouterApiKey: "",
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,
      setModelProvider: (provider) => set({ modelProvider: provider }),
      setScreenshotDirectory: (directory) => set({ screenshotDirectory: directory }),
      setAutoSummarizeOnCapture: (value) => set({ autoSummarizeOnCapture: value }),
      setThemeDensity: (density) => set({ themeDensity: density }),
      setThemeMode: (mode) => set({ themeMode: mode }),
      setAudioInputSpecs: (specs) => set({ audioInputSpecs: specs }),
      setAudioSampleRate: (sampleRate) => set({ audioSampleRate: sampleRate }),
      setAudioChannels: (channels) => set({ audioChannels: channels }),
      setAsrProvider: (provider) => set({ asrProvider: provider }),
      setAsrEndpoint: (endpoint) => set({ asrEndpoint: endpoint }),
      setAsrApiKey: (apiKey) => set({ asrApiKey: apiKey }),
      setAsrModel: (model) => set({ asrModel: model }),
      setAsrLanguage: (language) => set({ asrLanguage: language }),
      setOpenRouterModel: (model) => set({ openRouterModel: model }),
      setOpenRouterApiKey: (apiKey) => set({ openRouterApiKey: apiKey }),
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
        audioInputSpecs: state.audioInputSpecs,
        audioSampleRate: state.audioSampleRate,
        audioChannels: state.audioChannels,
        asrProvider: state.asrProvider,
        asrEndpoint: state.asrEndpoint,
        asrApiKey: state.asrApiKey,
        asrModel: state.asrModel,
        asrLanguage: state.asrLanguage,
        openRouterModel: state.openRouterModel,
        openRouterApiKey: state.openRouterApiKey,
      }),
    },
  ),
);
