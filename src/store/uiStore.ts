import { create } from "zustand";

export type NavView = "capture" | "graph" | "qa" | "settings";

interface UiState {
	activeView: NavView;
	setActiveView: (view: NavView) => void;
	/** Increment to force Knowledge Graph and other views to refetch backend data */
	graphRefreshNonce: number;
	bumpGraphRefresh: () => void;
	/** Window chosen for "window" capture; null = auto-detect the meeting window. */
	selectedWindowId: number | null;
	setSelectedWindowId: (id: number | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
	activeView: "capture",
	setActiveView: (view) => set({ activeView: view }),
	graphRefreshNonce: 0,
	bumpGraphRefresh: () =>
		set((state) => ({ graphRefreshNonce: state.graphRefreshNonce + 1 })),
	selectedWindowId: null,
	setSelectedWindowId: (id) => set({ selectedWindowId: id }),
}));
