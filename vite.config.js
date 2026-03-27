import { defineConfig } from "vite";
export default defineConfig({
    clearScreen: false,
    build: {
        // Release build: don't ship sourcemaps (privacy + smaller bundle)
        sourcemap: false,
        // Prefer esbuild for CSS minify: Lightning CSS can choke on Tailwind v4 at-rules if they slip through.
        cssMinify: "esbuild",
    },
    server: {
        port: 1420,
        strictPort: true,
    },
    envPrefix: ["VITE_", "TAURI_"],
});
