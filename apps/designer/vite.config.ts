import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.API_URL ?? "http://localhost:4000";

export default defineConfig({
  plugins: [react()],
  // PDF.js 4 uses top-level await in its browser bundle and worker.
  build: { target: "es2022" },
  optimizeDeps: { esbuildOptions: { target: "es2022" } },
  server: { proxy: { "/api": apiTarget, "/health": apiTarget, "/embed": apiTarget } },
  preview: { proxy: { "/api": apiTarget, "/health": apiTarget, "/embed": apiTarget } },
  test: { environment: "node", include: ["tests/unit/**/*.test.ts"] },
});
