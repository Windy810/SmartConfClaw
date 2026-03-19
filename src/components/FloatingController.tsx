import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useT } from "../lib/i18n";

export function FloatingController(): JSX.Element {
  const t = useT();
  const [elapsed, setElapsed] = useState(0);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleStop = async () => {
    setStopping(true);
    try {
      await invoke("stop_capture_session");
    } catch (error) {
      console.error("Failed to stop capture:", error);
      setStopping(false);
    }
  };

  const handleDrag = async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    try {
      await getCurrentWindow().startDragging();
    } catch {
      // ignore if not supported
    }
  };

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body, #root { background: transparent !important; }
        @keyframes rec-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }
        .float-stop-btn {
          position: relative;
          z-index: 2;
          padding: 5px 18px;
          border-radius: 8px;
          border: none;
          background: #ef4444;
          color: white;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s;
        }
        .float-stop-btn:hover { background: #dc2626; }
        .float-stop-btn:active { background: #b91c1c; }
        .float-stop-btn:disabled { opacity: 0.6; cursor: wait; }
      `}</style>

      <div
        onMouseDown={handleDrag}
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          borderRadius: 14,
          background: "rgba(24, 24, 27, 0.88)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow:
            "0 8px 32px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.06) inset",
          color: "white",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
          fontSize: 13,
          cursor: "grab",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#ef4444",
              animation: "rec-pulse 1.4s ease-in-out infinite",
              boxShadow: "0 0 6px rgba(239,68,68,0.5)",
            }}
          />
          <span style={{ fontWeight: 600, fontSize: 12, letterSpacing: 0.5 }}>
            REC
          </span>
        </div>

        <span
          style={{
            fontVariantNumeric: "tabular-nums",
            fontWeight: 500,
            fontSize: 15,
            letterSpacing: 0.5,
            pointerEvents: "none",
          }}
        >
          {formatTime(elapsed)}
        </span>

        <button
          className="float-stop-btn"
          disabled={stopping}
          onClick={handleStop}
        >
          {stopping ? "..." : t("float.stop")}
        </button>
      </div>
    </>
  );
}
