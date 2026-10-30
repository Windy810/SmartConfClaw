import { useEffect, useRef } from "react";

import { formatClock } from "../lib/captureOptions";
import { useT } from "../lib/i18n";
import type { TranscriptSegment } from "../types";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface LiveTranscriptPanelProps {
	segments: TranscriptSegment[];
	/** Still recording / transcribing (shows the "listening" indicator). */
	active: boolean;
	error: string | null;
}

export function LiveTranscriptPanel({
	segments,
	active,
	error,
}: LiveTranscriptPanelProps): JSX.Element {
	const t = useT();
	const scrollRef = useRef<HTMLDivElement>(null);
	const segmentCount = segments.length;

	useEffect(() => {
		if (segmentCount === 0) return;
		const el = scrollRef.current;
		if (el) {
			el.scrollTop = el.scrollHeight;
		}
	}, [segmentCount]);

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-zinc-200/80 py-3 dark:border-zinc-800">
				<CardTitle className="text-sm">{t("live.title")}</CardTitle>
				{active ? (
					<Badge variant="default" className="gap-1.5">
						<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
						{t("live.listening")}
					</Badge>
				) : (
					<Badge variant="secondary">{t("live.finished")}</Badge>
				)}
			</CardHeader>
			<CardContent className="p-0">
				<div
					ref={scrollRef}
					className="max-h-[260px] space-y-2 overflow-y-auto px-4 py-3"
				>
					{segments.length === 0 ? (
						<p className="text-xs text-zinc-400">
							{active ? t("live.waiting") : t("live.empty")}
						</p>
					) : (
						segments.map((seg) => (
							<p
								key={seg.index}
								className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-200"
							>
								<span className="mr-2 font-mono text-[11px] text-zinc-400">
									{formatClock(seg.startSec)}
								</span>
								{seg.text}
							</p>
						))
					)}
				</div>
				{error ? (
					<p className="border-t border-zinc-200/80 px-4 py-2 text-xs text-red-600 dark:border-zinc-800 dark:text-red-400">
						{t("live.error")} {error}
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}
