import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("canvas loads the PDF renderer's Telugu face and exports it embedded", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await expect(page.getByTestId("page-1")).toBeVisible();
  await expect.poll(() => page.evaluate(() => Array.from(document.fonts).some((face) => face.family === "Noto Sans Telugu" && face.status === "loaded"))).toBe(true);

  await page.evaluate(() => {
    const store = (window as any).__designer.getState();
    store.loadDoc({ ...store.doc, id: "font-preview", name: "Font preview", sections: [{ type: "detail", layout: "absolute", children: [
      { type: "text", id: "telugu", value: "తెలుగు", x: 72, y: 80, width: 200, height: 30, style: { fontSize: 18 } },
    ] }] });
  });
  const node = page.locator('[data-cid="telugu"]');
  await expect(node).toBeVisible();
  await expect(node).toContainText("తెలుగు");
  await expect(node).toHaveCSS("font-family", /Noto Sans Telugu/);
  await page.screenshot({ path: path.resolve("../../output/playwright/ui-audit-2026-10-03/42-font-preview.png") });

  await page.getByTestId("btn-export").click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-pdf").click()]);
  const file = path.join(os.tmpdir(), `font-preview-${Date.now()}.pdf`);
  await download.saveAs(file);
  try {
    const fonts = execFileSync("pdffonts", [file], { encoding: "utf-8" });
    expect(fonts).toContain("NotoSansTelugu");
  } finally {
    fs.rmSync(file, { force: true });
  }
});
