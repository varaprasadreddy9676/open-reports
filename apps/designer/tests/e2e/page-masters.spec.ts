import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("page master editor copies a normal background and edits the first page independently", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate(() => {
    const store = (window as any).__designer.getState();
    store.loadDoc({ ...store.doc, id: "page-master-backgrounds", sections: [
      { type: "detail", children: [{ type: "text", id: "body-one", value: "Body page one" }] },
      { type: "detail", newPageBefore: true, children: [{ type: "text", id: "body-two", value: "Body page two" }] },
    ] });
  });
  await expect(page.getByTestId("page-2")).toBeVisible();
  await page.getByTestId("left-tab-pages").click();
  await page.getByTestId("edit-page-masters").click();
  await page.getByTestId("master-kind-standard").click();
  await page.getByTestId("master-add-background-standard").click();
  await page.getByTestId("master-open-background-standard").click();
  await page.getByTestId("left-tab-insert").click();
  await page.getByTestId("palette-text").click();
  await page.getByTestId("value-text").fill("NORMAL BACKGROUND");

  await page.getByTestId("left-tab-pages").click();
  await page.getByTestId("edit-page-masters").click();
  await page.getByTestId("master-add-background-first").click();
  await page.getByTestId("master-open-background-first").click();
  await page.getByTestId("value-text").fill("FIRST BACKGROUND");
  await expect(page.getByTestId("page-1")).toContainText("FIRST BACKGROUND");
  await expect(page.getByTestId("page-2")).toContainText("NORMAL BACKGROUND");
  await expect(page.getByTestId("page-1")).not.toContainText("NORMAL BACKGROUND");

  await page.getByTestId("left-tab-pages").click();
  await page.getByTestId("edit-page-masters").click();
  await expect(page.getByTestId("master-open-background-first")).toBeVisible();
  const captures = path.resolve("../../output/playwright/ui-audit-2026-10-03");
  fs.mkdirSync(captures, { recursive: true });
  await page.screenshot({ path: path.join(captures, "54-page-master-backgrounds.png") });

  await page.getByTestId("mode-preview").click();
  await expect(page.getByTestId("pdf-info")).toContainText("2 pages");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-pdf").click()]);
  const file = path.join(os.tmpdir(), `open-reports-masters-${Date.now()}.pdf`);
  await download.saveAs(file);
  try {
    const first = execFileSync("pdftotext", ["-f", "1", "-l", "1", file, "-"], { encoding: "utf8" });
    const second = execFileSync("pdftotext", ["-f", "2", "-l", "2", file, "-"], { encoding: "utf8" });
    expect(first).toContain("FIRST BACKGROUND");
    expect(first).not.toContain("NORMAL BACKGROUND");
    expect(second).toContain("NORMAL BACKGROUND");
    expect(second).not.toContain("FIRST BACKGROUND");
  } finally { fs.unlinkSync(file); }
});
