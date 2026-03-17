import { create } from "zustand";

export type NavView = "capture" | "graph" | "qa" | "settings";

interface UiState {
  activeView: NavView;
  setActiveView: (view: NavView) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeView: "capture",
  setActiveView: (view) => set({ activeView: view }),
}));
