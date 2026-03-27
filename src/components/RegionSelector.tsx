import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../lib/i18n";
import { cancelRegionSelection, confirmRegionSelection } from "../lib/tauri";

interface SelectionRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export function RegionSelector(): JSX.Element {
	const t = useT();
	const [selection, setSelection] = useState<SelectionRect | null>(null);
	const [dragOrigin, setDragOrigin] = useState<{ x: number; y: number } | null>(
		null,
	);
	const [confirmed, setConfirmed] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		document.body.style.background = "transparent";
		document.documentElement.style.background = "transparent";
		return () => {
			document.body.style.background = "";
			document.documentElement.style.background = "";
		};
	}, []);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				void handleCancel();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handleCancel]);

	const handlePointerDown = useCallback(
		(e: React.PointerEvent) => {
			if (confirmed) return;
			setDragOrigin({ x: e.clientX, y: e.clientY });
			setSelection(null);
		},
		[confirmed],
	);

	const handlePointerMove = useCallback(
		(e: React.PointerEvent) => {
			if (!dragOrigin) return;
			const x = Math.min(dragOrigin.x, e.clientX);
			const y = Math.min(dragOrigin.y, e.clientY);
			const w = Math.abs(e.clientX - dragOrigin.x);
			const h = Math.abs(e.clientY - dragOrigin.y);
			setSelection({ x, y, w, h });
		},
		[dragOrigin],
	);

	const handlePointerUp = useCallback(() => {
		if (!dragOrigin) return;
		setDragOrigin(null);
		if (selection && selection.w > 10 && selection.h > 10) {
			setConfirmed(true);
		}
	}, [dragOrigin, selection]);

	const handleConfirm = async () => {
		if (!selection) return;
		await confirmRegionSelection({
			x: selection.x,
			y: selection.y,
			width: selection.w,
			height: selection.h,
		});
	};

	const handleFullScreen = async () => {
		await confirmRegionSelection(null);
	};

	const handleCancel = async () => {
		await cancelRegionSelection();
	};

	const handleReset = () => {
		setSelection(null);
		setConfirmed(false);
	};

	return (
		<>
			<style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @keyframes region-pulse {
          0%, 100% { border-color: rgba(59,130,246,0.9); }
          50% { border-color: rgba(59,130,246,0.4); }
        }
        .region-btn {
          padding: 8px 20px;
          border: none;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
          cursor: pointer;
          transition: all 0.15s ease;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }
        .region-btn:hover { transform: translateY(-1px); }
        .region-btn:active { transform: translateY(0); }
        .region-btn-primary {
          background: rgba(59,130,246,0.9);
          color: white;
        }
        .region-btn-secondary {
          background: rgba(255,255,255,0.15);
          color: white;
          border: 1px solid rgba(255,255,255,0.2);
        }
        .region-btn-cancel {
          background: rgba(239,68,68,0.7);
          color: white;
        }
      `}</style>

			<div
				ref={rootRef}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				style={{
					position: "fixed",
					inset: 0,
					cursor: dragOrigin
						? "crosshair"
						: confirmed
							? "default"
							: "crosshair",
					userSelect: "none",
					background: "rgba(0,0,0,0.45)",
					fontFamily:
						"-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
				}}
			>
				{selection && (
					<div
						style={{
							position: "absolute",
							left: selection.x,
							top: selection.y,
							width: selection.w,
							height: selection.h,
							border: "2px solid rgba(59,130,246,0.9)",
							borderRadius: 4,
							boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
							background: "transparent",
							animation: confirmed ? "region-pulse 2s infinite" : "none",
							pointerEvents: "none",
						}}
					>
						<div
							style={{
								position: "absolute",
								top: -28,
								left: 0,
								background: "rgba(59,130,246,0.85)",
								color: "white",
								fontSize: 12,
								fontWeight: 600,
								padding: "2px 8px",
								borderRadius: 4,
								fontVariantNumeric: "tabular-nums",
							}}
						>
							{Math.round(selection.w)} × {Math.round(selection.h)}
						</div>
					</div>
				)}

				{!selection && !dragOrigin && (
					<div
						style={{
							position: "absolute",
							top: "42%",
							left: "50%",
							transform: "translate(-50%, -50%)",
							color: "white",
							textAlign: "center",
							pointerEvents: "none",
						}}
					>
						<p style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.3 }}>
							{t("region.dragHint")}
						</p>
						<p style={{ fontSize: 14, opacity: 0.6, marginTop: 8 }}>
							{t("region.subHint")}
						</p>
					</div>
				)}

				<div
					style={{
						position: "absolute",
						bottom: 40,
						left: "50%",
						transform: "translateX(-50%)",
						display: "flex",
						gap: 10,
						pointerEvents: "auto",
					}}
					onPointerDown={(e) => e.stopPropagation()}
				>
					{confirmed && (
						<>
							<button
								className="region-btn region-btn-primary"
								onClick={handleConfirm}
							>
								{t("region.confirm")}
							</button>
							<button
								className="region-btn region-btn-secondary"
								onClick={handleReset}
							>
								{t("region.reset")}
							</button>
						</>
					)}
					<button
						className="region-btn region-btn-secondary"
						onClick={handleFullScreen}
					>
						{t("region.fullscreen")}
					</button>
					<button
						className="region-btn region-btn-cancel"
						onClick={handleCancel}
					>
						{t("region.cancel")}
					</button>
				</div>
			</div>
		</>
	);
}
