import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Tauri expects a fixed port and to not clear the screen so errors are visible.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    watch: {
      // Don't watch the Rust side.
      ignored: ["**/src-tauri/**"],
    },
    proxy: {
      // Dev-only: route DeepSeek calls through Vite to dodge browser CORS.
      // The desktop app talks to the API directly via tauri-plugin-http.
      "/deepseek-proxy": {
        target: "https://api.deepseek.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/deepseek-proxy/, ""),
      },
    },
  },
});
