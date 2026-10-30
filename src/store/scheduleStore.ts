import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ScheduledMeetingStatus =
	| "scheduled"
	| "joining"
	| "joined"
	| "failed"
	| "missed";

export interface ScheduledMeeting {
	id: string;
	/** Meeting link or the whole invitation text. */
	link: string;
	title: string;
	/** Start time, epoch ms. The app joins one minute before. */
	startAt: number;
	status: ScheduledMeetingStatus;
	message?: string;
	sessionId?: string;
}

interface ScheduleState {
	meetings: ScheduledMeeting[];
	addMeeting: (m: Omit<ScheduledMeeting, "id" | "status">) => void;
	updateMeeting: (id: string, patch: Partial<ScheduledMeeting>) => void;
	removeMeeting: (id: string) => void;
}

export const useScheduleStore = create<ScheduleState>()(
	persist(
		(set) => ({
			meetings: [],
			addMeeting: (m) =>
				set((state) => ({
					meetings: [
						...state.meetings,
						{
							...m,
							id: `mtg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
							status: "scheduled" as const,
						},
					].sort((a, b) => a.startAt - b.startAt),
				})),
			updateMeeting: (id, patch) =>
				set((state) => ({
					meetings: state.meetings.map((m) =>
						m.id === id ? { ...m, ...patch } : m,
					),
				})),
			removeMeeting: (id) =>
				set((state) => ({
					meetings: state.meetings.filter((m) => m.id !== id),
				})),
		}),
		{
			name: "scholarclaw-schedule-v1",
			storage: createJSONStorage(() => localStorage),
		},
	),
);
