import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";

import { formatClock } from "../lib/captureOptions";
import { useT } from "../lib/i18n";
import type { AcademicSession, TimelineItem } from "../types";
import { SessionQaChat } from "./SessionQaChat";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";

interface SessionViewerProps {
	session: AcademicSession;
}

/** Formats T+ label from seconds (supports fractional offsets from the backend). */
function formatTimelineSeconds(sec: number): string {
	if (!Number.isFinite(sec)) {
		return "0";
	}
	const rounded = Math.round(sec * 10) / 10;
	return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function resolveScreenshot(path: string): string {
	if (path.startsWith("/placeholders/")) {
		return "https://placehold.co/1120x640/E4E4E7/18181B?text=PPT+Screenshot";
	}

	if (path.startsWith("/")) {
		try {
			return convertFileSrc(path);
		} catch (_error) {
			return path;
		}
	}

	return path;
}

export function SessionViewer({ session }: SessionViewerProps): JSX.Element {
	const t = useT();
	const [activeTimelineId, setActiveTimelineId] = useState<string>(
		session.timeline[0]?.id ?? "",
	);

	// Reset selected timeline item when session changes
	useEffect(() => {
		setActiveTimelineId(session.timeline[0]?.id ?? "");
	}, [session.timeline]);

	const [showFullTranscript, setShowFullTranscript] = useState(false);
	const segments = session.transcriptSegments ?? [];
	const minutes = session.minutes ?? null;
	const actionItems = (minutes?.actionItems ?? []).filter((a) =>
		a.task?.trim(),
	);
	const minuteLists: { label: string; items: string[] }[] = [
		{ label: t("viewer.keyPoints"), items: minutes?.keyPoints ?? [] },
		{ label: t("viewer.decisions"), items: minutes?.decisions ?? [] },
		{ label: t("viewer.openQuestions"), items: minutes?.openQuestions ?? [] },
	].filter((l) => l.items.length > 0);
	const hasMinutes = minuteLists.length > 0 || actionItems.length > 0;
	const dateLabel = session.date ? new Date(session.date).toLocaleString() : "";

	/** Select the slide that was on screen when this transcript line was spoken. */
	const jumpToTime = (sec: number): void => {
		let target = session.timeline[0];
		for (const item of session.timeline) {
			if (item.timestamp <= sec) target = item;
		}
		if (target) setActiveTimelineId(target.id);
	};

	const activeItem = useMemo<TimelineItem | undefined>(
		() =>
			session.timeline.find((item) => item.id === activeTimelineId) ??
			session.timeline[0],
		[activeTimelineId, session.timeline],
	);

	if (!activeItem) {
		return (
			<Card className="h-full">
				<CardHeader>
					<CardTitle>{t("viewer.noTimeline")}</CardTitle>
				</CardHeader>
			</Card>
		);
	}

	return (
		<div className="grid h-full grid-cols-1 gap-4 xl:grid-cols-[1.3fr_1fr]">
			<Card className="min-h-0">
				<CardHeader className="space-y-3 border-b border-zinc-200/80 pb-4 dark:border-zinc-800">
					<CardTitle className="text-lg">{session.title}</CardTitle>
					{dateLabel || session.durationSec ? (
						<p className="text-xs text-zinc-500 dark:text-zinc-400">
							{[
								dateLabel,
								session.durationSec
									? `${t("viewer.duration")} ${formatClock(session.durationSec)}`
									: "",
							]
								.filter(Boolean)
								.join(" · ")}
						</p>
					) : null}
					<div className="flex flex-wrap items-center gap-2">
						{session.tags.map((tag) => (
							<Badge key={tag} variant="secondary">
								{tag}
							</Badge>
						))}
					</div>
				</CardHeader>
				<CardContent className="grid min-h-0 grid-cols-1 gap-4 p-4 lg:grid-cols-[220px_1fr]">
					<ScrollArea className="h-[560px] rounded-xl border border-zinc-200/80 dark:border-zinc-800">
						<div className="space-y-1 p-2">
							{session.timeline.map((item) => {
								const isActive = item.id === activeItem.id;
								return (
									<button
										key={item.id}
										type="button"
										onClick={() => setActiveTimelineId(item.id)}
										className={[
											"w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
											isActive
												? "border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
												: "border-transparent text-zinc-600 hover:border-zinc-200 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-900",
										].join(" ")}
									>
										<p className="font-medium">
											T+{formatTimelineSeconds(item.timestamp)}s
										</p>
										<p className="mt-1 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
											{item.summary}
										</p>
									</button>
								);
							})}
						</div>
					</ScrollArea>

					<div className="space-y-4">
						<img
							src={resolveScreenshot(activeItem.pptScreenshotPath)}
							alt="PPT screenshot"
							className="h-auto w-full rounded-xl border border-zinc-200 object-cover shadow-sm dark:border-zinc-800"
						/>
						<div className="rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
							<h3 className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
								{t("viewer.originalTranscript")}
							</h3>
							<p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
								{activeItem.originalTranscript}
							</p>
						</div>
						{segments.length > 0 ? (
							<div className="rounded-xl border border-zinc-200/80 p-4 dark:border-zinc-800">
								<button
									type="button"
									className="flex w-full items-center justify-between text-left text-sm font-semibold text-zinc-800 dark:text-zinc-200"
									onClick={() => setShowFullTranscript((v) => !v)}
								>
									<span>
										{t("viewer.fullTranscript")} ({segments.length})
									</span>
									<span className="text-xs font-normal text-zinc-500">
										{showFullTranscript ? t("qa.hide") : t("viewer.show")}
									</span>
								</button>
								{showFullTranscript ? (
									<div className="mt-3 max-h-[360px] space-y-1.5 overflow-y-auto pr-1">
										{segments.map((seg) => (
											<button
												key={seg.index}
												type="button"
												onClick={() => jumpToTime(seg.startSec)}
												className="block w-full rounded-md px-2 py-1 text-left text-sm leading-relaxed text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
											>
												<span className="mr-2 font-mono text-[11px] text-zinc-400">
													{formatClock(seg.startSec)}
												</span>
												{seg.text}
											</button>
										))}
									</div>
								) : null}
							</div>
						) : null}
					</div>
				</CardContent>
			</Card>

			<Card className="min-h-0">
				<CardHeader className="border-b border-zinc-200/80 pb-4 dark:border-zinc-800">
					<CardTitle className="text-lg">{t("viewer.aiAnalysis")}</CardTitle>
				</CardHeader>
				<CardContent className="space-y-5 p-4">
					<div className="rounded-xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
						<h3 className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
							{t("viewer.summary")}
						</h3>
						<p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
							{session.extendedReport || activeItem.summary}
						</p>
					</div>

					{hasMinutes ? (
						<div className="rounded-xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
							<h3 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
								{t("viewer.minutes")}
							</h3>
							<div className="space-y-3">
								{minuteLists.map((list) => (
									<div key={list.label}>
										<p className="mb-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
											{list.label}
										</p>
										<ul className="list-disc space-y-0.5 pl-5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
											{list.items.map((item) => (
												<li key={item}>{item}</li>
											))}
										</ul>
									</div>
								))}
								{actionItems.length > 0 ? (
									<div>
										<p className="mb-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
											{t("viewer.actionItems")}
										</p>
										<ul className="space-y-0.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
											{actionItems.map((a) => (
												<li key={a.task}>
													☐ {a.task}
													{[a.owner, a.due].filter((v) => v?.trim()).length > 0
														? ` (${[a.owner, a.due].filter((v) => v?.trim()).join(", ")})`
														: ""}
												</li>
											))}
										</ul>
									</div>
								) : null}
							</div>
						</div>
					) : null}

					{session.concepts && session.concepts.length > 0 ? (
						<div className="rounded-xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
							<h3 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
								{t("viewer.keyConcepts")} ({session.concepts.length})
							</h3>
							<div className="space-y-3">
								{session.concepts.map((concept) => (
									<div
										key={concept.term}
										className="rounded-lg border border-zinc-100 bg-zinc-50/60 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/50"
									>
										<p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
											{concept.term}
										</p>
										<p className="mt-0.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
											{concept.definition}
										</p>
									</div>
								))}
							</div>
						</div>
					) : null}

					<div className="rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
						<h3 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
							{t("viewer.relatedPapers")}
							{session.references && session.references.length > 0
								? ` (${session.references.length})`
								: ""}
						</h3>
						{session.references && session.references.length > 0 ? (
							<div className="space-y-3">
								{session.references.map((ref_, idx) => (
									<div
										key={
											ref_.url || `${ref_.title}::${ref_.authors}::${ref_.year}`
										}
										className="rounded-lg border border-zinc-200/80 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-900/80"
									>
										<div className="flex items-start gap-2">
											<span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-zinc-100 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
												{idx + 1}
											</span>
											<div className="min-w-0 flex-1">
												{ref_.url ? (
													<a
														href={ref_.url}
														target="_blank"
														rel="noopener noreferrer"
														className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
													>
														{ref_.title}
													</a>
												) : (
													<p className="text-xs font-semibold text-zinc-800 dark:text-zinc-100">
														{ref_.title}
													</p>
												)}
												<p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
													{[ref_.authors, ref_.venue, ref_.year]
														.filter(Boolean)
														.join(" · ")}
												</p>
												{ref_.relevance ? (
													<p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
														{ref_.relevance}
													</p>
												) : null}
											</div>
										</div>
									</div>
								))}
							</div>
						) : (
							<p className="text-xs text-zinc-400">
								{t("viewer.relatedPapersEmpty")}
							</p>
						)}
					</div>

					<SessionQaChat sessionId={session.id} />
				</CardContent>
			</Card>
		</div>
	);
}
