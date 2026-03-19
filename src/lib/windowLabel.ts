import { getCurrentWindow } from "@tauri-apps/api/window";

let label = "main";
try {
  label = getCurrentWindow().label;
} catch {
  label = "main";
}

export const currentWindowLabel = label;
