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
      { type: "text", id: "wrapped", value: "ALPHA BRAVO CHARLIE DELTA ECHO FOXTROT GOLF HOTEL INDIA JULIET", x: 72, y: 140, width: 125, height: 110, style: { fontSize: 12, padding: 4 } },
    ] }] });
  });
  const node = page.locator('[data-cid="telugu"]');
  await expect(node).toBeVisible();
  await expect(node).toContainText("తెలుగు");
  await expect(node).toHaveCSS("font-family", /Noto Sans Telugu/);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => (window as any).__designer.getState().engineBusy)).toBe(false);
  const canvasText = await page.evaluate(() => {
    const pageEl = document.querySelector('[data-testid="page-1"]')!;
    const paper = pageEl.getBoundingClientRect();
    const pxPerPoint = paper.width / ((window as any).__designer.getState().engine.paginated.pageSize.width);
    const box = (rect: DOMRect) => ({ x: (rect.left - paper.left) / pxPerPoint, y: (rect.top - paper.top) / pxPerPoint, width: rect.width / pxPerPoint, height: rect.height / pxPerPoint });
    const telugu = document.querySelector('[data-cid="telugu"] .text-content')!;
    const teluguText = [...telugu.childNodes].find((child) => child.nodeType === Node.TEXT_NODE)!;
    const range = document.createRange();
    range.selectNodeContents(teluguText);
    const wrapped = document.querySelector('[data-cid="wrapped"] .text-content')!;
    const wrappedText = [...wrapped.childNodes].find((child) => child.nodeType === Node.TEXT_NODE)!;
    const words = [...wrappedText.textContent!.matchAll(/\S+/g)].map((match) => {
      range.setStart(wrappedText, match.index);
      range.setEnd(wrappedText, match.index + match[0].length);
      return { text: match[0], ...box(range.getBoundingClientRect()) };
    });
    range.selectNodeContents(teluguText);
    return { telugu: box(range.getBoundingClientRect()), words };
  });
  await page.screenshot({ path: path.resolve("../../output/playwright/ui-audit-2026-10-03/43-pdf-text-parity.png") });

  await page.getByTestId("btn-more").click();
  await page.getByTestId("btn-export").click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-pdf").click()]);
  const file = path.join(os.tmpdir(), `font-preview-${Date.now()}.pdf`);
  await download.saveAs(file);
  try {
    const fonts = execFileSync("pdffonts", [file], { encoding: "utf-8" });
    expect(fonts).toContain("NotoSansTelugu");
    const boxes = execFileSync("pdftotext", ["-bbox", file, "-"], { encoding: "utf-8" });
    const words = [...boxes.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]+)<\/word>/g)].map((match) => ({ text: match[5], x: Number(match[1]), y: Number(match[2]), width: Number(match[3]) - Number(match[1]), height: Number(match[4]) - Number(match[2]) }));
    const telugu = words.find((word) => word.text === "తెలుగు");
    expect(telugu).toBeDefined();
    expect(Math.abs(canvasText.telugu.x - telugu!.x)).toBeLessThan(0.75);
    expect(Math.abs(canvasText.telugu.y - telugu!.y)).toBeLessThan(0.75);
    expect(canvasText.words.map((word) => word.text)).toEqual(words.filter((word) => word.text !== "తెలుగు").map((word) => word.text));
    for (const canvas of canvasText.words) {
      const pdf = words.find((word) => word.text === canvas.text)!;
      expect(Math.abs(canvas.x - pdf.x), `${canvas.text} horizontal position`).toBeLessThan(2);
      expect(Math.abs(canvas.y - pdf.y), `${canvas.text} line position`).toBeLessThan(0.75);
    }
  } finally {
    fs.rmSync(file, { force: true });
  }
});
