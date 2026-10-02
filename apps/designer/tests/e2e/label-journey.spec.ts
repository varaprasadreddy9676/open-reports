import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function placeSelected(page: Page, x: number, y: number, width: number, height: number) {
  const props = page.getByTestId("properties");
  const positionFreely = props.getByRole("button", { name: "Position freely" });
  if (await positionFreely.count()) await positionFreely.click();
  await props.getByLabel("Width", { exact: true }).fill(String(width));
  await props.getByLabel("Height", { exact: true }).fill(String(height));
  await props.getByLabel("X position").fill(String(x));
  await props.getByLabel("Y position").fill(String(y));
}

test("build a 40 × 25 mm patient label through the UI, validate it, and preview PDF and ZPL", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("blank-size").selectOption({ label: "Label 40 × 25 mm" });
  await page.getByTestId("starter-blank").click();
  await expect(page.getByTestId("page-1")).toBeVisible();

  await page.getByTestId("left-tab-layers").click();
  await page.getByTestId("section-detail").first().click();
  await page.getByTestId("properties").getByRole("button", { name: /Size and layout/ }).click();
  await page.getByTestId("band-layout").selectOption("absolute");
  await page.getByTestId("page-1").click();
  await page.getByTestId("properties").getByRole("button", { name: /Print & labels/ }).click();
  await page.getByTestId("print-preset").selectOption({ label: "Label 40 × 25 mm (ZPL 203 dpi)" });
  await expect(page.getByTestId("print-preset")).toHaveValue("3");
  await expect(page.getByTestId("print-facts")).toContainText("40.0 × 25.0 mm");
  await expect(page.getByTestId("print-facts")).toContainText("320 × 200 dots");
  await expect(page.locator(".safe-area")).toBeVisible();

  await page.getByTestId("left-tab-data").click();
  await page.getByTestId("add-dataset").click();
  await page.getByTestId("dataset-id").fill("patient");
  await page.getByTestId("dataset-json").fill(JSON.stringify({ name: "Asha Rao", uhid: "UH12345" }));
  await page.getByTestId("dataset-test").click();
  await expect(page.getByTestId("dataset-result")).toBeVisible();
  await page.getByTestId("dataset-save").click();
  await page.getByTestId("left-tab-insert").click();

  await page.getByTestId("palette-text").click();
  await page.getByTestId("value-mode-field").click();
  await page.getByTestId("value-field").selectOption("data.patient.name");
  await placeSelected(page, 0, 0, 68, 10);
  await page.getByLabel("Font size").fill("7");

  await page.getByTestId("palette-text").click();
  await page.getByTestId("value-mode-field").click();
  await page.getByTestId("value-field").selectOption("data.patient.uhid");
  await placeSelected(page, 0, 13, 68, 8);
  await page.getByLabel("Font size").fill("6");

  await page.getByTestId("palette-barcode").click();
  await page.getByTestId("value-mode-field").click();
  await page.getByTestId("value-field").selectOption("data.patient.uhid");
  await placeSelected(page, 0, 30, 40, 25);
  await page.getByTestId("toggle-problems").click();
  await expect(page.getByTestId("problems")).toContainText("may not scan reliably");
  await page.getByTestId("problem-fix").first().click();

  await page.getByTestId("palette-qr-code").click();
  await page.getByTestId("value-mode-field").click();
  await page.getByTestId("value-field").selectOption("data.patient.uhid");
  await placeSelected(page, 70, 60, 30, 30);
  await expect(page.getByTestId("problems")).toContainText("outside the printer's 1.5 mm safe area");
  await page.getByTestId("properties").getByLabel("Y position").fill("0");
  await expect(page.getByTestId("canvas")).toContainText("Asha Rao");
  await expect(page.getByTestId("problems")).toContainText("No problems found.");

  await page.getByTestId("canvas-options").locator("summary").click();
  await page.getByTestId("ruler-unit").selectOption("mm");
  await expect(page.getByTestId("ruler-h")).toContainText("10");
  await page.getByTestId("ruler-unit").selectOption("dots");
  await expect(page.getByTestId("ruler-dpi")).toContainText("203 dpi");
  await page.getByTestId("canvas-options").locator("summary").click();

  await page.getByTestId("mode-preview").click();
  await expect(page.getByTestId("pdf-info")).toContainText("1 page");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-pdf").click()]);
  const pdf = path.join(os.tmpdir(), `patient-label-${Date.now()}.pdf`);
  await download.saveAs(pdf);
  const size = execFileSync("pdfinfo", [pdf], { encoding: "utf8" });
  expect(size).toMatch(/Page size:\s+113\.3\d* x 70\.8\d* pts/);
  expect(execFileSync("pdftotext", [pdf, "-"], { encoding: "utf8" })).toContain("Asha Rao");

  await page.getByTestId("preview-tab-zpl").click();
  await expect(page.getByTestId("zpl-info")).toContainText("40.0 × 25.0 mm · 203 dpi · 1 label");
  await expect(page.getByTestId("zpl-text")).toContainText("^PW320");
  await expect(page.getByTestId("zpl-text")).toContainText("^LL200");
  await expect(page.getByTestId("zpl-text")).toContainText("^FDAsha Rao^FS");
  await expect(page.getByTestId("zpl-text")).toContainText("^FDUH12345^FS");
  await expect(page.getByTestId("zpl-text")).toContainText("^BCN");
  await expect(page.getByTestId("zpl-text")).toContainText("^BQN");
  expect(await page.getByTestId("zpl-warnings").count()).toBe(0);

  await page.getByTestId("mode-design").click();
  await page.getByTestId("btn-publish").click();
  await page.getByTestId("publish-run-checks").click();
  await expect(page.getByTestId("publish-preview-reviewed")).toBeVisible();
  await expect(page.getByTestId("publish-review")).toContainText("Ready for review");
  const screenshots = path.resolve("../../output/playwright/ui-audit-2026-10-02");
  fs.mkdirSync(screenshots, { recursive: true });
  await page.getByTestId("publish-review").screenshot({ path: path.join(screenshots, "30-patient-label-validation.png") });
});
