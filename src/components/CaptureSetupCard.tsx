import { useCallback, useEffect, useState } from "react";

import { useT } from "../lib/i18n";
import {
	type CaptureDisplayInfo,
	type CaptureHelperStatus,
	type CaptureWindowInfo,
	listCaptureWindows,
	requestScreenRecordingPermission,
} from "../lib/tauri";
import {
	type CaptureSourceMode,
	useSettingsStore,
} from "../store/settingsStore";
import { useUiStore } from "../store/uiStore";
import { Button } from "./ui/button";

interface CaptureSetupCardProps {
	helper: CaptureHelperStatus | null;
	onRefreshHelper: () => Promise<void>;
	captureDisplays: CaptureDisplayInfo[];
	onRefreshDisplays: () => Promise<void>;
	disabled: boolean;
}

function errorText(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return "Unknown error";
}

const selectCls =
	"min-w-[200px] max-w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

function Toggle({
	checked,
	disabled,
	onChange,
	label,
	hint,
}: {
	checked: boolean;
	disabled?: boolean;
	onChange: (value: boolean) => void;
	label: string;
	hint?: string | null;
}): JSX.Element {
	return (
		<label
			className={`flex items-start gap-2 text-xs ${
				disabled
					? "cursor-not-allowed opacity-60"
					: "cursor-pointer text-zinc-700 dark:text-zinc-200"
			}`}
		>
			<input
				type="checkbox"
				className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-zinc-300 dark:border-zinc-600"
				checked={checked}
				disabled={disabled}
				onChange={(e) => onChange(e.target.checked)}
			/>
			<span>
				<span className="font-medium">{label}</span>
				{hint ? (
					<span className="mt-0.5 block text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
						{hint}
					</span>
				) : null}
			</span>
		</label>
	);
}

export function CaptureSetupCard({
	helper,
	onRefreshHelper,
	captureDisplays,
	onRefreshDisplays,
	disabled,
}: CaptureSetupCardProps): JSX.Element {
	const t = useT();
	const mode = useSettingsStore((s) => s.captureSourceMode);
	const setMode = useSettingsStore((s) => s.setCaptureSourceMode);
	const captureDisplayIndex = useSettingsStore((s) => s.captureDisplayIndex);
	const setCaptureDisplayIndex = useSettingsStore(
		(s) => s.setCaptureDisplayIndex,
	);
	const minimizeMain = useSettingsStore((s) => s.silentCaptureMinimizeMain);
	const setMinimizeMain = useSettingsStore(
		(s) => s.setSilentCaptureMinimizeMain,
	);
	const systemAudio = useSettingsStore((s) => s.captureSystemAudio);
	const setSystemAudio = useSettingsStore((s) => s.setCaptureSystemAudio);
	const includeMic = useSettingsStore((s) => s.captureIncludeMic);
	const setIncludeMic = useSettingsStore((s) => s.setCaptureIncludeMic);
	const liveTranscript = useSettingsStore((s) => s.liveTranscriptEnabled);
	const setLiveTranscript = useSettingsStore((s) => s.setLiveTranscriptEnabled);
	const autoStop = useSettingsStore((s) => s.autoStopOnWindowClose);
	const setAutoStop = useSettingsStore((s) => s.setAutoStopOnWindowClose);
	const asrEndpoint = useSettingsStore((s) => s.asrEndpoint);
	const selectedWindowId = useUiStore((s) => s.selectedWindowId);
	const setSelectedWindowId = useUiStore((s) => s.setSelectedWindowId);

	const [windows, setWindows] = useState<CaptureWindowInfo[]>([]);
	const [windowError, setWindowError] = useState<string | null>(null);

	const windowModeAvailable = helper?.available ?? false;
	const systemAudioAvailable = helper?.systemAudio ?? false;
	const systemAudioEffective =
		systemAudio && (systemAudioAvailable || helper === null);
	// Without system audio the selected input devices (mic / BlackHole) are always recorded.
	const micForced = !systemAudioEffective;

	const refreshWindows = useCallback(async (): Promise<void> => {
		try {
			const list = await listCaptureWindows();
			setWindows(list);
			setWindowError(null);
		} catch (error) {
			setWindows([]);
			setWindowError(errorText(error));
		}
	}, []);

	useEffect(() => {
		if (mode === "window" && windowModeAvailable) {
			void refreshWindows();
		}
	}, [mode, windowModeAvailable, refreshWindows]);

	useEffect(() => {
		if (
			selectedWindowId !== null &&
			windows.length > 0 &&
			!windows.some((w) => w.id === selectedWindowId)
		) {
			setSelectedWindowId(null);
		}
	}, [windows, selectedWindowId, setSelectedWindowId]);

	const modes: { id: CaptureSourceMode; label: string; off?: boolean }[] = [
		{
			id: "window",
			label: t("capture.sourceWindow"),
			off: !windowModeAvailable,
		},
		{ id: "display", label: t("capture.sourceDisplay") },
		{ id: "region", label: t("capture.sourceRegion") },
	];
	const autoCandidate = windows.find((w) => w.isMeeting);

	return (
		<div className="space-y-3 rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
			<div>
				<p className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
					{t("capture.sourceMode")}
				</p>
				<div className="flex flex-wrap gap-2">
					{modes.map((m) => (
						<Button
							key={m.id}
							type="button"
							size="sm"
							disabled={disabled || (m.off && helper !== null)}
							variant={mode === m.id ? "default" : "outline"}
							onClick={() => setMode(m.id)}
						>
							{m.label}
						</Button>
					))}
				</div>
			</div>

			{mode === "window" ? (
				windowModeAvailable ? (
					<div className="space-y-2">
						<div className="flex flex-wrap items-center gap-2">
							<label
								htmlFor="capture-window-select"
								className="text-xs text-zinc-600 dark:text-zinc-300"
							>
								{t("capture.selectWindow")}
							</label>
							<select
								id="capture-window-select"
								className={selectCls}
								disabled={disabled}
								value={selectedWindowId ?? "auto"}
								onChange={(e) =>
									setSelectedWindowId(
										e.target.value === "auto"
											? null
											: Number.parseInt(e.target.value, 10),
									)
								}
							>
								<option value="auto">
									{autoCandidate
										? `${t("capture.windowAuto")} → ${autoCandidate.app}${autoCandidate.title ? ` — ${autoCandidate.title}` : ""}`
										: t("capture.windowAuto")}
								</option>
								{windows.map((w) => (
									<option key={w.id} value={w.id}>
										{w.isMeeting ? "★ " : ""}
										{w.app}
										{w.title ? ` — ${w.title}` : ""}
										{w.onScreen ? "" : ` (${t("capture.windowOffscreen")})`}
									</option>
								))}
							</select>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="h-7 text-xs"
								onClick={() => void refreshWindows()}
							>
								{t("capture.refreshDisplays")}
							</Button>
						</div>
						{windowError ? (
							<p className="text-xs text-red-600 dark:text-red-400">
								{windowError}
							</p>
						) : null}
						<p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
							{t("capture.windowHint")}
						</p>
						<Toggle
							checked={autoStop}
							disabled={disabled}
							onChange={setAutoStop}
							label={t("capture.autoStopOnClose")}
						/>
					</div>
				) : (
					<p className="rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
						{t("capture.windowUnavailable")}
						{helper?.detail ? ` (${helper.detail})` : ""}
					</p>
				)
			) : null}

			{mode === "display" ? (
				<div className="space-y-2">
					<div className="flex flex-wrap items-center gap-2">
						<label
							htmlFor="capture-display-select"
							className="text-xs text-zinc-600 dark:text-zinc-300"
						>
							{t("capture.selectDisplay")}
						</label>
						<select
							id="capture-display-select"
							className={selectCls}
							disabled={disabled || captureDisplays.length === 0}
							value={
								captureDisplays.some((d) => d.index === captureDisplayIndex)
									? captureDisplayIndex
									: 1
							}
							onChange={(e) =>
								setCaptureDisplayIndex(Number.parseInt(e.target.value, 10))
							}
						>
							{captureDisplays.length === 0 ? (
								<option value={1}>—</option>
							) : (
								captureDisplays.map((d) => (
									<option key={d.index} value={d.index}>
										{d.index}: {d.label} ({d.width}×{d.height})
									</option>
								))
							)}
						</select>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 text-xs"
							onClick={() => void onRefreshDisplays()}
						>
							{t("capture.refreshDisplays")}
						</Button>
					</div>
					<p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
						{t("capture.fullscreenSpaceExplainer")}
					</p>
				</div>
			) : null}

			{mode !== "region" ? (
				<Toggle
					checked={minimizeMain}
					disabled={disabled}
					onChange={setMinimizeMain}
					label={t("capture.minimizeOnStart")}
				/>
			) : null}

			<div className="space-y-2 border-t border-zinc-200/80 pt-3 dark:border-zinc-800">
				<p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
					{t("capture.audioAndTranscript")}
				</p>
				<Toggle
					checked={systemAudioEffective}
					disabled={disabled || (helper !== null && !systemAudioAvailable)}
					onChange={setSystemAudio}
					label={t("capture.systemAudio")}
					hint={
						helper !== null && !systemAudioAvailable
							? t("capture.systemAudioUnavailable")
							: t("capture.systemAudioHint")
					}
				/>
				<Toggle
					checked={includeMic || micForced}
					disabled={disabled || micForced}
					onChange={setIncludeMic}
					label={t("capture.includeMic")}
					hint={
						micForced
							? t("capture.devicesUsedHint")
							: t("capture.includeMicHint")
					}
				/>
				<Toggle
					checked={liveTranscript}
					disabled={disabled}
					onChange={setLiveTranscript}
					label={t("capture.liveTranscript")}
					hint={
						liveTranscript && !asrEndpoint.trim()
							? t("capture.liveTranscriptNoAsr")
							: t("capture.liveTranscriptHint")
					}
				/>
			</div>

			{helper?.available && !helper.screenRecording ? (
				<div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
					<span className="flex-1">{t("capture.permissionMissing")}</span>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="h-7 text-xs"
						onClick={() =>
							void requestScreenRecordingPermission().finally(() => {
								void onRefreshHelper();
							})
						}
					>
						{t("capture.permissionGrant")}
					</Button>
				</div>
			) : null}
		</div>
	);
}
