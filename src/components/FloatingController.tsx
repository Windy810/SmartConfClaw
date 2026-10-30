import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useState } from "react";
import { formatClock } from "../lib/captureOptions";
import { useT } from "../lib/i18n";
import {
	type CaptureStatus,
	getCaptureStatus,
	setCapturePaused,
	stopCaptureSession,
} from "../lib/tauri";
import type { TranscriptSegment } from "../types";

export function FloatingController(): JSX.Element {
	const t = useT();
	const [status, setStatus] = useState<CaptureStatus | null>(null);
	const [stopping, setStopping] = useState(false);
	const [paused, setPaused] = useState(false);
	const [pauseBusy, setPauseBusy] = useState(false);
	const [caption, setCaption] = useState<string>("");

	// Elapsed time, pause state and source come from the backend so they stay correct even if
	// this window is recreated mid-session.
	useEffect(() => {
		let cancelled = false;
		const poll = (): void => {
			void getCaptureStatus()
				.then((s) => {
					if (cancelled) return;
					setStatus(s);
					if (typeof s.paused === "boolean") setPaused(s.paused);
				})
				.catch(() => {});
		};
		poll();
		const timer = setInterval(poll, 1000);
		return () => {
			cancelled = true;
			clearInterval(timer);
		};
	}, []);

	useEffect(() => {
		let unlisten: (() => void) | undefined;
		let disposed = false;
		void listen<{ sessionId: string; segment: TranscriptSegment }>(
			"live-transcript",
			(event) => setCaption(event.payload.segment.text),
		).then((un) => {
			if (disposed) un();
			else unlisten = un;
		});
		return () => {
			disposed = true;
			unlisten?.();
		};
	}, []);

	const statusLine = (): string => {
		if (!status?.running) return "";
		if (status.targetLost) return t("float.targetLost");
		const parts = [status.sourceLabel ?? ""];
		if (status.systemAudio) parts.push(t("float.systemAudio"));
		else if (status.recordingAudio) parts.push(t("float.micAudio"));
		else parts.push(t("float.noAudio"));
		if (status.liveTranscript) parts.push(t("float.liveOn"));
		return parts.filter(Boolean).join(" · ");
	};

	const handleStop = async () => {
		setStopping(true);
		try {
			await stopCaptureSession();
		} catch (error) {
			console.error("Failed to stop capture:", error);
			setStopping(false);
		}
	};

	const handleTogglePause = async () => {
		setPauseBusy(true);
		try {
			const next = !paused;
			await setCapturePaused(next);
			setPaused(next);
		} catch (error) {
			console.error("Failed to toggle pause:", error);
		} finally {
			setPauseBusy(false);
		}
	};

	const startWindowDrag = useCallback(async () => {
		try {
			await getCurrentWindow().startDragging();
		} catch {
			// ignore if not supported
		}
	}, []);

	const handleDrag = useCallback(
		async (e: React.MouseEvent) => {
			if ((e.target as HTMLElement).closest("button")) return;
			e.preventDefault();
			await startWindowDrag();
		},
		[startWindowDrag],
	);

	const handleDragKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				void startWindowDrag();
			}
		},
		[startWindowDrag],
	);

	return (
		<>
			<style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body, #root { background: transparent !important; }
        @keyframes rec-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes paused-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
        .float-btn {
          position: relative;
          z-index: 2;
          padding: 4px 10px;
          border-radius: 7px;
          border: none;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s, opacity 0.15s;
        }
        .float-btn:disabled { opacity: 0.55; cursor: wait; }
        .float-pause {
          background: rgba(234, 179, 8, 0.92);
          color: #1c1917;
        }
        .float-pause:hover { background: rgba(250, 204, 21, 0.95); }
        .float-stop {
          background: rgba(239, 68, 68, 0.92);
          color: white;
        }
        .float-stop:hover { background: rgba(220, 38, 38, 0.95); }
      `}</style>

			{/* biome-ignore lint/a11y/useSemanticElements: cannot nest inner Pause/Stop <button> inside an outer <button> */}
			<div
				role="button"
				tabIndex={0}
				aria-label={t("float.dragHandle")}
				onMouseDown={handleDrag}
				onKeyDown={handleDragKeyDown}
				style={{
					width: "100%",
					height: "100%",
					display: "flex",
					flexDirection: "column",
					justifyContent: "center",
					gap: 4,
					padding: "6px 10px",
					borderRadius: 12,
					background: "rgba(24, 24, 27, 0.42)",
					backdropFilter: "blur(18px) saturate(1.2)",
					WebkitBackdropFilter: "blur(18px) saturate(1.2)",
					border: "1px solid rgba(255,255,255,0.12)",
					boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
					color: "white",
					fontFamily:
						"-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
					fontSize: 12,
					cursor: "grab",
					overflow: "hidden",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						gap: 8,
					}}
				>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 6,
							pointerEvents: "none",
							minWidth: 0,
						}}
					>
						<div
							style={{
								width: 7,
								height: 7,
								borderRadius: "50%",
								flexShrink: 0,
								background: paused ? "#eab308" : "#ef4444",
								animation: paused
									? "paused-pulse 2s ease-in-out infinite"
									: "rec-pulse 1.4s ease-in-out infinite",
								boxShadow: paused
									? "0 0 6px rgba(234,179,8,0.45)"
									: "0 0 6px rgba(239,68,68,0.45)",
							}}
						/>
						<span style={{ fontWeight: 600, fontSize: 11, letterSpacing: 0.4 }}>
							{paused ? "‖" : "●"} REC
						</span>
					</div>

					<span
						style={{
							fontVariantNumeric: "tabular-nums",
							fontWeight: 500,
							fontSize: 13,
							letterSpacing: 0.4,
							pointerEvents: "none",
							opacity: paused ? 0.65 : 1,
						}}
					>
						{formatClock(status?.elapsedSec ?? 0)}
					</span>

					<div
						style={{
							display: "flex",
							alignItems: "center",
							gap: 6,
							flexShrink: 0,
						}}
					>
						<button
							type="button"
							className="float-btn float-pause"
							disabled={pauseBusy}
							onClick={() => void handleTogglePause()}
						>
							{pauseBusy ? "…" : paused ? t("float.resume") : t("float.pause")}
						</button>
						<button
							type="button"
							className="float-btn float-stop"
							disabled={stopping}
							onClick={() => void handleStop()}
						>
							{stopping ? "…" : t("float.stop")}
						</button>
					</div>
				</div>
				<div
					title={caption || statusLine()}
					style={{
						pointerEvents: "none",
						fontSize: 11,
						lineHeight: "15px",
						opacity: caption ? 0.95 : 0.7,
						overflow: "hidden",
						display: "-webkit-box",
						WebkitLineClamp: 2,
						WebkitBoxOrient: "vertical",
					}}
				>
					{caption
						? caption.length > 110
							? `…${caption.slice(-110)}`
							: caption
						: statusLine()}
				</div>
			</div>
		</>
	);
}
