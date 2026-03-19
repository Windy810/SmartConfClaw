import { useEffect, useState } from "react";

import { listAudioInputDevices, type AudioInputDevice } from "../lib/tauri";
import { useSettingsStore, type AsrProvider, type ModelProvider, type ThemeMode } from "../store/settingsStore";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

interface ModelOption {
  id: ModelProvider;
  label: string;
}

interface ThemeModeOption {
  id: ThemeMode;
  label: string;
}

interface AsrProviderOption {
  id: AsrProvider;
  label: string;
}

const modelOptions: ModelOption[] = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "local", label: "Local (On-device)" },
];

const themeModeOptions: ThemeModeOption[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

const asrProviderOptions: AsrProviderOption[] = [
  { id: "whisper_cpp", label: "whisper.cpp" },
  { id: "openai_compatible", label: "OpenAI-compatible ASR" },
];

export function SettingsPanel(): JSX.Element {
  const modelProvider = useSettingsStore((state) => state.modelProvider);
  const screenshotDirectory = useSettingsStore((state) => state.screenshotDirectory);
  const autoSummarizeOnCapture = useSettingsStore((state) => state.autoSummarizeOnCapture);
  const themeMode = useSettingsStore((state) => state.themeMode);
  const audioInputSpecs = useSettingsStore((state) => state.audioInputSpecs);
  const audioSampleRate = useSettingsStore((state) => state.audioSampleRate);
  const audioChannels = useSettingsStore((state) => state.audioChannels);
  const asrProvider = useSettingsStore((state) => state.asrProvider);
  const asrEndpoint = useSettingsStore((state) => state.asrEndpoint);
  const asrApiKey = useSettingsStore((state) => state.asrApiKey);
  const asrModel = useSettingsStore((state) => state.asrModel);
  const asrLanguage = useSettingsStore((state) => state.asrLanguage);
  const openRouterModel = useSettingsStore((state) => state.openRouterModel);
  const openRouterApiKey = useSettingsStore((state) => state.openRouterApiKey);
  const setModelProvider = useSettingsStore((state) => state.setModelProvider);
  const setScreenshotDirectory = useSettingsStore((state) => state.setScreenshotDirectory);
  const setAutoSummarizeOnCapture = useSettingsStore((state) => state.setAutoSummarizeOnCapture);
  const setThemeMode = useSettingsStore((state) => state.setThemeMode);
  const setAudioInputSpecs = useSettingsStore((state) => state.setAudioInputSpecs);
  const setAudioSampleRate = useSettingsStore((state) => state.setAudioSampleRate);
  const setAudioChannels = useSettingsStore((state) => state.setAudioChannels);
  const setAsrProvider = useSettingsStore((state) => state.setAsrProvider);
  const setAsrEndpoint = useSettingsStore((state) => state.setAsrEndpoint);
  const setAsrApiKey = useSettingsStore((state) => state.setAsrApiKey);
  const setAsrModel = useSettingsStore((state) => state.setAsrModel);
  const setAsrLanguage = useSettingsStore((state) => state.setAsrLanguage);
  const setOpenRouterModel = useSettingsStore((state) => state.setOpenRouterModel);
  const setOpenRouterApiKey = useSettingsStore((state) => state.setOpenRouterApiKey);
  const resetDefaults = useSettingsStore((state) => state.resetDefaults);

  const [draftDirectory, setDraftDirectory] = useState<string>(screenshotDirectory);
  const [draftAudioInputText, setDraftAudioInputText] = useState<string>(audioInputSpecs.join("\n"));
  const [draftSampleRate, setDraftSampleRate] = useState<string>(String(audioSampleRate));
  const [draftChannels, setDraftChannels] = useState<string>(String(audioChannels));
  const [draftAsrEndpoint, setDraftAsrEndpoint] = useState<string>(asrEndpoint);
  const [draftAsrApiKey, setDraftAsrApiKey] = useState<string>(asrApiKey);
  const [draftAsrModel, setDraftAsrModel] = useState<string>(asrModel);
  const [draftAsrLanguage, setDraftAsrLanguage] = useState<string>(asrLanguage);
  const [draftOpenRouterModel, setDraftOpenRouterModel] = useState<string>(openRouterModel);
  const [draftOpenRouterApiKey, setDraftOpenRouterApiKey] = useState<string>(openRouterApiKey);
  const [audioDevices, setAudioDevices] = useState<AudioInputDevice[]>([]);

  useEffect(() => {
    const loadDevices = async (): Promise<void> => {
      try {
        const devices = await listAudioInputDevices();
        setAudioDevices(devices);
      } catch (_error) {
        setAudioDevices([]);
      }
    };
    void loadDevices();
  }, []);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Model Provider</CardTitle>
          <CardDescription>Choose default provider for summarization and extraction.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {modelOptions.map((option) => {
            const isActive = modelProvider === option.id;
            return (
              <Button
                key={option.id}
                variant={isActive ? "default" : "outline"}
                className="w-full justify-start"
                onClick={() => setModelProvider(option.id)}
              >
                {option.label}
              </Button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Capture Behavior</CardTitle>
          <CardDescription>Configure screenshot storage and automation toggles.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="screenshot-directory" className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Screenshot Directory
            </label>
            <input
              id="screenshot-directory"
              type="text"
              value={draftDirectory}
              onChange={(event) => setDraftDirectory(event.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none ring-zinc-300 transition focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-600"
            />
            <Button size="sm" variant="outline" onClick={() => setScreenshotDirectory(draftDirectory)}>
              Save Directory
            </Button>
          </div>

          <div className="space-y-2">
            <label htmlFor="audio-input-specs" className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Audio Inputs (multi-source)
            </label>
            <textarea
              id="audio-input-specs"
              value={draftAudioInputText}
              onChange={(event) => setDraftAudioInputText(event.target.value)}
              className="min-h-20 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none ring-zinc-300 transition focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-600"
            />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">One ffmpeg spec per line, e.g. `none:0` and `none:2`.</p>
            {audioDevices.length > 0 ? (
              <div className="rounded-lg border border-zinc-200/80 p-2 text-xs dark:border-zinc-800">
                {audioDevices.map((device) => (
                  <p key={device.ffmpegSpec} className="text-zinc-600 dark:text-zinc-300">
                    [{device.index}] {device.label} {"->"} {device.ffmpegSpec}
                  </p>
                ))}
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={draftSampleRate}
                onChange={(event) => setDraftSampleRate(event.target.value)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none ring-zinc-300 transition focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-600"
                placeholder="Sample Rate"
              />
              <input
                type="number"
                value={draftChannels}
                onChange={(event) => setDraftChannels(event.target.value)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none ring-zinc-300 transition focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-600"
                placeholder="Channels"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const specs = draftAudioInputText
                  .split("\n")
                  .map((line) => line.trim())
                  .filter((line) => line.length > 0);
                setAudioInputSpecs(specs.length > 0 ? specs : ["none:0"]);
                setAudioSampleRate(Number.parseInt(draftSampleRate, 10) || 16000);
                setAudioChannels(Number.parseInt(draftChannels, 10) || 1);
              }}
            >
              Save Audio Capture Config
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-zinc-200/80 bg-zinc-50/60 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
            <p className="text-sm text-zinc-700 dark:text-zinc-200">Auto summarize while capturing</p>
            <button
              type="button"
              role="switch"
              aria-checked={autoSummarizeOnCapture}
              onClick={() => setAutoSummarizeOnCapture(!autoSummarizeOnCapture)}
              className={[
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                autoSummarizeOnCapture ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-300 dark:bg-zinc-700",
              ].join(" ")}
            >
              <span
                className={[
                  "inline-block h-5 w-5 transform rounded-full bg-white transition dark:bg-zinc-900",
                  autoSummarizeOnCapture ? "translate-x-5" : "translate-x-1",
                ].join(" ")}
              />
            </button>
          </div>
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg">Appearance</CardTitle>
          <CardDescription>Choose light, dark, or follow system appearance.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {themeModeOptions.map((option) => (
              <Button
                key={option.id}
                size="sm"
                variant={themeMode === option.id ? "default" : "outline"}
                onClick={() => setThemeMode(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={resetDefaults}>
              Reset Defaults
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg">Speech-to-Text (ASR)</CardTitle>
          <CardDescription>Switch provider and language for transcription.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {asrProviderOptions.map((option) => (
              <Button
                key={option.id}
                size="sm"
                variant={asrProvider === option.id ? "default" : "outline"}
                onClick={() => setAsrProvider(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <input
            type="text"
            value={draftAsrEndpoint}
            onChange={(event) => setDraftAsrEndpoint(event.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none ring-zinc-300 transition focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-600"
            placeholder="ASR endpoint URL"
          />
          <input
            type="text"
            value={draftAsrModel}
            onChange={(event) => setDraftAsrModel(event.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none ring-zinc-300 transition focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-600"
            placeholder="ASR model"
          />
          <input
            type="text"
            value={draftAsrLanguage}
            onChange={(event) => setDraftAsrLanguage(event.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none ring-zinc-300 transition focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-600"
            placeholder="Language code, e.g. zh"
          />
          <input
            type="password"
            value={draftAsrApiKey}
            onChange={(event) => setDraftAsrApiKey(event.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none ring-zinc-300 transition focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-600"
            placeholder="ASR API key (if required)"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setAsrEndpoint(draftAsrEndpoint);
              setAsrApiKey(draftAsrApiKey);
              setAsrModel(draftAsrModel);
              setAsrLanguage(draftAsrLanguage);
            }}
          >
            Save ASR Config
          </Button>
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg">OpenRouter</CardTitle>
          <CardDescription>Reserved for LLM summarization and question generation API calls.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <label htmlFor="openrouter-model" className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              Model
            </label>
            <input
              id="openrouter-model"
              type="text"
              value={draftOpenRouterModel}
              onChange={(event) => setDraftOpenRouterModel(event.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none ring-zinc-300 transition focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-600"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="openrouter-apikey" className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              API Key
            </label>
            <input
              id="openrouter-apikey"
              type="password"
              value={draftOpenRouterApiKey}
              onChange={(event) => setDraftOpenRouterApiKey(event.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none ring-zinc-300 transition focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-600"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setOpenRouterModel(draftOpenRouterModel);
                setOpenRouterApiKey(draftOpenRouterApiKey);
              }}
            >
              Save OpenRouter Config
            </Button>
            <Badge variant="secondary">Stored locally for prototype</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
