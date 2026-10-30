import { useEffect, useState } from "react";

import { useT } from "../lib/i18n";
import { analyzeMeetingLink, type MeetingLink } from "../lib/tauri";
import {
	type ScheduledMeetingStatus,
	useScheduleStore,
} from "../store/scheduleStore";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

interface JoinMeetingCardProps {
	busy: boolean;
	isCapturing: boolean;
	onJoinNow: (link: string, title: string) => Promise<void>;
}

const PLATFORM_LABELS: Record<string, string> = {
	zoom: "Zoom",
	teams: "Microsoft Teams",
	meet: "Google Meet",
	tencent: "腾讯会议 / VooV",
	webex: "Webex",
	feishu: "飞书 / Lark",
	dingtalk: "钉钉",
	web: "Web",
};

const inputCls =
	"w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none ring-zinc-300 transition focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-600";

/** `datetime-local` value for "now + minutes" in local time. */
function localInputValue(date: Date): string {
	const pad = (n: number) => n.toString().padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function JoinMeetingCard({
	busy,
	isCapturing,
	onJoinNow,
}: JoinMeetingCardProps): JSX.Element {
	const t = useT();
	const meetings = useScheduleStore((s) => s.meetings);
	const addMeeting = useScheduleStore((s) => s.addMeeting);
	const removeMeeting = useScheduleStore((s) => s.removeMeeting);
	const [link, setLink] = useState("");
	const [title, setTitle] = useState("");
	const [when, setWhen] = useState(() =>
		localInputValue(new Date(Date.now() + 30 * 60_000)),
	);
	const [preview, setPreview] = useState<MeetingLink | null>(null);

	useEffect(() => {
		if (!link.trim()) {
			setPreview(null);
			return;
		}
		const timer = setTimeout(() => {
			void analyzeMeetingLink(link)
				.then(setPreview)
				.catch(() => setPreview(null));
		}, 300);
		return () => clearTimeout(timer);
	}, [link]);

	const statusLabel: Record<ScheduledMeetingStatus, string> = {
		scheduled: t("join.statusScheduled"),
		joining: t("join.statusJoining"),
		joined: t("join.statusJoined"),
		failed: t("join.statusFailed"),
		missed: t("join.statusMissed"),
	};

	const handleSchedule = (): void => {
		const startAt = new Date(when).getTime();
		if (!preview || !Number.isFinite(startAt)) return;
		addMeeting({ link, title: title.trim(), startAt });
		setLink("");
		setTitle("");
	};

	return (
		<div className="space-y-3 rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
			<div>
				<p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
					{t("join.title")}
				</p>
				<p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
					{t("join.subtitle")}
				</p>
			</div>
			<textarea
				rows={2}
				value={link}
				onChange={(e) => setLink(e.target.value)}
				placeholder={t("join.linkPlaceholder")}
				className={`${inputCls} resize-y text-xs`}
			/>
			{link.trim() ? (
				<p className="text-[11px] text-zinc-500 dark:text-zinc-400">
					{preview
						? `${PLATFORM_LABELS[preview.platform] ?? preview.platform} · ${
								preview.nativeUrl ? t("join.opensApp") : t("join.opensBrowser")
							}`
						: t("join.noLink")}
				</p>
			) : null}
			<input
				type="text"
				value={title}
				onChange={(e) => setTitle(e.target.value)}
				placeholder={t("join.titlePlaceholder")}
				className={`${inputCls} text-xs`}
			/>
			<div className="flex flex-wrap items-center gap-2">
				<Button
					size="sm"
					disabled={busy || isCapturing || !preview}
					onClick={() => void onJoinNow(link, title)}
				>
					{t("join.joinNow")}
				</Button>
				<span className="text-xs text-zinc-400">{t("join.or")}</span>
				<input
					type="datetime-local"
					value={when}
					onChange={(e) => setWhen(e.target.value)}
					className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
				/>
				<Button
					size="sm"
					variant="outline"
					disabled={!preview}
					onClick={handleSchedule}
				>
					{t("join.schedule")}
				</Button>
			</div>
			<p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
				{t("join.hint")}
			</p>

			{meetings.length > 0 ? (
				<ul className="space-y-1.5 border-t border-zinc-200/80 pt-2 dark:border-zinc-800">
					{meetings.map((m) => (
						<li
							key={m.id}
							className="flex items-start gap-2 rounded-lg bg-white px-2 py-1.5 text-xs dark:bg-zinc-800"
						>
							<div className="min-w-0 flex-1">
								<p className="truncate font-medium text-zinc-800 dark:text-zinc-100">
									{m.title || m.link}
								</p>
								<p className="text-[11px] text-zinc-500 dark:text-zinc-400">
									{new Date(m.startAt).toLocaleString()}
									{m.message ? ` · ${m.message}` : ""}
								</p>
							</div>
							<Badge
								variant={m.status === "scheduled" ? "secondary" : "outline"}
								className="shrink-0 text-[10px]"
							>
								{statusLabel[m.status]}
							</Badge>
							<Button
								variant="ghost"
								size="sm"
								className="h-6 shrink-0 px-2 text-[11px] text-red-600 dark:text-red-400"
								disabled={m.status === "joining"}
								onClick={() => removeMeeting(m.id)}
							>
								{t("sessions.delete")}
							</Button>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}
