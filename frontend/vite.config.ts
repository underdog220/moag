import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import path from "node:path";

// Build-Hash und Timestamp aus git in Bundle injizieren
function getGitHash(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

// Build-Identitaet: ENV hat Vorrang (im Docker-Build via --build-arg
// VITE_BUILD_HASH/VITE_BUILD_TS gesetzt — Dockerfile-Builder-Stage), git nur als
// lokaler Fallback. Wichtig: der node-slim-Builder-Container hat KEIN git und kein
// .git im Context, getGitHash() liefert dort "dev" — daher muss die ENV greifen.
const BUILD_HASH = process.env.VITE_BUILD_HASH || getGitHash();
const BUILD_TS = process.env.VITE_BUILD_TS || new Date().toISOString();

// Dev-Proxy-Ziel: MOAG-Backend (Port 17900)
const BACKEND_URL = process.env.VITE_BACKEND_URL || "http://127.0.0.1:17900";

// Build-Output: ../backend/moag/static/
const STATIC_OUT = path.resolve(__dirname, "..", "backend", "moag", "static");

export default defineConfig({
  // base: '/' ist Vite-Default — explizit fuer Container-Deployment dokumentiert.
  // Backend serviert dist/ von /app/backend/moag/static/ unter Root-Path.
  // Im Dev-Modus (vite dev) bleibt das identisch, kein Sonderfall.
  base: "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  define: {
    "import.meta.env.VITE_BUILD_HASH": JSON.stringify(BUILD_HASH),
    "import.meta.env.VITE_BUILD_TS": JSON.stringify(BUILD_TS),
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/api": {
        target: BACKEND_URL,
        changeOrigin: true,
      },
      "/ws": {
        target: BACKEND_URL.replace(/^http/, "ws"),
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: STATIC_OUT,
    emptyOutDir: true,
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
