import { useCallback, useEffect, useMemo, useState } from "react";

import { useT } from "../lib/i18n";
import {
	type AudioInputDevice,
	getBotEndpointStatus,
	listAudioInputDevices,
	pickScreenshotDirectory,
	setBotEndpointConfig,
} from "../lib/tauri";
import {
	type AppLanguage,
	type AsrProvider,
	type ModelProvider,
	type ThemeMode,
	useSettingsStore,
} from "../store/settingsStore";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "./ui/card";

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
	const screenshotDirectory = useSettingsStore(
		(state) => state.screenshotDirectory,
	);
	const autoSummarizeOnCapture = useSettingsStore(
		(state) => state.autoSummarizeOnCapture,
	);
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
	const openRouterMaxTokens = useSettingsStore(
		(state) => state.openRouterMaxTokens,
	);
	const setModelProvider = useSettingsStore((state) => state.setModelProvider);
	const setScreenshotDirectory = useSettingsStore(
		(state) => state.setScreenshotDirectory,
	);
	const setAutoSummarizeOnCapture = useSettingsStore(
		(state) => state.setAutoSummarizeOnCapture,
	);
	const setThemeMode = useSettingsStore((state) => state.setThemeMode);
	const setLanguage = useSettingsStore((state) => state.setLanguage);
	const setAudioInputSpecs = useSettingsStore(
		(state) => state.setAudioInputSpecs,
	);
	const setAudioSampleRate = useSettingsStore(
		(state) => state.setAudioSampleRate,
	);
	const setAudioChannels = useSettingsStore((state) => state.setAudioChannels);
	const setFrameIntervalSec = useSettingsStore(
		(state) => state.setFrameIntervalSec,
	);
	const setAsrProvider = useSettingsStore((state) => state.setAsrProvider);
	const setAsrEndpoint = useSettingsStore((state) => state.setAsrEndpoint);
	const setAsrApiKey = useSettingsStore((state) => state.setAsrApiKey);
	const setAsrModel = useSettingsStore((state) => state.setAsrModel);
	const setAsrLanguage = useSettingsStore((state) => state.setAsrLanguage);
	const setOpenRouterModel = useSettingsStore(
		(state) => state.setOpenRouterModel,
	);
	const setOpenRouterApiKey = useSettingsStore(
		(state) => state.setOpenRouterApiKey,
	);
	const setOpenRouterMaxTokens = useSettingsStore(
		(state) => state.setOpenRouterMaxTokens,
	);
	const resetDefaults = useSettingsStore((state) => state.resetDefaults);

	const [draftDirectory, setDraftDirectory] =
		useState<string>(screenshotDirectory);
	const [draftSelectedSpecs, setDraftSelectedSpecs] = useState<string[]>(() => [
		...audioInputSpecs,
	]);
	const [draftSampleRate, setDraftSampleRate] = useState<string>(
		String(audioSampleRate),
	);
	const [draftChannels, setDraftChannels] = useState<string>(
		String(audioChannels),
	);
	const [draftFrameIntervalSec, setDraftFrameIntervalSec] = useState<string>(
		String(frameIntervalSec),
	);
	const [draftAsrEndpoint, setDraftAsrEndpoint] = useState<string>(asrEndpoint);
	const [draftAsrApiKey, setDraftAsrApiKey] = useState<string>(asrApiKey);
	const [draftAsrModel, setDraftAsrModel] = useState<string>(asrModel);
	const [draftAsrLanguage, setDraftAsrLanguage] = useState<string>(asrLanguage);
	const [draftOpenRouterModel, setDraftOpenRouterModel] =
		useState<string>(openRouterModel);
	const [draftOpenRouterApiKey, setDraftOpenRouterApiKey] =
		useState<string>(openRouterApiKey);
	const [draftOpenRouterMaxTokens, setDraftOpenRouterMaxTokens] =
		useState<string>(String(openRouterMaxTokens));
	const [audioDevices, setAudioDevices] = useState<AudioInputDevice[]>([]);
	const [audioListError, setAudioListError] = useState<string | null>(null);

	const [botEnabled, setBotEnabled] = useState(false);
	const [botPortDraft, setBotPortDraft] = useState("18765");
	const [botSecretDraft, setBotSecretDraft] = useState("");
	const [botSecretTouched, setBotSecretTouched] = useState(false);
	const [botSecretConfigured, setBotSecretConfigured] = useState(false);
	const [botListening, setBotListening] = useState(false);
	const [botBaseUrl, setBotBaseUrl] = useState("http://127.0.0.1:18765");
	const [botLoadError, setBotLoadError] = useState<string | null>(null);
	const [botSaveMessage, setBotSaveMessage] = useState<string | null>(null);

	const loadDevices = useCallback(async (): Promise<void> => {
		setAudioListError(null);
		try {
			const devices = await listAudioInputDevices();
			setAudioDevices(devices);
		} catch (error) {
			setAudioDevices([]);
			const msg =
				error instanceof Error
					? error.message
					: typeof error === "string"
						? error
						: "Unknown error";
			setAudioListError(msg);
		}
	}, []);

	useEffect(() => {
		void loadDevices();
	}, [loadDevices]);

	useEffect(() => {
		void (async () => {
			setBotLoadError(null);
			try {
				const s = await getBotEndpointStatus();
				setBotEnabled(s.enabled);
				setBotPortDraft(String(s.port));
				setBotListening(s.listening);
				setBotBaseUrl(s.baseUrl);
				setBotSecretConfigured(s.secretConfigured);
			} catch (error) {
				const msg =
					error instanceof Error
						? error.message
						: typeof error === "string"
							? error
							: "Unknown error";
				setBotLoadError(msg);
			}
		})();
	}, []);

	useEffect(() => {
		setDraftSelectedSpecs([...audioInputSpecs]);
	}, [audioInputSpecs]);

	useEffect(() => {
		setDraftOpenRouterMaxTokens(String(openRouterMaxTokens));
	}, [openRouterMaxTokens]);

	const orphanSpecs = useMemo(
		() =>
			draftSelectedSpecs.filter(
				(spec) => !audioDevices.some((d) => d.ffmpegSpec === spec),
			),
		[draftSelectedSpecs, audioDevices],
	);

	const micDevices = useMemo(
		() => audioDevices.filter((d) => !d.isLoopback),
		[audioDevices],
	);
	const loopbackDevices = useMemo(
		() => audioDevices.filter((d) => d.isLoopback),
		[audioDevices],
	);

	const toggleAudioSpec = useCallback((spec: string) => {
		setDraftSelectedSpecs((prev) => {
			if (prev.includes(spec)) {
				return prev.filter((s) => s !== spec);
			}
			return [...prev, spec];
		});
	}, []);

	const handleBrowseScreenshotDir = useCallback(async () => {
		const path = await pickScreenshotDirectory(draftDirectory);
		if (path) {
			setDraftDirectory(path);
		}
	}, [draftDirectory]);

	const inputCls =
		"w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none ring-zinc-300 transition focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-600";

	const handleSaveBotEndpoint = useCallback(async (): Promise<void> => {
		setBotSaveMessage(null);
		const port = Math.max(
			1024,
			Math.min(65535, Number.parseInt(botPortDraft, 10) || 18765),
		);
		try {
			await setBotEndpointConfig({
				enabled: botEnabled,
				port,
				secret: botSecretTouched ? botSecretDraft : undefined,
			});
			setBotSecretTouched(false);
			setBotSecretDraft("");
			const s = await getBotEndpointStatus();
			setBotListening(s.listening);
			setBotBaseUrl(s.baseUrl);
			setBotSecretConfigured(s.secretConfigured);
			setBotSaveMessage("OK");
		} catch (error) {
			const msg =
				error instanceof Error
					? error.message
					: typeof error === "string"
						? error
						: "Unknown error";
			setBotSaveMessage(msg);
		}
	}, [botEnabled, botPortDraft, botSecretDraft, botSecretTouched]);

	const curlExample = `curl -sS -X POST '${botBaseUrl}/v1/meeting' \\
  -H 'Content-Type: application/json' \\
  -d '{"meetingUrl":"https://example.com/your-meeting-link"}'`;

	return (
		<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
			<Card>
				<CardHeader>
					<CardTitle className="text-lg">
						{t("settings.modelProvider")}
					</CardTitle>
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
					<CardTitle className="text-lg">
						{t("settings.captureBehavior")}
					</CardTitle>
					<CardDescription>{t("settings.captureBehaviorDesc")}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<label
							htmlFor="screenshot-directory"
							className="text-sm font-medium text-zinc-700 dark:text-zinc-200"
						>
							{t("settings.screenshotDir")}
						</label>
						<p className="text-xs text-zinc-500 dark:text-zinc-400">
							{t("settings.screenshotDirManualHint")}
						</p>
						<div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
							<input
								id="screenshot-directory"
								type="text"
								value={draftDirectory}
								onChange={(event) => setDraftDirectory(event.target.value)}
								className={`${inputCls} min-w-0 flex-1`}
							/>
							<Button
								type="button"
								size="sm"
								variant="default"
								className="shrink-0 sm:self-stretch"
								onClick={() => void handleBrowseScreenshotDir()}
							>
								{t("settings.browseScreenshotDir")}
							</Button>
						</div>
						<Button
							size="sm"
							variant="outline"
							onClick={() => setScreenshotDirectory(draftDirectory)}
						>
							{t("settings.saveDir")}
						</Button>
					</div>

					<div className="space-y-2 border-t border-zinc-200/80 pt-4 dark:border-zinc-800">
						<label
							htmlFor="frame-interval-sec"
							className="text-sm font-medium text-zinc-700 dark:text-zinc-200"
						>
							{t("settings.frameInterval")}
						</label>
						<p className="text-xs text-zinc-500 dark:text-zinc-400">
							{t("settings.frameIntervalDesc")}
						</p>
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
						<Button
							size="sm"
							variant="outline"
							onClick={() => {
								setFrameIntervalSec(
									Number.parseInt(draftFrameIntervalSec, 10) || 2,
								);
							}}
						>
							{t("settings.saveFrameInterval")}
						</Button>
					</div>

					<div className="space-y-2 border-t border-zinc-200/80 pt-4 dark:border-zinc-800">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
								{t("settings.audioInputs")}
							</span>
							<Button
								type="button"
								size="sm"
								variant="outline"
								className="h-7 text-xs"
								onClick={() => void loadDevices()}
							>
								{t("settings.refreshAudioDevices")}
							</Button>
						</div>
						<p className="text-xs text-zinc-500 dark:text-zinc-400">
							{t("settings.audioInputsHint")}
						</p>
						{audioListError ? (
							<div className="rounded-lg border border-red-200/90 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-100">
								<p className="font-semibold">
									{t("settings.audioDeviceErrorTitle")}
								</p>
								<p className="mt-1 whitespace-pre-wrap break-words leading-relaxed">
									{audioListError}
								</p>
							</div>
						) : null}
						{!audioListError && audioDevices.length === 0 ? (
							<p className="rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
								{t("settings.audioNoDevices")}
							</p>
						) : null}
						{!audioListError && audioDevices.length > 0 ? (
							<div className="space-y-2">
								<div className="max-h-48 space-y-3 overflow-y-auto rounded-lg border border-zinc-200/80 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950/40">
									{micDevices.length > 0 ? (
										<div>
											<p className="mb-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
												{t("settings.audioMicSection")}
											</p>
											<ul className="space-y-1">
												{micDevices.map((device) => {
													const checked = draftSelectedSpecs.includes(
														device.ffmpegSpec,
													);
													return (
														<li key={`${device.index}-${device.ffmpegSpec}`}>
															<label className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 transition hover:bg-zinc-100 dark:hover:bg-zinc-800/80">
																<input
																	type="checkbox"
																	className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-900 dark:focus:ring-zinc-600"
																	checked={checked}
																	onChange={() => {
																		toggleAudioSpec(device.ffmpegSpec);
																	}}
																/>
																<span className="min-w-0 flex-1 text-sm leading-snug">
																	<span className="font-medium text-zinc-800 dark:text-zinc-100">
																		{device.label}
																	</span>
																	<span className="mt-0.5 block font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
																		{device.ffmpegSpec}
																	</span>
																</span>
															</label>
														</li>
													);
												})}
											</ul>
										</div>
									) : null}
									{loopbackDevices.length > 0 ? (
										<div>
											<p className="mb-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
												{t("settings.audioLoopbackSection")}
											</p>
											<ul className="space-y-1">
												{loopbackDevices.map((device) => {
													const checked = draftSelectedSpecs.includes(
														device.ffmpegSpec,
													);
													return (
														<li key={`${device.index}-${device.ffmpegSpec}`}>
															<label className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 transition hover:bg-zinc-100 dark:hover:bg-zinc-800/80">
																<input
																	type="checkbox"
																	className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-900 dark:focus:ring-zinc-600"
																	checked={checked}
																	onChange={() => {
																		toggleAudioSpec(device.ffmpegSpec);
																	}}
																/>
																<span className="min-w-0 flex-1 text-sm leading-snug">
																	<span className="flex flex-wrap items-center gap-2 font-medium text-zinc-800 dark:text-zinc-100">
																		{device.label}
																		<Badge
																			variant="outline"
																			className="px-1.5 py-0 text-[10px] font-normal"
																		>
																			{t("settings.audioLoopbackBadge")}
																		</Badge>
																	</span>
																	<span className="mt-0.5 block font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
																		{device.ffmpegSpec}
																	</span>
																</span>
															</label>
														</li>
													);
												})}
											</ul>
										</div>
									) : null}
								</div>
								{loopbackDevices.length === 0 && micDevices.length > 0 ? (
									<div className="rounded-lg border border-sky-200/90 bg-sky-50/90 px-3 py-2 text-xs leading-relaxed text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100">
										<p>{t("settings.audioLoopbackEmpty")}</p>
										<a
											href="https://github.com/ExistentialAudio/BlackHole"
											target="_blank"
											rel="noreferrer"
											className="mt-1 inline-block font-medium text-sky-800 underline underline-offset-2 hover:text-sky-900 dark:text-sky-200 dark:hover:text-sky-50"
										>
											BlackHole (GitHub)
										</a>
									</div>
								) : null}
							</div>
						) : null}
						{orphanSpecs.length > 0 ? (
							<div className="space-y-1.5 rounded-lg border border-zinc-200/80 bg-zinc-50/80 p-2 dark:border-zinc-800 dark:bg-zinc-900/40">
								<p className="text-[11px] text-zinc-500 dark:text-zinc-400">
									{t("settings.audioOrphanSpecs")}
								</p>
								<ul className="space-y-1">
									{orphanSpecs.map((spec) => (
										<li key={spec}>
											<label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800">
												<input
													type="checkbox"
													className="h-4 w-4 shrink-0 rounded border-zinc-300 dark:border-zinc-600"
													checked={draftSelectedSpecs.includes(spec)}
													onChange={() => {
														toggleAudioSpec(spec);
													}}
												/>
												<span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">
													{spec}
												</span>
											</label>
										</li>
									))}
								</ul>
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
						<Button
							size="sm"
							variant="outline"
							onClick={() => {
								setAudioInputSpecs(
									draftSelectedSpecs.length > 0
										? draftSelectedSpecs
										: ["none:0"],
								);
								setAudioSampleRate(
									Number.parseInt(draftSampleRate, 10) || 16000,
								);
								setAudioChannels(Number.parseInt(draftChannels, 10) || 1);
							}}
						>
							{t("settings.saveAudioConfig")}
						</Button>
					</div>

					<div className="flex items-center justify-between rounded-xl border border-zinc-200/80 bg-zinc-50/60 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50">
						<p className="text-sm text-zinc-700 dark:text-zinc-200">
							{t("settings.autoSummarize")}
						</p>
						<button
							type="button"
							role="switch"
							aria-checked={autoSummarizeOnCapture}
							onClick={() => setAutoSummarizeOnCapture(!autoSummarizeOnCapture)}
							className={[
								"relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
								autoSummarizeOnCapture
									? "bg-zinc-900 dark:bg-zinc-100"
									: "bg-zinc-300 dark:bg-zinc-700",
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
						<label
							htmlFor="openrouter-model"
							className="text-sm font-medium text-zinc-700 dark:text-zinc-200"
						>
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
						<label
							htmlFor="openrouter-apikey"
							className="text-sm font-medium text-zinc-700 dark:text-zinc-200"
						>
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

					<div className="space-y-2">
						<label
							htmlFor="openrouter-max-tokens"
							className="text-sm font-medium text-zinc-700 dark:text-zinc-200"
						>
							{t("settings.openRouterMaxTokens")}
						</label>
						<input
							id="openrouter-max-tokens"
							type="number"
							min={256}
							max={131072}
							step={256}
							value={draftOpenRouterMaxTokens}
							onChange={(event) =>
								setDraftOpenRouterMaxTokens(event.target.value)
							}
							className={inputCls}
						/>
						<p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
							{t("settings.openRouterMaxTokensDesc")}
						</p>
					</div>

					<div className="flex items-center gap-2">
						<Button
							size="sm"
							variant="outline"
							onClick={() => {
								setOpenRouterModel(draftOpenRouterModel);
								setOpenRouterApiKey(draftOpenRouterApiKey);
								const mt = Number.parseInt(
									draftOpenRouterMaxTokens.trim(),
									10,
								);
								if (Number.isFinite(mt)) {
									setOpenRouterMaxTokens(mt);
								}
							}}
						>
							{t("settings.saveOpenRouterConfig")}
						</Button>
						<Badge variant="secondary">{t("settings.storedLocally")}</Badge>
					</div>
				</CardContent>
			</Card>

			<Card className="xl:col-span-2">
				<CardHeader>
					<CardTitle className="text-lg">{t("settings.botEndpoint")}</CardTitle>
					<CardDescription>{t("settings.botEndpointDesc")}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{botLoadError ? (
						<p className="rounded-lg border border-red-200/90 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-100">
							{botLoadError}
						</p>
					) : null}
					<label className="flex cursor-pointer items-start gap-2.5">
						<input
							type="checkbox"
							className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-900"
							checked={botEnabled}
							onChange={(e) => setBotEnabled(e.target.checked)}
						/>
						<span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
							{t("settings.botEndpointEnable")}
						</span>
					</label>
					<div className="grid gap-3 sm:grid-cols-[140px_1fr] sm:items-center">
						<label
							htmlFor="bot-port"
							className="text-sm font-medium text-zinc-700 dark:text-zinc-200"
						>
							{t("settings.botEndpointPort")}
						</label>
						<input
							id="bot-port"
							type="number"
							min={1024}
							max={65535}
							value={botPortDraft}
							onChange={(e) => setBotPortDraft(e.target.value)}
							className={inputCls}
						/>
					</div>
					<div className="space-y-2">
						<label
							htmlFor="bot-secret"
							className="text-sm font-medium text-zinc-700 dark:text-zinc-200"
						>
							{t("settings.botEndpointSecret")}
						</label>
						<p className="text-xs text-zinc-500 dark:text-zinc-400">
							{t("settings.botEndpointSecretHint")}
						</p>
						<input
							id="bot-secret"
							type="password"
							autoComplete="off"
							value={botSecretDraft}
							onChange={(e) => {
								setBotSecretTouched(true);
								setBotSecretDraft(e.target.value);
							}}
							onFocus={() => setBotSecretTouched(true)}
							className={inputCls}
							placeholder={botSecretConfigured ? "••••••••" : ""}
						/>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							type="button"
							size="sm"
							variant="default"
							onClick={() => void handleSaveBotEndpoint()}
						>
							{t("settings.botEndpointSave")}
						</Button>
						<Badge variant={botListening ? "default" : "secondary"}>
							{botListening
								? t("settings.botEndpointListening")
								: t("settings.botEndpointIdle")}
						</Badge>
						{botSaveMessage ? (
							<span className="text-xs text-zinc-600 dark:text-zinc-400">
								{botSaveMessage}
							</span>
						) : null}
					</div>
					<div className="space-y-1 border-t border-zinc-200/80 pt-4 dark:border-zinc-800">
						<p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
							{t("settings.botEndpointUrl")}
						</p>
						<code className="block break-all rounded-md bg-zinc-100 px-2 py-1.5 font-mono text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
							{botBaseUrl}/v1/meeting
						</code>
					</div>
					<div className="space-y-1">
						<p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
							{t("settings.botEndpointExample")}
						</p>
						<pre className="max-h-40 overflow-x-auto overflow-y-auto rounded-md bg-zinc-950 px-3 py-2 font-mono text-[11px] leading-relaxed text-zinc-100">
							{curlExample}
						</pre>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
