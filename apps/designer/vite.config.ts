import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.API_URL ?? "http://localhost:4000";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": apiTarget, "/health": apiTarget } },
  preview: { proxy: { "/api": apiTarget, "/health": apiTarget } },
  test: { environment: "node", include: ["tests/unit/**/*.test.ts"] },
});
