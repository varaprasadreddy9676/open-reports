import { test, expect } from "@playwright/test";
import fs from "node:fs";

test("Settings → AI tools downloads the MCP server and builds client configuration", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.getByTestId("btn-more").click();
  await page.getByRole("menuitem", { name: "Settings…" }).click();
  await page.getByTestId("settings-tab-ai").click();

  const download = page.getByTestId("mcp-download");
  await expect(download).toBeVisible();
  const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
  expect(file.suggestedFilename()).toBe("open-reports-mcp.mjs");
  expect(fs.readFileSync((await file.path())!, "utf8").startsWith("#!/usr/bin/env node")).toBe(true);

  await page.getByTestId("mcp-file-path").fill("/Users/me/tools/open-reports-mcp.mjs");
  const config = JSON.parse((await page.getByTestId("mcp-config").textContent())!);
  expect(config.mcpServers["open-reports"].args).toEqual(["/Users/me/tools/open-reports-mcp.mjs"]);
  expect(config.mcpServers["open-reports"].env.REPORTS_API_URL).toBe("http://127.0.0.1:3100");

  await page.getByTestId("mcp-read-only").check();
  await page.getByTestId("mcp-client-claude-code").click();
  await expect(page.getByTestId("mcp-config")).toContainText("claude mcp add open-reports");
  await expect(page.getByTestId("mcp-config")).toContainText("--read-only");

  const tools = page.getByTestId("mcp-tools");
  await expect(tools).toContainText("preview_report");
  await expect(tools).toContainText("On your computer");
});
