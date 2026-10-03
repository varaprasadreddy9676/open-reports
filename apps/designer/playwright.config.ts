import { defineConfig } from "@playwright/test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "designer-e2e-"));
const fixtureFontsDir = fileURLToPath(new URL("../../packages/renderer-pdf/tests/fixtures/fonts/", import.meta.url));

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    // the older specs drive the paginated page canvas; the structure view has its own spec
    storageState: { cookies: [], origins: [{ origin: "http://127.0.0.1:3100", localStorage: [{ name: "designer.canvasView", value: "pages" }] }] },
    launchOptions: {
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      args: ["--no-sandbox"],
    },
  },
  webServer: [
    {
      command: "node ../server/dist/index.js",
      url: "http://127.0.0.1:4100/health",
      reuseExistingServer: false,
      env: { PORT: "4100", DB_PATH: path.join(dbDir, "e2e.sqlite"), FONTS_DIR: process.env.FONTS_DIR ?? fixtureFontsDir, REPORT_IMAGE_ROOTS: fileURLToPath(new URL("tests/fixtures/", import.meta.url)) },
    },
    {
      command: "npx vite --host 127.0.0.1 --port 3100 --strictPort",
      url: "http://127.0.0.1:3100",
      reuseExistingServer: false,
      env: { API_URL: "http://127.0.0.1:4100" },
    },
  ],
});
