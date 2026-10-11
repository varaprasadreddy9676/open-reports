import { test, expect } from "@playwright/test";
import fs from "node:fs";

test("Settings → AI tools connects by URL or with the npm package", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.getByTestId("btn-more").click();
  await page.getByRole("menuitem", { name: "Settings…" }).click();
  await page.getByTestId("settings-tab-ai").click();

  // Connect by URL (default): Claude Code command for this server's /mcp endpoint.
  await expect(page.getByTestId("mcp-config")).toContainText("claude mcp add --transport http open-reports http://127.0.0.1:3100/mcp");
  await page.getByTestId("mcp-read-only").check();
  await page.getByTestId("mcp-client-cursor").click();
  expect(JSON.parse((await page.getByTestId("mcp-config").textContent())!).mcpServers["open-reports"].url).toBe("http://127.0.0.1:3100/mcp?read-only");

  // Run on this computer: npx open-reports-mcp, with the single-file download as a fallback.
  await page.getByTestId("mcp-mode-local").check();
  const local = JSON.parse((await page.getByTestId("mcp-config").textContent())!).mcpServers["open-reports"];
  expect(local).toMatchObject({ command: "npx", args: ["-y", "open-reports-mcp", "--read-only"], env: { REPORTS_API_URL: "http://127.0.0.1:3100" } });
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByTestId("mcp-download").click()]);
  expect(file.suggestedFilename()).toBe("open-reports-mcp.mjs");
  expect(fs.readFileSync((await file.path())!, "utf8").startsWith("#!/usr/bin/env node")).toBe(true);

  const tools = page.getByTestId("mcp-tools");
  await expect(tools).toContainText("preview_report");
  await expect(tools).toContainText("On your computer");
});

test("the designer's dev server reaches the remote MCP endpoint", async ({ request }) => {
  const res = await request.post("/mcp", { headers: { accept: "application/json, text/event-stream" }, data: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
  expect(res.status()).toBe(200);
  expect((await res.json()).result.tools.map((t: { name: string }) => t.name)).toContain("preview_report");
});
