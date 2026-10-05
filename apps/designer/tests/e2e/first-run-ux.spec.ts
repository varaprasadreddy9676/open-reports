import { expect, test } from "@playwright/test";

test("a first visitor can choose appearance and follow the invoice preview path", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "light");
  await page.getByTestId("home-appearance").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "dark");
  await page.reload();
  await expect(page.getByTestId("home-appearance")).toHaveValue("dark");
  await page.getByTestId("home-appearance").selectOption("light");

  await page.getByTestId("home-try-invoice").click();
  await expect(page.getByTestId("getting-started")).toContainText("Try one edit");
  await page.getByTestId("layer-company").click();
  await page.getByTestId("value-text").fill("MY INVOICE DEMO");
  await expect(page.getByTestId("getting-started")).toContainText("See the printable result");
  await page.getByTestId("getting-started").getByRole("button", { name: /Preview PDF/ }).click();
  await expect(page.getByTestId("pdf-info")).toContainText("page");
  await expect(page.getByTestId("preview-tab-zpl")).toHaveCount(0);
  await expect(page.getByTestId("preview-tab-escpos")).toHaveCount(0);
});

test("a local edit is protected when opening a different starter", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.getByTestId("palette-text").click();
  await page.getByRole("button", { name: "Home" }).click();
  await page.getByTestId("home-try-invoice").click();
  await expect(page.getByRole("dialog", { name: "Unsaved changes" })).toBeVisible();
  await page.getByTestId("replace-cancel").click();
  await expect(page.getByTestId("home-screen")).toBeVisible();
  await page.getByTestId("home-try-invoice").click();
  await page.getByTestId("replace-confirm").click();
  await expect(page.getByTestId("getting-started")).toContainText("Try one edit");
});

test("an empty table leads to a valid dataset and generated columns", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await expect(page.getByTestId("getting-started")).toContainText("Start on the page");
  await page.getByTestId("palette-table").click();
  await expect(page.getByTestId("getting-started")).toContainText("Connect table data");
  await page.getByTestId("canvas-create-dataset").click();
  await page.getByTestId("dataset-json").fill("{bad");
  await expect(page.getByTestId("dataset-json-error")).toBeVisible();
  await expect(page.getByTestId("dataset-save")).toBeDisabled();
  await page.getByTestId("dataset-json").fill('[{"item":"Consultation","amount":120}]');
  await page.getByTestId("dataset-save").click();
  await page.getByTestId("canvas-table-data").selectOption("dataset1");
  await expect(page.getByTestId("canvas")).toContainText("Consultation");
});
