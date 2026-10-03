import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

test("test data workspace runs boundary and stress scenarios without changing the report", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate(() => {
    const store = (window as any).__designer.getState();
    store.setDoc({
      ...store.doc,
      datasets: [{ id: "clinical", source: "inline", query: { data: { investigations: [{ department: "Lab", testName: "Glucose", result: 92 }] } } }],
      sections: [{ type: "detail", children: [{
        id: "investigation-table", type: "table", dataset: "clinical.investigations",
        columns: [
          { id: "test", header: "Test", binding: "row.testName" },
          { id: "result", header: "Result", binding: "row.result" },
        ],
        showHeader: true, repeatHeaderOnPageBreak: true,
      }] }],
    });
  });
  const before = await page.evaluate(() => {
    const state = (window as any).__designer.getState();
    return { doc: JSON.stringify(state.doc), sample: JSON.stringify(state.sample) };
  });
  await page.getByTestId("mode-data").click();
  await page.getByTestId("data-workspace-tests").click();
  await expect(page.getByLabel("Array to test")).toHaveValue("clinical.investigations");
  await page.getByLabel("Long text").check();
  await page.getByLabel("Null values").check();
  await page.getByLabel("Telugu, Hindi, Kannada, Tamil and Arabic").check();
  await page.getByTestId("run-stress-tests").click();
  await expect(page.getByTestId("stress-result-100")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("run-stress-tests")).toBeEnabled();
  for (const count of [0, 1, 31, 32, 100]) await expect(page.getByTestId(`stress-result-${count}`)).toContainText(`${count} records`);
  await expect(page.getByTestId("stress-result-100")).toContainText(/\d+ pages/);
  const pages = Number((await page.getByTestId("stress-result-100").innerText()).match(/(\d+) pages/)?.[1]);
  expect(pages).toBeGreaterThan(1);
  const pdfPages = Number((await page.getByTestId("stress-result-100").innerText()).match(/PDF (\d+)/)?.[1]);
  expect(pdfPages).toBeGreaterThan(1);
  expect(pages).toBe(pdfPages);
  await expect(page.getByTestId("stress-result-100")).not.toContainText("Designer shows");
  await expect(page.getByTestId("stress-result-100").getByTestId("pdf-row-coverage")).toContainText(/Rows \d+\/\d+/);
  const coverage = (await page.getByTestId("stress-result-100").getByTestId("pdf-row-coverage").innerText()).match(/Rows (\d+)\/(\d+)/);
  expect(coverage?.[1]).toBe(coverage?.[2]);
  if (process.env.UI_AUDIT_DIR) {
    fs.mkdirSync(process.env.UI_AUDIT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(process.env.UI_AUDIT_DIR, "27-test-data-lab.png") });
  }
  const after = await page.evaluate(() => {
    const state = (window as any).__designer.getState();
    return { doc: JSON.stringify(state.doc), sample: JSON.stringify(state.sample) };
  });
  expect(after).toEqual(before);
});

test("test data workspace can render a 1,000-row scenario", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate(() => {
    const store = (window as any).__designer.getState();
    store.setDoc({
      ...store.doc,
      datasets: [{ id: "items", source: "inline", query: { data: [{ name: "Item", amount: 12 }] } }],
      sections: [{ type: "detail", children: [{ id: "items-table", type: "table", dataset: "items", columns: [{ id: "name", header: "Name", binding: "row.name" }, { id: "amount", header: "Amount", binding: "row.amount" }] }] }],
    });
  });
  await page.getByTestId("mode-data").click();
  await page.getByTestId("data-workspace-tests").click();
  const group = page.getByRole("group", { name: "Record counts" });
  for (const count of [0, 1, 31, 32, 100]) await group.getByLabel(String(count), { exact: true }).uncheck();
  await group.getByLabel("1,000").check();
  await page.getByTestId("run-stress-tests").click();
  await expect(page.getByTestId("stress-result-1000")).toContainText(/\d+ pages · PDF \d+/, { timeout: 30_000 });
  const summary = await page.getByTestId("stress-result-1000").innerText();
  expect(summary.match(/(\d+) pages/)?.[1]).toBe(summary.match(/PDF (\d+)/)?.[1]);
  await expect(page.getByTestId("stress-result-1000").getByTestId("pdf-row-coverage")).toHaveText("Rows 1000/1000");
});

test("a missing PDF row names the record and opens its table in Design", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate(() => {
    const store = (window as any).__designer.getState();
    store.setDoc({
      ...store.doc,
      datasets: [{ id: "clinical", source: "inline", query: { data: { investigations: [{ testName: "Glucose" }] } } }],
      sections: [{ type: "detail", children: [{ id: "investigation-table", type: "table", dataset: "clinical.investigations", columns: [{ id: "test", header: "Test", binding: "row.testName" }] }] }],
    });
  });
  await page.route("**/api/v1/render", async (route) => {
    const body = route.request().postDataJSON();
    const rows = body.report?.datasets?.find((dataset: any) => dataset.id === "clinical")?.query?.data?.investigations;
    if (body.format !== "pdf" || !Array.isArray(rows) || rows.length !== 10) return route.continue();
    rows.pop(); // Fault injection: the PDF receives one fewer row than the designer laid out.
    await route.fulfill({ response: await route.fetch({ postData: JSON.stringify(body) }) });
  });
  await page.getByTestId("mode-data").click();
  await page.getByTestId("data-workspace-tests").click();
  const counts = page.getByRole("group", { name: "Record counts" });
  for (const count of [0, 1, 31, 32, 100]) await counts.getByLabel(String(count), { exact: true }).uncheck();
  await counts.getByLabel("10", { exact: true }).check();
  await page.getByTestId("run-stress-tests").click();
  const result = page.getByTestId("stress-result-10");
  await expect(result.getByTestId("pdf-row-coverage")).toHaveText("Rows 9/10");
  await result.locator("summary").click();
  await expect(result).toContainText("record 10");
  const screenshots = path.resolve("../../output/playwright/ui-audit-2026-10-03");
  fs.mkdirSync(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, "79-test-lab-row-coverage-warning.png") });
  await result.getByTestId("stress-reveal-table").click();
  await expect(page.getByTestId("mode-design")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("properties")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__designer.getState().selection)).toEqual(["investigation-table"]);
});

test("a missing PDF text element names its page and opens the element in Design", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate(() => {
    const store = (window as any).__designer.getState();
    store.setDoc({
      ...store.doc,
      datasets: [{ id: "clinical", source: "inline", query: { data: { investigations: [{ testName: "Glucose" }] } } }],
      sections: [
        { type: "reportHeader", children: [{ id: "missing-heading", type: "text", value: "Clinical Findings Summary", width: 220 }] },
        { type: "detail", children: [{ id: "investigation-table", type: "table", dataset: "clinical.investigations", columns: [{ id: "test", header: "Test", binding: "row.testName" }] }] },
      ],
    });
  });
  let removeHeading = false;
  await page.route("**/api/v1/render", async (route) => {
    const body = route.request().postDataJSON();
    if (body.format !== "pdf") return route.continue();
    if (removeHeading) body.report.sections[0].children = [];
    await route.fulfill({ response: await route.fetch({ postData: JSON.stringify(body) }) });
  });
  await page.getByTestId("mode-data").click();
  await page.getByTestId("data-workspace-tests").click();
  const counts = page.getByRole("group", { name: "Record counts" });
  for (const count of [0, 1, 31, 32, 100]) await counts.getByLabel(String(count), { exact: true }).uncheck();
  await counts.getByLabel("10", { exact: true }).check();
  await page.getByTestId("run-stress-tests").click();
  const result = page.getByTestId("stress-result-10");
  await expect(result.getByTestId("pdf-text-coverage")).toHaveText("Text 1/1");
  removeHeading = true;
  await page.getByTestId("run-stress-tests").click();
  await expect(result.getByTestId("pdf-text-coverage")).toHaveText("Text 0/1");
  await result.locator("summary").click();
  await expect(result).toContainText("Page 1: expected text");
  await expect(result).toContainText("Clinical Findings Summary");
  await result.getByRole("button", { name: "Show component" }).click();
  await expect(page.getByTestId("mode-design")).toHaveAttribute("aria-selected", "true");
  expect(await page.evaluate(() => (window as any).__designer.getState().selection)).toEqual(["missing-heading"]);
});

test("Data parameter value reaches the real PDF preview", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate(() => {
    const store = (window as any).__designer.getState();
    store.setDoc({
      ...store.doc,
      parameters: [{ id: "patientName", type: "string", label: "Patient name", default: "Default" }],
      sections: [{ type: "detail", children: [{ id: "patient", type: "text", expression: "params.patientName" }] }],
    });
  });
  await page.getByTestId("mode-data").click();
  await page.getByLabel("Patient name").fill("Asha Rao");
  await page.getByTestId("mode-preview").click();
  await expect(page.getByTestId("pdf-info")).toContainText("1 page");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-pdf").click()]);
  const pdfFile = path.join(os.tmpdir(), `parameter-preview-${Date.now()}.pdf`);
  await download.saveAs(pdfFile);
  try {
    expect(execFileSync("pdftotext", [pdfFile, "-"], { encoding: "utf8" })).toContain("Asha Rao");
  } finally {
    fs.unlinkSync(pdfFile);
  }
});

test("design pagination uses the PDF font layout and exposes its source", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.getByTestId("toggle-pagination").click();
  await expect(page.getByTestId("pagination-source")).toHaveText("PDF font layout");
});
