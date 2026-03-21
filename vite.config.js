import { defineConfig } from "vite";
export default defineConfig({
    clearScreen: false,
    build: {
        // Release build: don't ship sourcemaps (privacy + smaller bundle)
        sourcemap: false,
    },
    server: {
        port: 1420,
        strictPort: true,
    },
    envPrefix: ["VITE_", "TAURI_"],
});
