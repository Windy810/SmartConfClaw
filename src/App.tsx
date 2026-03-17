import { useEffect, useState } from "react";

import { mockAcademicSession, mockGraphEdges, mockGraphNodes } from "./lib/mockData";
import {
  checkCapturePrerequisites,
  generateSessionAnalysis,
  getSessionData,
  startCaptureSession,
  stopCaptureSession,
  transcribeSessionAudio,
} from "./lib/tauri";
import { useSettingsStore } from "./store/settingsStore";
import { useUiStore, type NavView } from "./store/uiStore";
import { GraphViewer } from "./components/GraphViewer";
import { QAPanel } from "./components/QAPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { SessionViewer } from "./components/SessionViewer";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { ScrollArea } from "./components/ui/scroll-area";
import type { AcademicSession } from "./types";

interface NavItem {
  id: NavView;
  label: string;
}

const navItems: NavItem[] = [
  { id: "capture", label: "Meeting Capture" },
  { id: "graph", label: "Knowledge Graph" },
  { id: "qa", label: "Q&A Simulator" },
  { id: "settings", label: "Settings" },
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

function App(): JSX.Element {
  const activeView = useUiStore((state) => state.activeView);
  const setActiveView = useUiStore((state) => state.setActiveView);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [activeSession, setActiveSession] = useState<AcademicSession>(mockAcademicSession);
  const [currentSessionId, setCurrentSessionId] = useState<string>(mockAcademicSession.id);
  const [captureMessage, setCaptureMessage] = useState<string>("Ready to capture");
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

  const handleStartCapture = async (): Promise<void> => {
    setIsBusy(true);
    try {
      const sessionId = await startCaptureSession({
        audioInputSpecs,
        sampleRate: audioSampleRate,
        channels: audioChannels,
      });
      setCurrentSessionId(sessionId);
      setIsCapturing(true);
      setCaptureMessage(`Capture started: ${sessionId}`);
    } catch (error) {
      setCaptureMessage(`Failed to start capture: ${extractErrorMessage(error)}`);
    } finally {
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

  return (
    <div className="h-screen w-full bg-zinc-100/80 text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto grid h-full max-w-[1600px] grid-cols-1 gap-4 p-4 lg:grid-cols-[260px_1fr]">
        <aside className="min-h-0">
          <Card className="h-full overflow-hidden">
            <CardHeader className="space-y-3 border-b border-zinc-200/80 pb-4 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">ScholarClaw</CardTitle>
                <Badge variant="secondary">Hackathon</Badge>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">学术领航虾 · AI research copilot</p>
            </CardHeader>
            <CardContent className="p-3">
              <ScrollArea className="h-[calc(100vh-170px)]">
                <nav className="space-y-1">
                  {navItems.map((item) => {
                    const isActive = activeView === item.id;
                    return (
                      <Button
                        key={item.id}
                        variant={isActive ? "default" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => setActiveView(item.id)}
                      >
                        {item.label}
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
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="flex items-center gap-2">
                        <Badge variant={isCapturing ? "default" : "secondary"}>
                          {isCapturing ? "Capturing" : "Idle"}
                        </Badge>
                        <p className="text-sm text-zinc-600 dark:text-zinc-300">{captureMessage}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" disabled={isBusy} onClick={handleLoadSession}>
                          Sync Session
                        </Button>
                        <Button variant="outline" size="sm" disabled={isBusy} onClick={handleTranscribe}>
                          Transcribe
                        </Button>
                        <Button variant="outline" size="sm" disabled={isBusy} onClick={handleGenerateAnalysis}>
                          Generate AI
                        </Button>
                        <Button variant="outline" size="sm" disabled={isBusy || !isCapturing} onClick={handleStopCapture}>
                          Stop
                        </Button>
                        <Button size="sm" disabled={isBusy || isCapturing} onClick={handleStartCapture}>
                          Start Capture
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                  <SessionViewer session={activeSession} />
                </>
              ) : null}
              {activeView === "graph" ? <GraphViewer nodes={mockGraphNodes} edges={mockGraphEdges} /> : null}
              {activeView === "qa" ? <QAPanel items={activeSession.qaSimulator} /> : null}
              {activeView === "settings" ? <SettingsPanel /> : null}
            </div>
          </ScrollArea>
        </main>
      </div>
    </div>
  );
}

export default App;
