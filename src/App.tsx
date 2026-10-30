import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import { CaptureSetupCard } from "./components/CaptureSetupCard";
import { FloatingController } from "./components/FloatingController";
import { GraphViewer } from "./components/GraphViewer";
import { JoinMeetingCard } from "./components/JoinMeetingCard";
import { LiveTranscriptPanel } from "./components/LiveTranscriptPanel";
import { QAPanel } from "./components/QAPanel";
import { RegionSelector } from "./components/RegionSelector";
import { SessionViewer } from "./components/SessionViewer";
import { SettingsPanel } from "./components/SettingsPanel";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { ScrollArea } from "./components/ui/scroll-area";
import {
	buildBotCapturePrefs,
	buildCaptureStartOptions,
} from "./lib/captureOptions";
import { useT } from "./lib/i18n";
import { mockAcademicSession } from "./lib/mockData";
import type {
	CaptureDisplayInfo,
	CaptureHelperStatus,
	CaptureRegion,
	CaptureSessionMeta,
	CaptureWindowTarget,
} from "./lib/tauri";
import {
	checkCapturePrerequisites,
	deleteSession,
	exportSessionMarkdown,
	generateSessionAnalysis,
	getCaptureHelperStatus,
	getCaptureStatus,
	getLiveTranscript,
	getSessionData,
	isTauriRuntime,
	joinMeeting,
	listCaptureDisplays,
	listCaptureSessions,
	listCaptureWindows,
	openRegionSelector,
	refineTranscriptWithVisuals,
	revealInFinder,
	startCaptureSession,
	stopCaptureSession,
	syncBotCapturePrefs,
	transcribeSessionAudio,
} from "./lib/tauri";
import { currentWindowLabel } from "./lib/windowLabel";
import { useScheduleStore } from "./store/scheduleStore";
import { useSettingsStore } from "./store/settingsStore";
import { type NavView, useUiStore } from "./store/uiStore";
import type { AcademicSession, TranscriptSegment } from "./types";

const navKeys: {
	id: NavView;
	labelKey: "nav.capture" | "nav.graph" | "nav.qa" | "nav.settings";
}[] = [
	{ id: "capture", labelKey: "nav.capture" },
	{ id: "graph", labelKey: "nav.graph" },
	{ id: "qa", labelKey: "nav.qa" },
	{ id: "settings", labelKey: "nav.settings" },
];

/** Join this long before a scheduled start; give up this long after it. */
const SCHEDULE_LEAD_MS = 60_000;
const SCHEDULE_GRACE_MS = 30 * 60_000;

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

/** `capture-stopped` used to carry the bare session id; it is now an object. */
function sessionIdFromPayload(payload: unknown): string {
	if (typeof payload === "string") return payload;
	if (payload && typeof payload === "object") {
		const id = (payload as { sessionId?: unknown }).sessionId;
		if (typeof id === "string") return id;
	}
	return "";
}

function MainApp(): JSX.Element {
	const t = useT();
	const activeView = useUiStore((state) => state.activeView);
	const setActiveView = useUiStore((state) => state.setActiveView);
	const bumpGraphRefresh = useUiStore((state) => state.bumpGraphRefresh);
	const [isCapturing, setIsCapturing] = useState<boolean>(false);
	const [isBusy, setIsBusy] = useState<boolean>(false);
	const [activeSession, setActiveSession] =
		useState<AcademicSession>(mockAcademicSession);
	const [currentSessionId, setCurrentSessionId] = useState<string>(
		mockAcademicSession.id,
	);
	const [captureMessage, setCaptureMessage] =
		useState<string>("Ready to capture");
	const [sessionList, setSessionList] = useState<CaptureSessionMeta[]>([]);
	const [showSessionPicker, setShowSessionPicker] = useState<boolean>(false);
	/** In-app confirm (window.confirm is unreliable in Tauri WebView). */
	const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
	/** After first visit to Graph tab, keep GraphViewer mounted (hidden off-tab) so delete can refresh data. */
	const [graphViewerMounted, setGraphViewerMounted] = useState(false);
	const [captureDisplays, setCaptureDisplays] = useState<CaptureDisplayInfo[]>(
		[],
	);
	const [helperStatus, setHelperStatus] = useState<CaptureHelperStatus | null>(
		null,
	);
	/** Session whose live captions are shown, its segments, and whether ASR is still running. */
	const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
	const [liveSegments, setLiveSegments] = useState<TranscriptSegment[]>([]);
	const [liveActive, setLiveActive] = useState(false);
	const [liveError, setLiveError] = useState<string | null>(null);
	const [lastExportPath, setLastExportPath] = useState<string | null>(null);
	const screenshotDirectory = useSettingsStore(
		(state) => state.screenshotDirectory,
	);
	const asrProvider = useSettingsStore((state) => state.asrProvider);
	const asrEndpoint = useSettingsStore((state) => state.asrEndpoint);
	const asrApiKey = useSettingsStore((state) => state.asrApiKey);
	const asrModel = useSettingsStore((state) => state.asrModel);
	const asrLanguage = useSettingsStore((state) => state.asrLanguage);
	const openRouterModel = useSettingsStore((state) => state.openRouterModel);
	const openRouterApiKey = useSettingsStore((state) => state.openRouterApiKey);
	const openRouterMaxTokens = useSettingsStore(
		(state) => state.openRouterMaxTokens,
	);
	const themeMode = useSettingsStore((state) => state.themeMode);
	const language = useSettingsStore((state) => state.language);
	const captureSourceMode = useSettingsStore(
		(state) => state.captureSourceMode,
	);
	const captureDisplayIndex = useSettingsStore(
		(state) => state.captureDisplayIndex,
	);
	const setCaptureDisplayIndex = useSettingsStore(
		(state) => state.setCaptureDisplayIndex,
	);
	const silentCaptureMinimizeMain = useSettingsStore(
		(state) => state.silentCaptureMinimizeMain,
	);
	const selectedWindowId = useUiStore((state) => state.selectedWindowId);
	const scheduledMeetings = useScheduleStore((state) => state.meetings);
	const updateScheduledMeeting = useScheduleStore(
		(state) => state.updateMeeting,
	);
	const isCapturingRef = useRef(false);
	isCapturingRef.current = isCapturing;
	const joiningRef = useRef(false);
	const currentSessionIdRef = useRef(currentSessionId);
	currentSessionIdRef.current = currentSessionId;
	const liveSessionIdRef = useRef<string | null>(liveSessionId);
	liveSessionIdRef.current = liveSessionId;

	useEffect(() => {
		if (activeView === "graph") {
			setGraphViewerMounted(true);
		}
	}, [activeView]);

	const prevNavViewRef = useRef<NavView>(activeView);
	useEffect(() => {
		if (activeView === "graph" && prevNavViewRef.current !== "graph") {
			bumpGraphRefresh();
		}
		prevNavViewRef.current = activeView;
	}, [activeView, bumpGraphRefresh]);

	useEffect(() => {
		const root = document.documentElement;
		const media = window.matchMedia("(prefers-color-scheme: dark)");

		const applyTheme = (): void => {
			const isDark =
				themeMode === "dark" || (themeMode === "system" && media.matches);
			root.classList.toggle("dark", isDark);
			root.style.colorScheme = isDark ? "dark" : "light";
		};

		applyTheme();
		media.addEventListener("change", applyTheme);
		return () => {
			media.removeEventListener("change", applyTheme);
		};
	}, [themeMode]);

	const refreshHelperStatus = useCallback(async (): Promise<void> => {
		try {
			setHelperStatus(await getCaptureHelperStatus());
		} catch {
			setHelperStatus(null);
		}
	}, []);

	useEffect(() => {
		const loadPrerequisites = async (): Promise<void> => {
			try {
				const prerequisite = await checkCapturePrerequisites();
				const details = prerequisite.notes.join(" · ");
				setCaptureMessage(`${prerequisite.platform.toUpperCase()}: ${details}`);
			} catch (error) {
				setCaptureMessage(
					`Failed to check prerequisites: ${extractErrorMessage(error)}`,
				);
			}
		};

		void loadPrerequisites();
		void refreshHelperStatus();
		// Re-attach to a capture that is still running (e.g. after reloading the window).
		void getCaptureStatus()
			.then(async (status) => {
				if (status.running && status.sessionId) {
					setIsCapturing(true);
					setCurrentSessionId(status.sessionId);
					setLiveSessionId(status.sessionId);
					setLiveActive(Boolean(status.liveTranscript));
					setLiveSegments(await getLiveTranscript(status.sessionId));
				}
			})
			.catch(() => {});
	}, [refreshHelperStatus]);

	useEffect(() => {
		if (!isTauriRuntime()) {
			return;
		}
		const sync = (): void => {
			void syncBotCapturePrefs(
				buildBotCapturePrefs(useSettingsStore.getState()),
			).catch(() => {});
		};
		sync();
		return useSettingsStore.subscribe(sync);
	}, []);

	const refreshSession = useCallback(async (id: string): Promise<void> => {
		const fetchedSession = await getSessionData(id);
		setActiveSession(fetchedSession);
	}, []);

	const doStartCaptureRef = useRef<
		((region: CaptureRegion | null) => Promise<void>) | undefined
	>(undefined);

	doStartCaptureRef.current = useCallback(
		async (region: CaptureRegion | null): Promise<void> => {
			setIsBusy(true);
			try {
				await startCaptureSession({
					options: buildCaptureStartOptions(useSettingsStore.getState()),
					region,
				});
			} catch (error) {
				setCaptureMessage(
					`Failed to start capture: ${extractErrorMessage(error)}`,
				);
			} finally {
				setIsBusy(false);
			}
		},
		[],
	);

	const refreshCaptureDisplays = useCallback(async (): Promise<void> => {
		try {
			const list = await listCaptureDisplays();
			setCaptureDisplays(list);
		} catch (error) {
			setCaptureMessage(
				`Failed to list displays: ${extractErrorMessage(error)}`,
			);
			setCaptureDisplays([]);
		}
	}, []);

	useEffect(() => {
		if (activeView !== "capture") {
			return;
		}
		void refreshCaptureDisplays();
	}, [activeView, refreshCaptureDisplays]);

	useEffect(() => {
		if (captureDisplays.length === 0) {
			return;
		}
		if (captureDisplayIndex > captureDisplays.length) {
			setCaptureDisplayIndex(1);
		}
	}, [captureDisplays, captureDisplayIndex, setCaptureDisplayIndex]);

	const refreshSessionList = useCallback(async (): Promise<void> => {
		try {
			const list = await listCaptureSessions();
			setSessionList(list);
		} catch (error) {
			setCaptureMessage(
				`Failed to list sessions: ${extractErrorMessage(error)}`,
			);
		}
	}, []);

	const syncSessionAfterCapture = useCallback(
		async (sessionId: string): Promise<void> => {
			setCurrentSessionId(sessionId);
			try {
				await refreshSession(sessionId);
				setCaptureMessage(
					t("capture.sessionSynced").replace("{id}", sessionId),
				);
			} catch (error) {
				setCaptureMessage(
					`${t("capture.syncFailedAfterStop")} ${extractErrorMessage(error)}`,
				);
			}
			await refreshSessionList();
		},
		[t, refreshSession, refreshSessionList],
	);

	const runAnalysis = useCallback(
		async (sessionId: string): Promise<void> => {
			const s = useSettingsStore.getState();
			if (!s.openRouterApiKey.trim()) {
				setCaptureMessage(
					"OpenRouter API key is empty. Please set it in Settings.",
				);
				return;
			}
			setIsBusy(true);
			setCaptureMessage(t("capture.analyzing"));
			try {
				const result = await generateSessionAnalysis(
					sessionId,
					s.openRouterApiKey,
					s.openRouterModel,
					s.openRouterMaxTokens,
				);
				setCaptureMessage(`AI analysis generated: ${result}`);
				bumpGraphRefresh();
				if (currentSessionIdRef.current === sessionId) {
					await refreshSession(sessionId);
				}
			} catch (error) {
				setCaptureMessage(
					`Failed to generate analysis: ${extractErrorMessage(error)}`,
				);
			} finally {
				setIsBusy(false);
			}
		},
		[t, bumpGraphRefresh, refreshSession],
	);

	useEffect(() => {
		const unlisteners: Array<() => void> = [];
		let disposed = false;

		const add = async <T,>(
			event: string,
			handler: (payload: T) => void,
		): Promise<void> => {
			const un = await listen<T>(event, (e) => handler(e.payload));
			if (disposed) {
				un();
			} else {
				unlisteners.push(un);
			}
		};

		void add<CaptureRegion | null>("region-confirmed", (payload) => {
			void doStartCaptureRef.current?.(payload);
		});
		void add("region-cancelled", () => {
			setIsBusy(false);
			setCaptureMessage("Region selection cancelled");
		});
		void add<{ sessionId: string; warnings?: string[] }>(
			"capture-started",
			(payload) => {
				setCurrentSessionId(payload.sessionId);
				setIsCapturing(true);
				liveSessionIdRef.current = payload.sessionId;
				setLiveSessionId(payload.sessionId);
				setLiveSegments([]);
				setLiveError(null);
				setLastExportPath(null);
				void getCaptureStatus().then((status) => {
					setLiveActive(Boolean(status.liveTranscript));
				});
				const warnings = payload.warnings ?? [];
				setCaptureMessage(
					[
						t("capture.backgroundStarted").replace("{id}", payload.sessionId),
						...warnings,
					].join(" · "),
				);
			},
		);
		void add<unknown>("capture-stopped", (payload) => {
			setIsCapturing(false);
			const id = sessionIdFromPayload(payload);
			if (id) {
				void syncSessionAfterCapture(id);
			}
		});
		void add<{ sessionId: string }>("capture-auto-stopped", () => {
			setCaptureMessage(t("capture.autoStopped"));
		});
		void add<{ sessionId: string }>("capture-target-lost", () => {
			setCaptureMessage(t("capture.targetLost"));
		});
		void add<{ stage: string; message: string }>("join-status", (payload) => {
			setCaptureMessage(payload.message);
		});
		void add<{ sessionId: string; done: number; total: number }>(
			"transcribe-progress",
			(payload) => {
				setCaptureMessage(
					t("capture.transcribeProgress")
						.replace("{done}", String(payload.done))
						.replace("{total}", String(payload.total)),
				);
			},
		);
		void add<{ sessionId: string; segment: TranscriptSegment }>(
			"live-transcript",
			(payload) => {
				if (liveSessionIdRef.current !== payload.sessionId) {
					return;
				}
				setLiveSegments((prev) =>
					prev.some((seg) => seg.index === payload.segment.index)
						? prev
						: [...prev, payload.segment],
				);
			},
		);
		void add<{ sessionId: string; error: string }>(
			"live-transcript-error",
			(payload) => setLiveError(payload.error),
		);
		void add<{ sessionId: string; segments: number; failed: number }>(
			"live-transcript-finished",
			(payload) => {
				setLiveActive(false);
				setCaptureMessage(
					t("live.finishedMessage").replace(
						"{count}",
						String(payload.segments),
					),
				);
				if (currentSessionIdRef.current === payload.sessionId) {
					void refreshSession(payload.sessionId).catch(() => {});
				}
				const s = useSettingsStore.getState();
				if (
					payload.segments > 0 &&
					s.autoSummarizeOnCapture &&
					s.openRouterApiKey.trim()
				) {
					void runAnalysis(payload.sessionId);
				}
			},
		);

		return () => {
			disposed = true;
			for (const un of unlisteners) un();
		};
	}, [syncSessionAfterCapture, refreshSession, runAnalysis, t]);

	const handleJoinMeeting = useCallback(
		async (link: string, title: string): Promise<boolean> => {
			if (isCapturingRef.current || joiningRef.current) {
				setCaptureMessage(t("join.busy"));
				return false;
			}
			joiningRef.current = true;
			setIsBusy(true);
			try {
				const s = useSettingsStore.getState();
				const result = await joinMeeting({
					meeting: link,
					capture: buildCaptureStartOptions(s, title),
					fallbackDisplayIndex: s.captureDisplayIndex,
					minimizeMain: s.silentCaptureMinimizeMain,
				});
				setCaptureMessage(
					result.captured === "window"
						? t("join.recordingWindow").replace(
								"{window}",
								result.windowTitle || result.platform,
							)
						: t("join.recordingDisplay"),
				);
				return true;
			} catch (error) {
				setCaptureMessage(`${t("join.failed")}: ${extractErrorMessage(error)}`);
				return false;
			} finally {
				joiningRef.current = false;
				setIsBusy(false);
			}
		},
		[t],
	);

	// Scheduled meetings: join one minute before start (the app must be running).
	useEffect(() => {
		const tick = (): void => {
			const now = Date.now();
			for (const m of scheduledMeetings) {
				if (m.status !== "scheduled" || now < m.startAt - SCHEDULE_LEAD_MS) {
					continue;
				}
				if (now > m.startAt + SCHEDULE_GRACE_MS) {
					updateScheduledMeeting(m.id, { status: "missed" });
					continue;
				}
				if (isCapturingRef.current || joiningRef.current) {
					continue;
				}
				updateScheduledMeeting(m.id, { status: "joining", message: "" });
				void handleJoinMeeting(m.link, m.title).then((ok) => {
					updateScheduledMeeting(m.id, {
						status: ok ? "joined" : "failed",
					});
				});
				break;
			}
		};
		tick();
		const timer = setInterval(tick, 15_000);
		return () => clearInterval(timer);
	}, [scheduledMeetings, updateScheduledMeeting, handleJoinMeeting]);

	const handleStartCapture = async (): Promise<void> => {
		const s = useSettingsStore.getState();
		const options = buildCaptureStartOptions(s);
		const windowMode =
			captureSourceMode === "window" && (helperStatus?.available ?? false);
		const mode = windowMode
			? "window"
			: captureSourceMode === "region"
				? "region"
				: "display";

		if (mode === "region") {
			setIsBusy(true);
			try {
				await openRegionSelector();
			} catch (error) {
				setCaptureMessage(
					`Failed to open region selector: ${extractErrorMessage(error)}`,
				);
				setIsBusy(false);
			}
			return;
		}

		let target: CaptureWindowTarget | null = null;
		if (mode === "window") {
			try {
				const windows = await listCaptureWindows();
				const chosen =
					selectedWindowId !== null
						? windows.find((w) => w.id === selectedWindowId)
						: windows.find((w) => w.isMeeting);
				if (!chosen) {
					setCaptureMessage(t("capture.noMeetingWindow"));
					return;
				}
				target = { windowId: chosen.id, app: chosen.app, title: chosen.title };
			} catch (error) {
				setCaptureMessage(
					`Failed to list windows: ${extractErrorMessage(error)}`,
				);
				return;
			}
		} else if (captureDisplays.length === 0) {
			setCaptureMessage(t("capture.noDisplays"));
			void refreshCaptureDisplays();
			return;
		}

		setIsBusy(true);
		try {
			await startCaptureSession({
				options: {
					...options,
					title: target ? target.title || target.app : null,
				},
				region: null,
				displayIndex: mode === "display" ? captureDisplayIndex : null,
				window: target,
			});
			if (silentCaptureMinimizeMain) {
				try {
					await getCurrentWindow().minimize();
				} catch {
					// ignore minimize failures (e.g. web preview)
				}
			}
		} catch (error) {
			setCaptureMessage(
				`Failed to start capture: ${extractErrorMessage(error)}`,
			);
		} finally {
			setIsBusy(false);
		}
	};

	const handleStopCapture = async (): Promise<void> => {
		setIsBusy(true);
		try {
			await stopCaptureSession();
			setIsCapturing(false);
			// Session sync + message: handled by `capture-stopped` listener (same as floating stop)
		} catch (error) {
			setCaptureMessage(
				`Failed to stop capture: ${extractErrorMessage(error)}`,
			);
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
			setCaptureMessage(
				`Failed to fetch session: ${extractErrorMessage(error)}`,
			);
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
			setCaptureMessage(result);
			await refreshSession(currentSessionId);
		} catch (error) {
			setCaptureMessage(`Failed to transcribe: ${extractErrorMessage(error)}`);
		} finally {
			setIsBusy(false);
		}
	};

	const handleRefineTranscriptVisual = async (): Promise<void> => {
		if (!openRouterApiKey.trim()) {
			setCaptureMessage(
				"OpenRouter API key is empty. Please set it in Settings.",
			);
			return;
		}
		setIsBusy(true);
		try {
			const result = await refineTranscriptWithVisuals(
				currentSessionId,
				openRouterApiKey,
				openRouterModel,
				openRouterMaxTokens,
			);
			setCaptureMessage(result);
			await refreshSession(currentSessionId);
		} catch (error) {
			setCaptureMessage(
				`Failed to refine transcript: ${extractErrorMessage(error)}`,
			);
		} finally {
			setIsBusy(false);
		}
	};

	const handleExportMarkdown = async (): Promise<void> => {
		setIsBusy(true);
		try {
			const dateLabel = activeSession.date
				? new Date(activeSession.date).toLocaleString(
						language === "zh" ? "zh-CN" : "en-US",
					)
				: "";
			const path = await exportSessionMarkdown({
				id: currentSessionId,
				suggestedName:
					activeSession.title && activeSession.title !== "Local Capture Session"
						? activeSession.title
						: currentSessionId,
				dateLabel,
				language,
			});
			if (path) {
				setLastExportPath(path);
				setCaptureMessage(t("export.done").replace("{path}", path));
			}
		} catch (error) {
			setCaptureMessage(`${t("export.failed")}: ${extractErrorMessage(error)}`);
		} finally {
			setIsBusy(false);
		}
	};

	const handleSelectSession = async (id: string): Promise<void> => {
		setCurrentSessionId(id);
		setCaptureMessage(`Loading session: ${id}...`);
		setIsBusy(true);
		try {
			await refreshSession(id);
			setCaptureMessage(`Loaded session: ${id}`);
		} catch (error) {
			setCaptureMessage(
				`Failed to load session: ${extractErrorMessage(error)}`,
			);
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

	const showLivePanel =
		liveSessionId !== null &&
		liveSessionId === currentSessionId &&
		(liveActive || isCapturing || liveSegments.length > 0);

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
							<p className="text-xs text-zinc-500 dark:text-zinc-400">
								{t("app.subtitle")}
							</p>
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
												<div className="flex min-w-0 flex-1 items-center gap-2">
													<Badge
														variant={isCapturing ? "default" : "secondary"}
													>
														{isCapturing
															? t("capture.capturing")
															: t("capture.idle")}
													</Badge>
													<p className="min-w-0 break-words text-sm text-zinc-600 dark:text-zinc-300">
														{captureMessage}
													</p>
													{lastExportPath ? (
														<Button
															variant="ghost"
															size="sm"
															className="h-7 shrink-0 text-xs"
															onClick={() =>
																void revealInFinder(lastExportPath)
															}
														>
															{t("export.reveal")}
														</Button>
													) : null}
												</div>
												<div className="flex flex-wrap items-center gap-2">
													{isCapturing ? (
														<Button
															size="sm"
															variant="outline"
															className="border-red-300 text-red-700 dark:border-red-800 dark:text-red-300"
															disabled={isBusy}
															onClick={handleStopCapture}
														>
															{t("capture.stop")}
														</Button>
													) : (
														<Button
															size="sm"
															disabled={
																isBusy ||
																(captureSourceMode === "display" &&
																	captureDisplays.length === 0)
															}
															onClick={handleStartCapture}
														>
															{t("capture.startCapture")}
														</Button>
													)}
												</div>
											</div>

											<div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
												<CaptureSetupCard
													helper={helperStatus}
													onRefreshHelper={refreshHelperStatus}
													captureDisplays={captureDisplays}
													onRefreshDisplays={refreshCaptureDisplays}
													disabled={isCapturing}
												/>
												<JoinMeetingCard
													busy={isBusy}
													isCapturing={isCapturing}
													onJoinNow={async (link, title) => {
														await handleJoinMeeting(link, title);
													}}
												/>
											</div>

											<div className="flex flex-wrap items-center gap-2 border-t border-zinc-200/80 pt-3 dark:border-zinc-800">
												<span className="mr-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
													{t("capture.sessionTools")}
												</span>
												<Button
													variant={showSessionPicker ? "default" : "outline"}
													size="sm"
													onClick={toggleSessionPicker}
												>
													{showSessionPicker
														? t("capture.hideSessions")
														: t("capture.browseSessions")}
												</Button>
												<Button
													variant="outline"
													size="sm"
													disabled={isBusy}
													onClick={handleLoadSession}
												>
													{t("capture.syncSession")}
												</Button>
												<Button
													variant="outline"
													size="sm"
													disabled={isBusy || isCapturing}
													title={t("capture.transcribeHint")}
													onClick={handleTranscribe}
												>
													{t("capture.transcribe")}
												</Button>
												<Button
													variant="outline"
													size="sm"
													disabled={isBusy}
													title={t("capture.refineTranscriptVisualHint")}
													onClick={() => void handleRefineTranscriptVisual()}
												>
													{t("capture.refineTranscriptVisual")}
												</Button>
												<Button
													variant="outline"
													size="sm"
													disabled={isBusy}
													onClick={() => void runAnalysis(currentSessionId)}
												>
													{t("capture.generateAi")}
												</Button>
												<Button
													variant="outline"
													size="sm"
													disabled={isBusy || !isTauriRuntime()}
													title={t("export.hint")}
													onClick={() => void handleExportMarkdown()}
												>
													{t("export.button")}
												</Button>
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
																			onClick={() =>
																				void handleSelectSession(s.id)
																			}
																			className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-md px-1 py-0.5 text-left"
																		>
																			<span className="truncate text-xs font-medium">
																				{s.title || s.id}
																			</span>
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
																					<span className="text-[10px] text-emerald-500">
																						{t("sessions.audio")}
																					</span>
																				) : null}
																				{s.hasTranscript ? (
																					<span className="text-[10px] text-blue-500">
																						{t("sessions.transcript")}
																					</span>
																				) : null}
																				{s.hasSummary ? (
																					<span className="text-[10px] text-violet-500">
																						{t("sessions.analyzed")}
																					</span>
																				) : null}
																			</div>
																			{s.tags.length > 0 ? (
																				<div className="mt-0.5 flex w-full min-w-0 flex-wrap gap-1.5">
																					{s.tags
																						.slice(0, 6)
																						.map((tag: string) => (
																							<Badge
																								key={tag}
																								variant="secondary"
																								className="h-auto min-h-5 w-fit max-w-full shrink px-2 py-0.5 text-left text-[10px] leading-snug text-zinc-700 whitespace-normal break-words dark:text-zinc-200"
																							>
																								{String(tag).replace(
																									/^"|"$/g,
																									"",
																								)}
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
									{showLivePanel ? (
										<LiveTranscriptPanel
											segments={liveSegments}
											active={isCapturing || liveActive}
											error={liveError}
										/>
									) : null}
									<SessionViewer session={activeSession} />
								</>
							) : null}
							{graphViewerMounted ? (
								<div
									className={activeView === "graph" ? "block" : "hidden"}
									aria-hidden={activeView !== "graph"}
								>
									<GraphViewer />
								</div>
							) : null}
							{activeView === "qa" ? (
								<QAPanel items={activeSession.qaSimulator} />
							) : null}
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
