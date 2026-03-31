import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";

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
