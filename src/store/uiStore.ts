import { create } from "zustand";

export type NavView = "capture" | "graph" | "qa" | "settings";

interface UiState {
  activeView: NavView;
  setActiveView: (view: NavView) => void;
  /** Increment to force Knowledge Graph and other views to refetch backend data */
  graphRefreshNonce: number;
  bumpGraphRefresh: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeView: "capture",
  setActiveView: (view) => set({ activeView: view }),
  graphRefreshNonce: 0,
  bumpGraphRefresh: () =>
    set((state) => ({ graphRefreshNonce: state.graphRefreshNonce + 1 })),
}));
