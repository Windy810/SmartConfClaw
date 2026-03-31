import { useEffect, useRef, useState, type FormEvent } from "react";

import { useT } from "../lib/i18n";
import {
	askSessionQuestion,
	isTauriRuntime,
	type SessionQaTurn,
} from "../lib/tauri";
import { useSettingsStore } from "../store/settingsStore";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";

interface SessionQaChatProps {
	sessionId: string;
}

interface ChatMessage extends SessionQaTurn {
	id: string;
}

const SESSION_QA_OPTS_KEY = "scholarclaw-sessionqa-opts-v1";

function loadPersistedQaOpts(): { web: boolean; prior: boolean } {
	try {
		const raw = localStorage.getItem(SESSION_QA_OPTS_KEY);
		if (!raw) {
			return { web: false, prior: false };
		}
		const j = JSON.parse(raw) as { web?: boolean; prior?: boolean };
		return { web: Boolean(j.web), prior: Boolean(j.prior) };
	} catch {
		return { web: false, prior: false };
	}
}

function newId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function SessionQaChat({ sessionId }: SessionQaChatProps): JSX.Element {
	const t = useT();
	const openRouterApiKey = useSettingsStore((s) => s.openRouterApiKey);
	const openRouterModel = useSettingsStore((s) => s.openRouterModel);
	const openRouterMaxTokens = useSettingsStore((s) => s.openRouterMaxTokens);
	const tavilyApiKey = useSettingsStore((s) => s.tavilyApiKey);
	const initialOpts = loadPersistedQaOpts();
	const [useWebSearch, setUseWebSearch] = useState(initialOpts.web);
	const [usePriorSessions, setUsePriorSessions] = useState(initialOpts.prior);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [draft, setDraft] = useState("");
	const [loading, setLoading] = useState(false);
	const bottomRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		setMessages([]);
		setDraft("");
	}, [sessionId]);

	useEffect(() => {
		localStorage.setItem(
			SESSION_QA_OPTS_KEY,
			JSON.stringify({ web: useWebSearch, prior: usePriorSessions }),
		);
	}, [useWebSearch, usePriorSessions]);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
	}, [messages, loading]);

	const handleSubmit = async (
		event: FormEvent<HTMLFormElement>,
	): Promise<void> => {
		event.preventDefault();
		const text = draft.trim();
		if (!text || loading) {
			return;
		}
		if (!openRouterApiKey.trim()) {
			setMessages((prev) => [
				...prev,
				{
					id: newId(),
					role: "assistant",
					content: t("viewer.sessionAskNoKey"),
				},
			]);
			return;
		}
		if (useWebSearch && !tavilyApiKey.trim()) {
			setMessages((prev) => [
				...prev,
				{
					id: newId(),
					role: "assistant",
					content: t("viewer.sessionAskWebNeedsTavily"),
				},
			]);
			return;
		}

		const history: SessionQaTurn[] = messages.map(({ role, content }) => ({
			role,
			content,
		}));

		setDraft("");
		setMessages((prev) => [
			...prev,
			{ id: newId(), role: "user", content: text },
		]);
		setLoading(true);

		try {
			const reply = await askSessionQuestion(
				sessionId,
				text,
				openRouterApiKey,
				openRouterModel,
				openRouterMaxTokens,
				{
					useWebSearch,
					usePriorSessions,
					tavilyApiKey: tavilyApiKey.trim(),
				},
				history,
			);
			setMessages((prev) => [
				...prev,
				{ id: newId(), role: "assistant", content: reply },
			]);
		} catch (error) {
			const msg =
				error instanceof Error ? error.message : String(error ?? "Error");
			setMessages((prev) => [
				...prev,
				{
					id: newId(),
					role: "assistant",
					content: t("viewer.sessionAskError").replace("{message}", msg),
				},
			]);
		} finally {
			setLoading(false);
		}
	};

	const handleClear = (): void => {
		setMessages([]);
	};

	return (
		<div className="rounded-xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
			<div className="mb-3 flex items-start justify-between gap-2">
				<div>
					<h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
						{t("viewer.sessionAskTitle")}
					</h3>
					<p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
						{t("viewer.sessionAskHint")}
					</p>
				</div>
				{messages.length > 0 ? (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-8 shrink-0 text-xs text-zinc-500"
						onClick={handleClear}
						disabled={loading}
					>
						{t("viewer.sessionAskClear")}
					</Button>
				) : null}
			</div>

			{!isTauriRuntime() ? (
				<p className="rounded-lg border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
					{t("viewer.sessionAskWebOnly")}
				</p>
			) : null}

			<ScrollArea className="mt-3 h-[220px] rounded-lg border border-zinc-100 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/40">
				<div className="space-y-3 p-3">
					{messages.length === 0 ? (
						<p className="text-center text-xs text-zinc-400 dark:text-zinc-500">
							{t("viewer.sessionAskEmpty")}
						</p>
					) : (
						messages.map((m) => (
							<div
								key={m.id}
								className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
									m.role === "user"
										? "ml-4 bg-zinc-200/80 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
										: "mr-4 border border-zinc-200/80 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
								}`}
							>
								<p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
									{m.role === "user"
										? t("viewer.sessionAskYou")
										: t("viewer.sessionAskAssistant")}
								</p>
								<p className="whitespace-pre-wrap">{m.content}</p>
							</div>
						))
					)}
					{loading ? (
						<p className="text-xs text-zinc-400 dark:text-zinc-500">
							{t("viewer.sessionAskThinking")}
						</p>
					) : null}
					<div ref={bottomRef} />
				</div>
			</ScrollArea>

			<form onSubmit={(e) => void handleSubmit(e)} className="mt-3 space-y-2">
				<textarea
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					placeholder={t("viewer.sessionAskPlaceholder")}
					rows={3}
					disabled={loading || !isTauriRuntime()}
					className="w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400/30 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600"
				/>

				<div className="flex flex-wrap gap-2">
					<Button
						type="button"
						size="sm"
						variant={useWebSearch ? "default" : "outline"}
						className="text-xs"
						disabled={!isTauriRuntime()}
						onClick={() => setUseWebSearch((v) => !v)}
					>
						{t("viewer.sessionAskWebSearch")}
					</Button>
					<Button
						type="button"
						size="sm"
						variant={usePriorSessions ? "default" : "outline"}
						className="text-xs"
						disabled={!isTauriRuntime()}
						onClick={() => setUsePriorSessions((v) => !v)}
					>
						{t("viewer.sessionAskPriorSessions")}
					</Button>
				</div>
				<p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
					{useWebSearch
						? t("viewer.sessionAskWebSearchHint")
						: t("viewer.sessionAskWebSearchOffHint")}
					{" · "}
					{usePriorSessions
						? t("viewer.sessionAskPriorSessionsHint")
						: t("viewer.sessionAskPriorSessionsOffHint")}
				</p>

				<Button
					type="submit"
					size="sm"
					disabled={loading || !draft.trim() || !isTauriRuntime()}
					className="w-full sm:w-auto"
				>
					{t("viewer.sessionAskSend")}
				</Button>
			</form>
		</div>
	);
}
