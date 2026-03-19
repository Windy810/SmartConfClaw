import { useEffect, useState } from "react";

import { useT } from "../lib/i18n";
import { listAudioInputDevices, type AudioInputDevice } from "../lib/tauri";
import {
  useSettingsStore,
  type AppLanguage,
  type AsrProvider,
  type ModelProvider,
  type ThemeMode,
} from "../store/settingsStore";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";

interface ModelOption {
  id: ModelProvider;
  label: string;
}

const modelOptions: ModelOption[] = [
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "local", label: "Local (On-device)" },
];

const themeModeOptions: { id: ThemeMode; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

const languageOptions: { id: AppLanguage; label: string }[] = [
  { id: "en", label: "English" },
  { id: "zh", label: "中文" },
];

const asrProviderOptions: { id: AsrProvider; label: string }[] = [
  { id: "whisper_cpp", label: "whisper.cpp" },
  { id: "openai_compatible", label: "OpenAI-compatible ASR" },
];

export function SettingsPanel(): JSX.Element {
  const t = useT();
  const modelProvider = useSettingsStore((state) => state.modelProvider);
  const screenshotDirectory = useSettingsStore((state) => state.screenshotDirectory);
  const autoSummarizeOnCapture = useSettingsStore((state) => state.autoSummarizeOnCapture);
  const themeMode = useSettingsStore((state) => state.themeMode);
  const language = useSettingsStore((state) => state.language);
  const audioInputSpecs = useSettingsStore((state) => state.audioInputSpecs);
  const audioSampleRate = useSettingsStore((state) => state.audioSampleRate);
  const audioChannels = useSettingsStore((state) => state.audioChannels);
  const frameIntervalSec = useSettingsStore((state) => state.frameIntervalSec);
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
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const setAudioInputSpecs = useSettingsStore((state) => state.setAudioInputSpecs);
  const setAudioSampleRate = useSettingsStore((state) => state.setAudioSampleRate);
  const setAudioChannels = useSettingsStore((state) => state.setAudioChannels);
  const setFrameIntervalSec = useSettingsStore((state) => state.setFrameIntervalSec);
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
  const [draftFrameIntervalSec, setDraftFrameIntervalSec] = useState<string>(String(frameIntervalSec));
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

  const inputCls =
    "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none ring-zinc-300 transition focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-600";

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("settings.modelProvider")}</CardTitle>
          <CardDescription>{t("settings.modelProviderDesc")}</CardDescription>
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
          <CardTitle className="text-lg">{t("settings.captureBehavior")}</CardTitle>
          <CardDescription>{t("settings.captureBehaviorDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="screenshot-directory" className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              {t("settings.screenshotDir")}
            </label>
            <input
              id="screenshot-directory"
              type="text"
              value={draftDirectory}
              onChange={(event) => setDraftDirectory(event.target.value)}
              className={inputCls}
            />
            <Button size="sm" variant="outline" onClick={() => setScreenshotDirectory(draftDirectory)}>
              {t("settings.saveDir")}
            </Button>
          </div>

          <div className="space-y-2">
            <label htmlFor="audio-input-specs" className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              {t("settings.audioInputs")}
            </label>
            <textarea
              id="audio-input-specs"
              value={draftAudioInputText}
              onChange={(event) => setDraftAudioInputText(event.target.value)}
              className={`min-h-20 ${inputCls}`}
            />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{t("settings.audioInputsHint")}</p>
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
                className={inputCls}
                placeholder="Sample Rate"
              />
              <input
                type="number"
                value={draftChannels}
                onChange={(event) => setDraftChannels(event.target.value)}
                className={inputCls}
                placeholder="Channels"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="frame-interval-sec" className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                {t("settings.frameInterval")}
              </label>
              <input
                id="frame-interval-sec"
                type="number"
                min={1}
                max={60}
                value={draftFrameIntervalSec}
                onChange={(event) => setDraftFrameIntervalSec(event.target.value)}
                className={inputCls}
                placeholder={t("settings.frameIntervalHint")}
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
                setFrameIntervalSec(Number.parseInt(draftFrameIntervalSec, 10) || 2);
              }}
            >
              {t("settings.saveAudioConfig")}
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-zinc-200/80 bg-zinc-50/60 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
            <p className="text-sm text-zinc-700 dark:text-zinc-200">{t("settings.autoSummarize")}</p>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("settings.appearance")}</CardTitle>
          <CardDescription>{t("settings.appearanceDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
          <Button size="sm" variant="outline" onClick={resetDefaults}>
            {t("settings.resetDefaults")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("settings.language")}</CardTitle>
          <CardDescription>{t("settings.languageDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            {languageOptions.map((option) => (
              <Button
                key={option.id}
                size="sm"
                variant={language === option.id ? "default" : "outline"}
                onClick={() => setLanguage(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg">{t("settings.asr")}</CardTitle>
          <CardDescription>{t("settings.asrDesc")}</CardDescription>
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
            className={inputCls}
            placeholder="ASR endpoint URL"
          />
          <input
            type="text"
            value={draftAsrModel}
            onChange={(event) => setDraftAsrModel(event.target.value)}
            className={inputCls}
            placeholder="ASR model"
          />
          <input
            type="text"
            value={draftAsrLanguage}
            onChange={(event) => setDraftAsrLanguage(event.target.value)}
            className={inputCls}
            placeholder="Language code, e.g. zh"
          />
          <input
            type="password"
            value={draftAsrApiKey}
            onChange={(event) => setDraftAsrApiKey(event.target.value)}
            className={inputCls}
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
            {t("settings.saveAsrConfig")}
          </Button>
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg">{t("settings.openRouter")}</CardTitle>
          <CardDescription>{t("settings.openRouterDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <label htmlFor="openrouter-model" className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              {t("settings.openRouterModel")}
            </label>
            <input
              id="openrouter-model"
              type="text"
              value={draftOpenRouterModel}
              onChange={(event) => setDraftOpenRouterModel(event.target.value)}
              className={inputCls}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="openrouter-apikey" className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              {t("settings.openRouterApiKey")}
            </label>
            <input
              id="openrouter-apikey"
              type="password"
              value={draftOpenRouterApiKey}
              onChange={(event) => setDraftOpenRouterApiKey(event.target.value)}
              className={inputCls}
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
              {t("settings.saveOpenRouterConfig")}
            </Button>
            <Badge variant="secondary">{t("settings.storedLocally")}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
