import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { currentWindowLabel } from "./lib/windowLabel";
import { mockAcademicSession } from "./lib/mockData";
import {
  checkCapturePrerequisites,
  deleteSession,
  generateSessionAnalysis,
  getSessionData,
  listCaptureSessions,
  openRegionSelector,
  startCaptureSession,
  stopCaptureSession,
  transcribeSessionAudio,
} from "./lib/tauri";
import type { CaptureRegion, CaptureSessionMeta } from "./lib/tauri";
import { useT } from "./lib/i18n";
import { useSettingsStore } from "./store/settingsStore";
import { useUiStore, type NavView } from "./store/uiStore";
import { FloatingController } from "./components/FloatingController";
import { GraphViewer } from "./components/GraphViewer";
import { QAPanel } from "./components/QAPanel";
import { RegionSelector } from "./components/RegionSelector";
import { SettingsPanel } from "./components/SettingsPanel";
import { SessionViewer } from "./components/SessionViewer";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { ScrollArea } from "./components/ui/scroll-area";
import type { AcademicSession } from "./types";

const navKeys: { id: NavView; labelKey: "nav.capture" | "nav.graph" | "nav.qa" | "nav.settings" }[] = [
  { id: "capture", labelKey: "nav.capture" },
  { id: "graph", labelKey: "nav.graph" },
  { id: "qa", labelKey: "nav.qa" },
  { id: "settings", labelKey: "nav.settings" },
];

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && error !== null) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string") {
      return maybeMessage;
    }
    try {
      return JSON.stringify(error);
    } catch (_stringifyError) {
      return "Unknown structured error";
    }
  }

  return "Unknown error";
}

function MainApp(): JSX.Element {
  const t = useT();
  const activeView = useUiStore((state) => state.activeView);
  const setActiveView = useUiStore((state) => state.setActiveView);
  const bumpGraphRefresh = useUiStore((state) => state.bumpGraphRefresh);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [activeSession, setActiveSession] = useState<AcademicSession>(mockAcademicSession);
  const [currentSessionId, setCurrentSessionId] = useState<string>(mockAcademicSession.id);
  const [captureMessage, setCaptureMessage] = useState<string>("Ready to capture");
  const [sessionList, setSessionList] = useState<CaptureSessionMeta[]>([]);
  const [showSessionPicker, setShowSessionPicker] = useState<boolean>(false);
  /** In-app confirm (window.confirm is unreliable in Tauri WebView). */
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const audioInputSpecs = useSettingsStore((state) => state.audioInputSpecs);
  const audioSampleRate = useSettingsStore((state) => state.audioSampleRate);
  const audioChannels = useSettingsStore((state) => state.audioChannels);
  const frameIntervalSec = useSettingsStore((state) => state.frameIntervalSec);
  const screenshotDirectory = useSettingsStore((state) => state.screenshotDirectory);
  const asrProvider = useSettingsStore((state) => state.asrProvider);
  const asrEndpoint = useSettingsStore((state) => state.asrEndpoint);
  const asrApiKey = useSettingsStore((state) => state.asrApiKey);
  const asrModel = useSettingsStore((state) => state.asrModel);
  const asrLanguage = useSettingsStore((state) => state.asrLanguage);
  const openRouterModel = useSettingsStore((state) => state.openRouterModel);
  const openRouterApiKey = useSettingsStore((state) => state.openRouterApiKey);
  const themeMode = useSettingsStore((state) => state.themeMode);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = (): void => {
      const isDark = themeMode === "dark" || (themeMode === "system" && media.matches);
      root.classList.toggle("dark", isDark);
      root.style.colorScheme = isDark ? "dark" : "light";
    };

    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => {
      media.removeEventListener("change", applyTheme);
    };
  }, [themeMode]);

  useEffect(() => {
    const loadPrerequisites = async (): Promise<void> => {
      try {
        const prerequisite = await checkCapturePrerequisites();
        const details = prerequisite.notes.join(" ");
        setCaptureMessage(`${prerequisite.platform.toUpperCase()}: ${details}`);
      } catch (error) {
        setCaptureMessage(`Failed to check prerequisites: ${extractErrorMessage(error)}`);
      }
    };

    void loadPrerequisites();
  }, []);

  const doStartCaptureRef = useRef<(region: CaptureRegion | null) => Promise<void>>();

  doStartCaptureRef.current = useCallback(
    async (region: CaptureRegion | null): Promise<void> => {
      setIsBusy(true);
      try {
        const sessionId = await startCaptureSession(
          {
            audioInputSpecs,
            sampleRate: audioSampleRate,
            channels: audioChannels,
            frameIntervalSec,
          },
          region,
        );
        setCurrentSessionId(sessionId);
        setIsCapturing(true);
        setCaptureMessage(`Capture started: ${sessionId}`);
      } catch (error) {
        setCaptureMessage(`Failed to start capture: ${extractErrorMessage(error)}`);
      } finally {
        setIsBusy(false);
      }
    },
    [audioInputSpecs, audioSampleRate, audioChannels, frameIntervalSec],
  );

  useEffect(() => {
    let unlistenConfirmed: (() => void) | undefined;
    let unlistenCancelled: (() => void) | undefined;
    let unlistenStopped: (() => void) | undefined;

    const setup = async () => {
      unlistenConfirmed = await listen<CaptureRegion | null>("region-confirmed", (event) => {
        void doStartCaptureRef.current?.(event.payload);
      });
      unlistenCancelled = await listen("region-cancelled", () => {
        setIsBusy(false);
        setCaptureMessage("Region selection cancelled");
      });
      unlistenStopped = await listen<string>("capture-stopped", (event) => {
        setIsCapturing(false);
        setCaptureMessage(`Capture stopped: ${event.payload}`);
      });
    };

    void setup();
    return () => {
      unlistenConfirmed?.();
      unlistenCancelled?.();
      unlistenStopped?.();
    };
  }, []);

  const handleStartCapture = async (): Promise<void> => {
    setIsBusy(true);
    try {
      await openRegionSelector();
    } catch (error) {
      setCaptureMessage(`Failed to open region selector: ${extractErrorMessage(error)}`);
      setIsBusy(false);
    }
  };

  const handleStopCapture = async (): Promise<void> => {
    setIsBusy(true);
    try {
      const sessionId = await stopCaptureSession();
      setIsCapturing(false);
      setCaptureMessage(`Capture stopped: ${sessionId}`);
    } catch (error) {
      setCaptureMessage(`Failed to stop capture: ${extractErrorMessage(error)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleLoadSession = async (): Promise<void> => {
    setIsBusy(true);
    try {
      const fetchedSession = await getSessionData(currentSessionId);
      setActiveSession(fetchedSession);
      setCaptureMessage(`Fetched session: ${fetchedSession.id}`);
    } catch (error) {
      setCaptureMessage(`Failed to fetch session: ${extractErrorMessage(error)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleTranscribe = async (): Promise<void> => {
    setIsBusy(true);
    try {
      const result = await transcribeSessionAudio(currentSessionId, {
        provider: asrProvider,
        endpoint: asrEndpoint,
        apiKey: asrApiKey,
        model: asrModel,
        language: asrLanguage,
      });
      setCaptureMessage(`Transcription done: ${result}`);
      const fetchedSession = await getSessionData(currentSessionId);
      setActiveSession(fetchedSession);
    } catch (error) {
      setCaptureMessage(`Failed to transcribe: ${extractErrorMessage(error)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleGenerateAnalysis = async (): Promise<void> => {
    if (!openRouterApiKey.trim()) {
      setCaptureMessage("OpenRouter API key is empty. Please set it in Settings.");
      return;
    }

    setIsBusy(true);
    try {
      const result = await generateSessionAnalysis(currentSessionId, openRouterApiKey, openRouterModel);
      setCaptureMessage(`AI analysis generated: ${result}`);
      const fetchedSession = await getSessionData(currentSessionId);
      setActiveSession(fetchedSession);
    } catch (error) {
      setCaptureMessage(`Failed to generate analysis: ${extractErrorMessage(error)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const refreshSessionList = async (): Promise<void> => {
    try {
      const list = await listCaptureSessions();
      setSessionList(list);
    } catch (error) {
      setCaptureMessage(`Failed to list sessions: ${extractErrorMessage(error)}`);
    }
  };

  const handleSelectSession = async (id: string): Promise<void> => {
    setCurrentSessionId(id);
    setCaptureMessage(`Loading session: ${id}...`);
    setIsBusy(true);
    try {
      const fetchedSession = await getSessionData(id);
      setActiveSession(fetchedSession);
      setCaptureMessage(`Loaded session: ${id}`);
    } catch (error) {
      setCaptureMessage(`Failed to load session: ${extractErrorMessage(error)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const requestDeleteSession = (sessionId: string): void => {
    if (sessionList.find((s) => s.id === sessionId)?.isRunning) {
      setCaptureMessage(t("sessions.deleteRunning"));
      return;
    }
    setPendingDeleteId(sessionId);
    setCaptureMessage(t("sessions.deleteConfirm"));
  };

  const cancelPendingDelete = (): void => {
    setPendingDeleteId(null);
  };

  const executeDeleteSession = async (sessionId: string): Promise<void> => {
    setPendingDeleteId(null);
    setIsBusy(true);
    try {
      const msg = await deleteSession(sessionId, {
        screenshotsRoot: screenshotDirectory,
      });
      setCaptureMessage(msg);
      await refreshSessionList();
      bumpGraphRefresh();
      if (currentSessionId === sessionId) {
        setCurrentSessionId(mockAcademicSession.id);
        setActiveSession(mockAcademicSession);
      }
    } catch (error) {
      const errText = extractErrorMessage(error);
      if (errText.includes("SESSION_FOLDER_NOT_FOUND")) {
        setCaptureMessage(`${t("sessions.deleteNotFound")} ${errText}`);
      } else {
        setCaptureMessage(`${t("sessions.deleteFailed")}: ${errText}`);
      }
    } finally {
      setIsBusy(false);
    }
  };

  const toggleSessionPicker = (): void => {
    const next = !showSessionPicker;
    setShowSessionPicker(next);
    setPendingDeleteId(null);
    if (next) {
      void refreshSessionList();
    }
  };

  return (
    <div className="h-screen w-full bg-zinc-100/80 text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto grid h-full max-w-[1600px] grid-cols-1 gap-4 p-4 lg:grid-cols-[260px_1fr]">
        <aside className="min-h-0">
          <Card className="h-full overflow-hidden">
            <CardHeader className="space-y-3 border-b border-zinc-200/80 pb-4 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">SmartConf Claw</CardTitle>
                <Badge variant="secondary">Claw</Badge>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{t("app.subtitle")}</p>
            </CardHeader>
            <CardContent className="p-3">
              <ScrollArea className="h-[calc(100vh-170px)]">
                <nav className="space-y-1">
                  {navKeys.map((item) => {
                    const isActive = activeView === item.id;
                    return (
                      <Button
                        key={item.id}
                        variant={isActive ? "default" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => setActiveView(item.id)}
                      >
                        {t(item.labelKey)}
                      </Button>
                    );
                  })}
                </nav>
              </ScrollArea>
            </CardContent>
          </Card>
        </aside>

        <main className="min-h-0">
          <ScrollArea className="h-[calc(100vh-32px)] rounded-2xl">
            <div className="space-y-4 pb-6">
              {activeView === "capture" ? (
                <>
                  <Card>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Badge variant={isCapturing ? "default" : "secondary"}>
                            {isCapturing ? t("capture.capturing") : t("capture.idle")}
                          </Badge>
                          <p className="text-sm text-zinc-600 dark:text-zinc-300">{captureMessage}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant={showSessionPicker ? "default" : "outline"}
                            size="sm"
                            onClick={toggleSessionPicker}
                          >
                            {showSessionPicker ? t("capture.hideSessions") : t("capture.browseSessions")}
                          </Button>
                          <Button variant="outline" size="sm" disabled={isBusy} onClick={handleLoadSession}>
                            {t("capture.syncSession")}
                          </Button>
                          <Button variant="outline" size="sm" disabled={isBusy} onClick={handleTranscribe}>
                            {t("capture.transcribe")}
                          </Button>
                          <Button variant="outline" size="sm" disabled={isBusy} onClick={handleGenerateAnalysis}>
                            {t("capture.generateAi")}
                          </Button>
                          <Button variant="outline" size="sm" disabled={isBusy || !isCapturing} onClick={handleStopCapture}>
                            {t("capture.stop")}
                          </Button>
                          <Button size="sm" disabled={isBusy || isCapturing} onClick={handleStartCapture}>
                            {t("capture.startCapture")}
                          </Button>
                        </div>
                      </div>

                      {showSessionPicker ? (
                        <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                          <div className="mb-2 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                              {t("sessions.title")} ({sessionList.length})
                            </h3>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => void refreshSessionList()}
                            >
                              {t("sessions.refresh")}
                            </Button>
                          </div>
                          {sessionList.length === 0 ? (
                            <p className="py-4 text-center text-xs text-zinc-400">
                              {t("sessions.empty")}
                            </p>
                          ) : (
                            <div className="max-h-[240px] space-y-1.5 overflow-y-auto pr-1">
                              {sessionList.map((s) => {
                                const selected = s.id === currentSessionId;
                                return (
                                  <div
                                    key={s.id}
                                    className={`flex w-full items-stretch gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                                      selected
                                        ? "bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                                        : "bg-white hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() => void handleSelectSession(s.id)}
                                      className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-md px-1 py-0.5 text-left"
                                    >
                                      <span className="truncate text-xs font-medium">{s.id}</span>
                                      <div className="flex flex-wrap items-center gap-1">
                                        {s.isRunning ? (
                                          <Badge
                                            variant="default"
                                            className="h-4 px-1.5 text-[10px] leading-none"
                                          >
                                            LIVE
                                          </Badge>
                                        ) : null}
                                        <span
                                          className={`text-[10px] ${
                                            selected
                                              ? "text-zinc-300 dark:text-zinc-500"
                                              : "text-zinc-400 dark:text-zinc-500"
                                          }`}
                                        >
                                          {s.frameCount} {t("sessions.frames")}
                                        </span>
                                        {s.hasAudio ? (
                                          <span className="text-[10px] text-emerald-500">{t("sessions.audio")}</span>
                                        ) : null}
                                        {s.hasTranscript ? (
                                          <span className="text-[10px] text-blue-500">{t("sessions.transcript")}</span>
                                        ) : null}
                                        {s.hasSummary ? (
                                          <span className="text-[10px] text-violet-500">{t("sessions.analyzed")}</span>
                                        ) : null}
                                      </div>
                                      {s.tags.length > 0 ? (
                                        <div className="mt-0.5 flex flex-wrap gap-1">
                                          {s.tags.slice(0, 3).map((tag: string, i: number) => (
                                            <Badge
                                              key={`${tag}-${i}`}
                                              variant="secondary"
                                              className="h-4 max-w-[80px] truncate px-1.5 text-[10px] leading-none"
                                            >
                                              {String(tag).replace(/^"|"$/g, "")}
                                            </Badge>
                                          ))}
                                        </div>
                                      ) : null}
                                    </button>
                                    {pendingDeleteId === s.id ? (
                                      <div className="flex shrink-0 flex-col items-stretch gap-1 self-center">
                                        <Button
                                          type="button"
                                          variant="default"
                                          size="sm"
                                          className="h-7 border border-red-600 bg-red-600 px-2 text-[10px] leading-tight text-white hover:bg-red-700 dark:border-red-500 dark:bg-red-600"
                                          disabled={isBusy || s.isRunning}
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            void executeDeleteSession(s.id);
                                          }}
                                        >
                                          {t("sessions.confirmDeleteBtn")}
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-7 px-2 text-[10px] leading-tight"
                                          disabled={isBusy}
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            cancelPendingDelete();
                                          }}
                                        >
                                          {t("sessions.cancelDeleteBtn")}
                                        </Button>
                                      </div>
                                    ) : (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-auto shrink-0 self-center px-2 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                        disabled={isBusy || s.isRunning}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          requestDeleteSession(s.id);
                                        }}
                                      >
                                        {t("sessions.delete")}
                                      </Button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                  <SessionViewer session={activeSession} />
                </>
              ) : null}
              {activeView === "graph" ? <GraphViewer /> : null}
              {activeView === "qa" ? <QAPanel items={activeSession.qaSimulator} /> : null}
              {activeView === "settings" ? <SettingsPanel /> : null}
            </div>
          </ScrollArea>
        </main>
      </div>
    </div>
  );
}

function App(): JSX.Element {
  if (currentWindowLabel === "region-selector") {
    return <RegionSelector />;
  }

  if (currentWindowLabel === "floating-controller") {
    return <FloatingController />;
  }

  return <MainApp />;
}

export default App;
