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
        children: index === 26 ? [
          { type: "text", id: "marker-prefix", value: "PREVIEW", width: 240 },
          { type: "text", id: "marker-27", value: "MARKER27", width: 240 },
        ] : [{ type: "text", id: `marker-${index + 1}`, value: `PREVIEW MARKER${index + 1}`, width: 240 }],
      })),
    });
  });
  await page.getByTestId("mode-preview").click();
  await expect(page.getByTestId("pdf-info")).toContainText("30 pages");
  await expect(page.getByTestId("pdf-document-view")).toBeVisible();
  await expect(page.getByTestId("pdf-frame").locator('.page[data-loaded="true"] canvas').first()).toBeVisible();
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
  await page.getByRole("searchbox", { name: "Search PDF text" }).fill("PREVIEW MARKER27");
  await page.getByRole("button", { name: "Find", exact: true }).click();
  await expect(page.getByTestId("pdf-match-excerpt")).toContainText("MARKER27");
  await expect(page.getByTestId("pdf-page-number")).toHaveValue("27");
  await expect(page.getByRole("status").filter({ hasText: "1/1 matches" })).toBeVisible();
  const page27 = page.getByTestId("pdf-frame").locator('.page[data-page-number="27"]');
  await expect(page27.locator(".textLayer .highlight.selected").first()).toBeVisible();
  const selectedText = await page27.locator(".textLayer").evaluate((layer) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(layer);
    selection?.removeAllRanges();
    selection?.addRange(range);
    return selection?.toString() ?? "";
  });
  expect(selectedText).toContain("PREVIEW");
  expect(selectedText).toContain("MARKER27");
  expect(await page.locator(".pdf-thumb").count()).toBeLessThan(20);
  await page.getByTestId("pdf-zoom").selectOption("page");
  await expect(page27.locator(".textLayer .highlight.selected").first()).toBeVisible();
  const paperBox = (await page27.locator(".canvasWrapper").boundingBox())!;
  const textBox = (await page27.locator(".textLayer").boundingBox())!;
  expect(Math.abs(paperBox.width - textBox.width)).toBeLessThan(1);
  expect(Math.abs(paperBox.height - textBox.height)).toBeLessThan(1);

  const screenshots = path.resolve("../../output/playwright/ui-audit-2026-10-03");
  fs.mkdirSync(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, "53-native-pdf-preview.png") });
});

const MAX_CANVAS_PIXELS = 2 ** 25;
const MAX_CANVAS_SIDE = 32_767;

async function canvasHasInk(canvas: import("@playwright/test").Locator) {
  return canvas.evaluate((element: HTMLCanvasElement) => {
    if (!element.width || !element.height) return false;
    const pixels = element.getContext("2d")!.getImageData(0, 0, element.width, element.height).data;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3]! > 0 && pixels[i]! < 180 && pixels[i + 1]! < 180 && pixels[i + 2]! < 180) return true;
    return false;
  });
}

test.describe("very long page at high zoom on a 2x display", () => {
  test.use({ deviceScaleFactor: 2 });
  test("keeps every canvas within browser limits and draws a sharp detail view where the reader looks", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/");
    await page.getByTestId("starter-blank").click();
    await page.evaluate(() => {
      const store = (window as any).__designer.getState();
      store.loadDoc({
        ...store.doc,
        id: "long-pdf-page",
        page: { size: "custom", unit: "pt", width: 250, height: 9000, margin: { top: 10, right: 10, bottom: 10, left: 10 } },
        sections: [{ type: "detail", layout: "absolute", height: 8950, children: [
          { type: "text", id: "start", value: "LONG PAGE START", width: 200 },
          { type: "text", id: "end", value: "LONG PAGE END", x: 0, y: 8900, width: 200, height: 20 },
        ] }],
      });
    });
    await page.getByTestId("mode-preview").click();
    await expect(page.getByTestId("pdf-info")).toContainText("1 page");
    await page.getByTestId("pdf-zoom").selectOption("400");
    await expect(page.locator(".pdf-zoom-readout")).toHaveText("400%");
    const stage = page.getByTestId("pdf-frame");
    await stage.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const detail = stage.locator('.canvasWrapper canvas[aria-hidden="true"]');
    await expect(detail).toHaveCount(1);
    await expect.poll(() => canvasHasInk(detail), { timeout: 20_000 }).toBe(true);
    const canvases = await stage.locator("canvas").evaluateAll((elements) => elements.map((element) => {
      const canvas = element as HTMLCanvasElement;
      return { width: canvas.width, height: canvas.height };
    }));
    expect(canvases.length).toBeGreaterThanOrEqual(2);
    for (const canvas of canvases) {
      expect(canvas.width * canvas.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
      expect(Math.max(canvas.width, canvas.height)).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
    }
    const pageBox = (await stage.locator(".page").boundingBox())!;
    expect(pageBox.height).toBeGreaterThan(40_000);
    await expect(page.getByTestId("pdf-render-error")).toHaveCount(0);
  });
});

test("a failed page draw shows the page number and recovers with Retry drawing", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const save = CanvasRenderingContext2D.prototype.save;
    CanvasRenderingContext2D.prototype.save = function (this: CanvasRenderingContext2D) {
      if ((window as any).__failPdfCanvas) throw new Error("Simulated canvas failure");
      return save.call(this);
    };
  });
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate(() => {
    const store = (window as any).__designer.getState();
    store.loadDoc({ ...store.doc, id: "retry-draw", sections: [{ type: "detail", children: [{ type: "text", id: "body", value: "RETRY BODY TEXT", width: 240 }] }] });
  });
  await page.getByTestId("mode-preview").click();
  const canvas = page.getByTestId("pdf-frame").locator('.page[data-page-number="1"] .canvasWrapper canvas').first();
  await expect.poll(() => canvasHasInk(canvas), { timeout: 20_000 }).toBe(true);

  await page.evaluate(() => { (window as any).__failPdfCanvas = true; });
  await page.getByTestId("pdf-zoom").selectOption("150");
  const banner = page.getByTestId("pdf-render-error");
  await expect(banner).toContainText("Could not draw page 1");
  await expect(banner).toContainText("Simulated canvas failure");

  await page.evaluate(() => { (window as any).__failPdfCanvas = false; });
  await banner.getByRole("button", { name: "Retry drawing" }).click();
  await expect(banner).toHaveCount(0);
  const redrawn = page.getByTestId("pdf-frame").locator('.page[data-page-number="1"] .canvasWrapper canvas').first();
  await expect.poll(() => canvasHasInk(redrawn), { timeout: 20_000 }).toBe(true);
});

const IOS_MAX_CANVAS_PIXELS = 5_242_880;

function trackPageErrors(page: import("@playwright/test").Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  return errors;
}

async function loadPages(page: import("@playwright/test").Page, id: string, count: number) {
  await page.evaluate(({ id, count }) => {
    const store = (window as any).__designer.getState();
    store.loadDoc({
      ...store.doc,
      id,
      sections: Array.from({ length: count }, (_, index) => ({
        type: "detail", name: `Page ${index + 1}`, newPageBefore: index > 0,
        children: [{ type: "text", id: `${id}-${index + 1}`, value: `${id.toUpperCase()} MARKER ${index + 1}`, width: 240 }],
      })),
    });
  }, { id, count });
}

test.describe("iPad Safari canvas budget", () => {
  test.use({
    userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    viewport: { width: 834, height: 1194 },
    deviceScaleFactor: 2,
  });
  test("keeps every canvas within the mobile pixel budget for a long page at 400%", async ({ page }) => {
    test.setTimeout(90_000);
    const errors = trackPageErrors(page);
    await page.goto("/");
    await page.getByTestId("starter-blank").click();
    await page.evaluate(() => {
      const store = (window as any).__designer.getState();
      store.loadDoc({
        ...store.doc,
        id: "ios-long-page",
        page: { size: "custom", unit: "pt", width: 250, height: 9000, margin: { top: 10, right: 10, bottom: 10, left: 10 } },
        sections: [{ type: "detail", layout: "absolute", height: 8950, children: [
          { type: "text", id: "end", value: "IOS PAGE END", x: 0, y: 8900, width: 200, height: 20 },
        ] }],
      });
    });
    await page.getByTestId("mode-preview").click();
    await page.getByTestId("pdf-zoom").selectOption("400");
    await expect(page.locator(".pdf-zoom-readout")).toHaveText("400%");
    const stage = page.getByTestId("pdf-frame");
    await stage.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const detail = stage.locator('.canvasWrapper canvas[aria-hidden="true"]');
    await expect(detail).toHaveCount(1);
    await expect.poll(() => canvasHasInk(detail), { timeout: 20_000 }).toBe(true);
    const sizes = await stage.locator("canvas").evaluateAll((elements) => elements.map((element) => (element as HTMLCanvasElement).width * (element as HTMLCanvasElement).height));
    for (const pixels of sizes) expect(pixels).toBeLessThanOrEqual(IOS_MAX_CANVAS_PIXELS);
    await expect(page.getByTestId("pdf-render-error")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test("editing the report replaces the viewed PDF cleanly and keeps navigation working", async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackPageErrors(page);
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await loadPages(page, "first", 4);
  await page.getByTestId("mode-preview").click();
  await expect(page.getByTestId("pdf-info")).toContainText("4 pages");

  await page.getByRole("searchbox", { name: "Search PDF text" }).fill("FIRST MARKER");
  await page.getByRole("button", { name: "Find", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "1/4 matches" })).toBeVisible();
  await expect(page.getByTestId("pdf-page-number")).toHaveValue("1");
  await page.getByRole("button", { name: "Next match" }).click();
  await expect(page.getByRole("status").filter({ hasText: "2/4 matches" })).toBeVisible();
  await expect(page.getByTestId("pdf-page-number")).toHaveValue("2");
  await expect(page.getByTestId("pdf-match-excerpt")).toContainText("Page 2");
  await page.getByRole("button", { name: "Previous match" }).click();
  await page.getByRole("button", { name: "Previous match" }).click();
  await expect(page.getByRole("status").filter({ hasText: "4/4 matches" })).toBeVisible();
  await expect(page.getByTestId("pdf-page-number")).toHaveValue("4");
  await page.getByRole("button", { name: "Go to page 3" }).click();
  await expect(page.getByTestId("pdf-frame")).toHaveAttribute("aria-label", "PDF page 3 of 4");

  await loadPages(page, "second", 2);
  await expect(page.getByTestId("pdf-info")).toContainText("2 pages");
  await expect(page.getByTestId("pdf-frame")).toHaveAttribute("aria-label", "PDF page 1 of 2");
  await expect(page.getByTestId("pdf-page-number")).toHaveValue("1");
  await expect(page.getByRole("searchbox", { name: "Search PDF text" })).toHaveValue("");
  await expect(page.getByTestId("pdf-match-excerpt")).toHaveCount(0);
  const frame = page.getByTestId("pdf-frame");
  await expect(frame.locator(".page")).toHaveCount(1);
  await expect(frame.locator(".page")).toHaveAttribute("data-page-number", "1");
  await expect(frame.locator(".textLayer .highlight")).toHaveCount(0);
  await expect(frame.locator('.page[data-page-number="1"] .textLayer')).toContainText("SECOND MARKER 1");
  await expect.poll(() => canvasHasInk(frame.locator('.page[data-page-number="1"] .canvasWrapper canvas').first()), { timeout: 20_000 }).toBe(true);
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(frame).toHaveAttribute("aria-label", "PDF page 2 of 2");
  await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();
  expect(errors).toEqual([]);
});

test("rapid zoom changes settle on the last zoom without render errors", async ({ page }) => {
  test.setTimeout(90_000);
  const errors = trackPageErrors(page);
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await loadPages(page, "zoom", 3);
  await page.getByTestId("mode-preview").click();
  await expect(page.getByTestId("pdf-info")).toContainText("3 pages");
  const zoom = page.getByTestId("pdf-zoom");
  for (const value of ["50", "400", "75", "200", "page", "width", "400", "125"]) await zoom.selectOption(value);
  await expect(page.locator(".pdf-zoom-readout")).toHaveText("125%");
  const canvas = page.getByTestId("pdf-frame").locator('.page[data-page-number="1"] .canvasWrapper canvas').first();
  await expect.poll(() => canvasHasInk(canvas), { timeout: 20_000 }).toBe(true);
  const page1 = page.getByTestId("pdf-frame").locator('.page[data-page-number="1"]');
  const wrapper = (await page1.locator(".canvasWrapper").boundingBox())!;
  const text = (await page1.locator(".textLayer").boundingBox())!;
  expect(Math.abs(wrapper.width - text.width)).toBeLessThan(1);
  expect(Math.abs(wrapper.height - text.height)).toBeLessThan(1);
  await expect(page.getByTestId("pdf-render-error")).toHaveCount(0);
  expect(errors).toEqual([]);
});
