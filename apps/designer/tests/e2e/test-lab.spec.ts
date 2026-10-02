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
  if (pages !== pdfPages) {
    await page.getByTestId("stress-result-100").locator("summary").click();
    await expect(page.getByTestId("stress-result-100")).toContainText("Designer shows");
  }
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
