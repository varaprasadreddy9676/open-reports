import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

test("PDF preview navigates, searches, zooms, and renders only nearby thumbnails", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate(() => {
    const store = (window as any).__designer.getState();
    store.loadDoc({
      ...store.doc,
      id: "preview-navigation",
      sections: Array.from({ length: 30 }, (_, index) => ({
        type: "detail", name: `Page ${index + 1}`, newPageBefore: index > 0,
        children: [{ type: "text", id: `marker-${index + 1}`, value: `PREVIEW MARKER${index + 1}`, width: 240 }],
      })),
    });
  });
  await page.getByTestId("mode-preview").click();
  await expect(page.getByTestId("pdf-info")).toContainText("30 pages");
  await expect(page.getByTestId("pdf-document-view")).toBeVisible();
  await expect(page.getByTestId("pdf-frame").locator("canvas.pdf-rendered")).toBeVisible();
  expect(await page.locator(".pdf-thumb").count()).toBeLessThan(20);

  await page.getByTestId("pdf-page-number").fill("20");
  await page.getByTestId("pdf-page-number").press("Enter");
  await expect(page.getByTestId("pdf-frame")).toHaveAttribute("aria-label", "PDF page 20 of 30");
  await expect(page.getByRole("button", { name: "Go to page 20" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByTestId("pdf-page-number")).toHaveValue("21");
  await page.getByTestId("pdf-zoom").selectOption("100");
  await expect(page.locator(".pdf-zoom-readout")).toHaveText("100%");
  await page.getByTestId("pdf-zoom").selectOption("width");
  await page.getByRole("searchbox", { name: "Search PDF text" }).fill("MARKER27");
  await page.getByRole("button", { name: "Find", exact: true }).click();
  await expect(page.getByTestId("pdf-match-excerpt")).toContainText("MARKER27");
  await expect(page.getByTestId("pdf-page-number")).toHaveValue("27");
  await expect(page.getByTestId("pdf-search-highlight")).toBeVisible();
  expect(await page.locator(".pdf-thumb").count()).toBeLessThan(20);
  await page.getByTestId("pdf-zoom").selectOption("page");

  const screenshots = path.resolve("../../output/playwright/ui-audit-2026-10-03");
  fs.mkdirSync(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, "53-native-pdf-preview.png") });
});
