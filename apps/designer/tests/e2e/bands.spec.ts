import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const doc = (page: Page) => page.evaluate(() => (window as any).__designer.getState().doc);
const addBand = async (page: Page, type: string) => { await page.getByTestId("explorer-add-trigger").click(); await page.getByTestId(`explorer-add-band-${type}`).click(); };
const addGroup = async (page: Page) => { await page.getByTestId("explorer-add-trigger").click(); await page.getByTestId("explorer-add-group").click(); };

async function dropInBand(page: Page, source: string, index: number) {
  await expect.poll(() => page.evaluate(() => (window as any).__designer.getState().engineBusy)).toBe(false);
  const target = page.getByTestId(`band-${index}`).first();
  await target.scrollIntoViewIfNeeded();
  const band = (await target.boundingBox())!;
  const from = (await page.getByTestId(source).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2 + 8, { steps: 3 });
  await page.mouse.move(band.x + band.width / 2, band.y + Math.min(band.height / 2, 24), { steps: 10 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("designer.canvasView", "structure"));
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await expect(page.getByTestId("page-1")).toBeVisible();
});

test("structure view shows band tabs; the + menu inserts bands in reading order", async ({ page }) => {
  await expect(page.getByTestId("band-bar")).toBeVisible();
  await expect(page.locator("[data-testid^=band-tab-]").first()).toBeVisible();
  await page.locator("[data-testid^=band-plus-]").first().click({ force: true });
  await page.getByTestId("add-reportFooter").click();
  await page.locator("[data-testid^=band-plus-]").first().click({ force: true });
  await page.getByTestId("add-reportHeader").click();
  const types = (await doc(page)).sections.map((s: any) => s.type);
  expect(types.indexOf("reportHeader")).toBeLessThan(types.indexOf("reportFooter"));
  expect(types[0]).toBe("reportHeader");
  await expect(page.locator("[data-band-type=reportFooter]")).toBeVisible();
});

test("palette click adds a component to the selected empty Page Header", async ({ page }) => {
  await page.getByTestId("left-tab-layers").click();
  await addBand(page, "pageHeader");
  const headerIndex = (await doc(page)).sections.findIndex((section: any) => section.type === "pageHeader");
  await page.getByTestId("left-tab-insert").click();
  await page.getByTestId("palette-text").click();
  const report = await doc(page);
  expect(report.sections[headerIndex].children).toHaveLength(1);
  expect(report.sections[headerIndex].children[0].type).toBe("text");
  expect(report.sections.find((section: any) => section.type === "detail").children).toHaveLength(0);
});

test("data drops fill the empty Page Header and Detail bands", async ({ page }) => {
  await page.getByTestId("left-tab-layers").click();
  await addBand(page, "pageHeader");
  await page.getByTestId("left-tab-data").click();
  await page.getByTestId("add-dataset").click();
  await page.getByTestId("dataset-id").fill("patient");
  await page.getByTestId("dataset-json").fill(JSON.stringify({ name: "Asha Rao" }));
  await page.getByTestId("dataset-save").click();
  const headerIndex = (await doc(page)).sections.findIndex((section: any) => section.type === "pageHeader");
  await dropInBand(page, "field-patient-name", headerIndex);
  expect((await doc(page)).sections[headerIndex].children).toMatchObject([{ type: "text", binding: "data.patient.name" }]);

  await page.getByTestId("add-dataset").click();
  await page.getByTestId("dataset-id").fill("items");
  await page.getByTestId("dataset-json").fill(JSON.stringify([{ name: "Flour", quantity: 2 }]));
  await page.getByTestId("dataset-save").click();
  const detailIndex = (await doc(page)).sections.findIndex((section: any) => section.type === "detail");
  await dropInBand(page, "array-items", detailIndex);
  await page.getByTestId("create-array-display").click();
  const report = await doc(page);
  expect(report.sections[detailIndex].children).toMatchObject([{ type: "table", dataset: "items" }]);
  expect(report.sections[headerIndex].children).toHaveLength(1);
});

test("A4 authoring keeps grouped investigation rows once from data binding through output", async ({ page }) => {
  test.setTimeout(180_000);
  await page.getByTestId("page-1").click({ position: { x: 10, y: 10 } });
  await page.getByTestId("report-tab-details").click();
  await page.getByTestId("properties").getByLabel("Report id").fill("clinical-a4-journey");
  await page.getByTestId("left-tab-data").click();
  await page.getByTestId("add-dataset").click();
  await page.getByTestId("dataset-id").fill("clinical");
  await page.getByTestId("dataset-json").fill(JSON.stringify({
    patient: { name: "Asha Rao" },
    investigations: [
      { department: "Biochemistry", testName: "Glucose", result: 92, flag: "H" },
      { department: "Haematology", testName: "Haemoglobin", result: 12.8, flag: "L" },
    ],
  }));
  await page.getByTestId("dataset-save").click();

  await page.getByTestId("left-tab-layers").click();
  await addBand(page, "pageHeader");
  const headerIndex = (await doc(page)).sections.findIndex((section: any) => section.type === "pageHeader");
  await page.getByTestId("left-tab-data").click();
  await dropInBand(page, "field-clinical-patient.name", headerIndex);
  expect((await doc(page)).sections[headerIndex].children[0].binding).toBe("data.clinical.patient.name");

  await page.getByTestId("left-tab-layers").click();
  await addGroup(page);
  await page.getByTestId("wizard-dataset").selectOption("clinical.investigations");
  await page.getByTestId("wizard-field").selectOption("row.department");
  await page.getByTestId("wizard-name").fill("Department");
  await page.getByTestId("wizard-repeat").check();
  await page.getByTestId("wizard-create").click();

  const groupHeaderIndex = (await doc(page)).sections.findIndex((section: any) => section.type === "groupHeader");
  const detailIndex = (await doc(page)).sections.findIndex((section: any) => section.type === "detail");
  await page.getByTestId("left-tab-data").click();
  await dropInBand(page, "field-clinical-investigations.department", groupHeaderIndex);
  await expect.poll(async () => (await doc(page)).sections[groupHeaderIndex].children[0]?.binding).toBe("row.department");
  await dropInBand(page, "field-clinical-investigations", detailIndex);
  await page.getByTestId("create-array-display").click();
  const table = (await doc(page)).sections[detailIndex].children.find((child: any) => child.type === "table");
  expect(table.dataset).toBe("clinical.investigations");
  expect(table.columns.map((column: any) => column.binding)).toEqual(["row.department", "row.testName", "row.result", "row.flag"]);

  await page.getByTestId("left-tab-layers").click();
  await page.getByTestId(`layer-${table.id}`).click();
  await expect(page.getByTestId("table-summary")).toContainText("4 columns");
  await expect(page.getByTestId("element-tab-content")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("element-tab-layout")).toBeVisible();
  const inspectorScreenshots = path.resolve("../../output/playwright/ui-audit-2026-10-03");
  fs.mkdirSync(inspectorScreenshots, { recursive: true });
  await page.screenshot({ path: path.join(inspectorScreenshots, "35-table-inspector.png") });
  await page.getByRole("button", { name: "Element actions" }).click();
  await page.screenshot({ path: path.join(inspectorScreenshots, "36-inspector-actions.png") });
  await page.getByRole("button", { name: "Element actions" }).click();
  await page.getByTestId("open-table-designer").click();
  await page.getByTestId("column-1").getByRole("button", { name: /Test Name/ }).click();
  await page.getByTestId("column-1").getByLabel("Column header").fill("Investigation");
  await page.getByTestId("column-0").getByRole("button", { name: "Remove column" }).click();
  await page.getByTestId("column-2").getByRole("button", { name: "Remove column" }).click();
  expect((await doc(page)).sections[detailIndex].children[0].columns.map((column: any) => column.header)).toEqual(["Investigation", "Result"]);
  await page.getByTestId("table-tab-conditions").click();
  await page.getByTestId("table-designer-row-rules-add").click();
  await page.getByLabel("Rule 1 field").selectOption("row.flag");
  await page.getByLabel("Rule 1 value").fill("H");
  await page.getByTestId("table-designer-row-rules-add").click();
  await page.getByLabel("Rule 2 field").selectOption("row.flag");
  await page.getByLabel("Rule 2 value").fill("L");
  await page.getByLabel("Rule 2 text colour value").fill("#1d4ed8");
  expect((await doc(page)).sections[detailIndex].children[0].rowStyleWhen).toMatchObject([
    { when: 'row.flag == "H"', style: { color: "#b91c1c", fontWeight: "bold" } },
    { when: 'row.flag == "L"', style: { color: "#1d4ed8", fontWeight: "bold" } },
  ]);
  const screenshots = path.resolve("../../output/playwright/ui-audit-2026-10-02");
  fs.mkdirSync(screenshots, { recursive: true });
  await page.getByTestId("table-designer-done").click();
  await expect(page.locator(".cn-table tbody tr").first()).toHaveCSS("color", "rgb(185, 28, 28)");
  await page.screenshot({ path: path.join(screenshots, "21-conditional-row-rules.png") });
  await page.locator(".cn-table").first().dblclick();
  await expect(page.getByTestId("table-designer")).toBeVisible();
  await expect(page.getByTestId("table-live-preview")).toContainText("Glucose");
  const grip = page.getByRole("separator", { name: "Resize Investigation" });
  const gripBox = (await grip.boundingBox())!;
  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(gripBox.x + gripBox.width / 2 + 40, gripBox.y + gripBox.height / 2, { steps: 5 });
  await page.mouse.up();
  expect((await doc(page)).sections[detailIndex].children[0].columns[0].width).toBeGreaterThan(24);
  await page.getByTestId("table-tab-header").click();
  await expect(page.getByTestId("table-direct-header")).toBeVisible();
  await page.getByTestId("header-add-level").click();
  await page.getByTestId("header-cell-0-0").click();
  await page.getByTestId("header-split").click();
  await page.getByTestId("header-cell-0-0").click();
  await page.getByTestId("header-cell-0-1").click();
  await page.getByTestId("header-merge").click();
  await page.getByTestId("header-cell-0-0").click();
  await page.getByLabel("Selected header text").fill("Department investigations");
  expect((await doc(page)).sections[detailIndex].children[0].headerRows).toMatchObject([
    [{ column: 0, text: "Department investigations", colSpan: 2 }],
    [{ column: 0, text: "Investigation" }, { column: 1, text: "Result" }],
  ]);
  await page.screenshot({ path: path.join(screenshots, "23-table-designer-header.png") });
  await page.getByTestId("table-tab-rows").click();
  await expect(page.getByTestId("table-direct-rows")).toBeVisible();
  for (const tab of ["groups", "totals", "pagination", "conditions"]) {
    await page.getByTestId(`table-tab-${tab}`).click();
    await expect(page.getByTestId(`table-tab-${tab}`)).toHaveAttribute("aria-selected", "true");
  }
  await page.getByTestId("table-designer-done").click();
  await expect(page.getByTestId("table-designer")).toHaveCount(0);
  await expect(page.locator(".cn-table thead")).toContainText("Department investigations");
  await page.screenshot({ path: path.join(screenshots, "22-merged-multilevel-header.png") });
  await page.getByTestId("section-groupFooter").first().click();
  const groupFooterIndex = (await doc(page)).sections.findIndex((section: any) => section.type === "groupFooter");
  await page.getByTestId("left-tab-insert").click();
  await page.getByTestId("palette-text").click();
  await page.getByTestId("value-mode-formula").click();
  await page.getByTestId("formula-input").fill('concat("Department total: ", sumBy(group.rows, "result"))');
  expect((await doc(page)).sections[groupFooterIndex].children).toMatchObject([{ type: "text", expression: 'concat("Department total: ", sumBy(group.rows, "result"))' }]);
  await page.getByTestId("left-tab-pages").click();
  await page.getByTestId("edit-page-masters").click();
  await page.getByTestId("master-add-pageHeader-first").click();
  await page.getByTestId("master-open-pageHeader-first").click();
  await page.getByTestId("value-mode-formula").click();
  await page.getByTestId("formula-input").fill('concat("Clinical report: ", data.clinical.patient.name)');
  await page.getByTestId("left-tab-pages").click();
  await page.getByTestId("edit-page-masters").click();
  await page.screenshot({ path: path.join(screenshots, "26-page-master-controls.png") });
  await page.getByTestId("master-add-page-count").click();
  expect((await doc(page)).sections.find((section: any) => section.type === "pageFooter" && section.appliesTo === "standard")?.children).toMatchObject([{ type: "text", expression: '"Page " + page.number + " of " + page.total' }]);
  await page.getByTestId("left-tab-layers").click();
  expect((await doc(page)).sections[detailIndex].children[0].repeatHeaderOnPageBreak ?? true).toBe(true);
  await page.getByTestId("mode-preview").click();
  await expect(page.getByTestId("pdf-frame")).toBeVisible();
  await expect(page.getByTestId("pdf-info")).toContainText("page");
  await page.screenshot({ path: path.join(screenshots, "16-grouped-a4-pdf-preview.png") });
  await page.getByTestId("preview-tab-html").click();
  const body = page.getByTestId("html-frame").contentFrame().locator("body");
  await expect(body).toContainText("Asha Rao");
  await expect(body).toContainText("Glucose");
  await expect(body).toContainText("Haemoglobin");
  await expect(body).toContainText("Department total: 92");
  await expect(body).toContainText("Department total: 12.8");
  expect((await body.innerText()).match(/Glucose/g)).toHaveLength(1);
  expect((await body.innerText()).match(/Haemoglobin/g)).toHaveLength(1);
  await expect(body.getByRole("row").filter({ hasText: "Glucose" })).toHaveCSS("color", "rgb(185, 28, 28)");
  await expect(body.getByRole("row").filter({ hasText: "Haemoglobin" })).toHaveCSS("color", "rgb(29, 78, 216)");
  await expect(body.getByRole("row").filter({ hasText: "Glucose" })).toHaveCSS("font-weight", "700");
  await expect(body.getByRole("row").filter({ hasText: "Haemoglobin" })).toHaveCSS("font-weight", "700");
  await page.screenshot({ path: path.join(screenshots, "17-grouped-a4-html-preview.png") });

  await page.getByTestId("mode-data").click();
  await page.getByTestId("data-item-clinical").click();
  await page.getByTestId("dataset-json").fill(JSON.stringify({
    patient: { name: "Asha Rao" },
    investigations: Array.from({ length: 100 }, (_, index) => ({ department: "Biochemistry", testName: `LAB-${String(index).padStart(3, "0")}`, result: index, flag: index % 2 ? "L" : "H" })),
  }));
  await page.getByTestId("dataset-save").click();
  await page.getByTestId("mode-design").click();
  await page.getByTestId("view-pages").click();
  await page.getByTestId("toggle-structure-pagination").click();
  await expect(page.getByTestId("page-break-2")).toBeVisible();
  await page.getByTestId("page-break-2").getByRole("button", { name: /Why/ }).click();
  await expect(page.getByTestId("page-break-details")).toContainText("Table");
  await expect(page.getByTestId("page-break-details")).toContainText("Required");
  await expect(page.getByTestId("page-break-details")).toContainText("Available");
  await page.screenshot({ path: path.join(screenshots, "25-page-break-explained.png") });
  const oldSize = (await doc(page)).sections.find((section: any) => section.type === "detail").children[0].style?.fontSize ?? 10;
  const firstBreakRow = await page.evaluate(() => (window as any).__designer.getState().engine.paginated.decisions.find((decision: any) => decision.page === 2 && decision.kind === "table-split")?.rowIndex);
  await page.getByTestId("page-break-fix").click();
  expect((await doc(page)).sections.find((section: any) => section.type === "detail").children[0].style.fontSize).toBe(oldSize - 1);
  await expect.poll(() => page.evaluate(() => (window as any).__designer.getState().engine.paginated.decisions.find((decision: any) => decision.page === 2 && decision.kind === "table-split")?.rowIndex)).toBeGreaterThan(firstBreakRow);
  await page.getByTestId("mode-preview").click();
  await expect(page.getByTestId("pdf-info")).toContainText(/\d+ pages/);
  const pageCount = Number((await page.getByTestId("pdf-info").innerText()).match(/(\d+) pages/)?.[1]);
  expect(pageCount).toBeGreaterThan(1);
  await page.screenshot({ path: path.join(screenshots, "20-grouped-a4-multipage-pdf.png") });
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-pdf").click()]);
  const pdfFile = path.join(os.tmpdir(), `open-reports-a4-${Date.now()}.pdf`);
  await download.saveAs(pdfFile);
  const pdfText = execFileSync("pdftotext", ["-layout", pdfFile, "-"], { encoding: "utf-8" });
  fs.unlinkSync(pdfFile);
  const pdfRecords = pdfText.match(/LAB-\d{3}/g) ?? [];
  expect(pdfRecords).toHaveLength(100);
  expect(new Set(pdfRecords).size).toBe(100);
  expect((pdfText.match(/Investigation/g) ?? []).length).toBe(pageCount);
  expect((pdfText.match(/Biochemistry/g) ?? []).length).toBe(pageCount);
  expect((pdfText.match(/Department total: 4950/g) ?? []).length).toBe(1);
  const pdfPages = pdfText.split("\f").filter((text) => text.trim());
  expect(pdfPages).toHaveLength(pageCount);
  expect(pdfPages[0]).toContain("Clinical report: Asha Rao");
  for (let index = 0; index < pdfPages.length; index++) {
    expect(pdfPages[index]).toContain(`Page ${index + 1} of ${pageCount}`);
    if (index > 0) expect(pdfPages[index]).not.toContain("Clinical report:");
  }
  await page.getByTestId("preview-tab-html").click();
  const longBody = page.getByTestId("html-frame").contentFrame().locator("body");
  await expect(longBody).toContainText("LAB-099");
  const text = await longBody.innerText();
  const renderedRecords = text.match(/LAB-\d{3}/g) ?? [];
  expect(renderedRecords).toHaveLength(100);
  expect(new Set(renderedRecords).size).toBe(100);
  expect(await longBody.getByRole("columnheader", { name: "Investigation", exact: true }).count()).toBe(pageCount);
  expect(await longBody.getByRole("columnheader", { name: "Department investigations", exact: true }).count()).toBe(pageCount);
  expect((text.match(/Biochemistry/g) ?? []).length).toBe(pageCount);
  expect((text.match(/Department total: 4950/g) ?? []).length).toBe(1);
  await page.screenshot({ path: path.join(screenshots, "18-grouped-a4-multipage.png") });

  for (const rowCount of [1, 31, 32]) {
    await page.getByTestId("mode-data").click();
    await page.getByTestId("data-item-clinical").click();
    await page.getByTestId("dataset-json").fill(JSON.stringify({
      patient: { name: "Asha Rao" },
      investigations: Array.from({ length: rowCount }, (_, index) => ({ department: "Biochemistry", testName: `LAB-${String(index).padStart(3, "0")}`, result: index, flag: index % 2 ? "L" : "H" })),
    }));
    await page.getByTestId("dataset-save").click();
    await page.getByTestId("mode-preview").click();
    await expect(page.getByTestId("pdf-info")).toContainText(/\d+ page/);
    await page.getByTestId("preview-tab-html").click();
    const boundaryBody = page.getByTestId("html-frame").contentFrame().locator("body");
    await expect(boundaryBody).toContainText(`LAB-${String(rowCount - 1).padStart(3, "0")}`);
    const records = (await boundaryBody.innerText()).match(/LAB-\d{3}/g) ?? [];
    expect(records).toHaveLength(rowCount);
    expect(new Set(records).size).toBe(rowCount);
  }

  await page.getByTestId("mode-design").click();
  await page.getByTestId("left-tab-layers").click();
  await addBand(page, "noData");
  const noDataIndex = (await doc(page)).sections.findIndex((section: any) => section.type === "noData");
  await page.getByTestId("left-tab-insert").click();
  await page.getByTestId("palette-text").click();
  expect((await doc(page)).sections[noDataIndex].children).toHaveLength(1);
  await page.getByTestId("value-text").fill("No investigations available");
  await page.getByTestId("mode-data").click();
  await page.getByTestId("data-item-clinical").click();
  await page.getByTestId("dataset-json").fill(JSON.stringify({ patient: { name: "Asha Rao" }, investigations: [] }));
  await page.getByTestId("dataset-save").click();
  await page.getByTestId("mode-preview").click();
  await expect(page.getByTestId("pdf-info")).toContainText(/\d+ page/);
  await page.getByTestId("preview-tab-html").click();
  const emptyBody = page.getByTestId("html-frame").contentFrame().locator("body");
  await expect(emptyBody).toContainText("No investigations available");
  expect(await emptyBody.getByRole("columnheader", { name: "Investigation" }).count()).toBe(0);
  await page.screenshot({ path: path.join(screenshots, "19-grouped-a4-no-data.png") });

  // Code mode must show this entire UI-authored report and preserve it on return.
  const beforeCode = await doc(page);
  await page.getByTestId("mode-code").click();
  await expect(page.getByTestId("code-editor")).toBeVisible();
  await expect(page.getByTestId("code-status")).toContainText("valid");
  const codeReport = await page.evaluate(() => JSON.parse((window as any).__codeView.state.doc.toString()));
  expect(codeReport).toEqual(JSON.parse(JSON.stringify(beforeCode)));
  await page.getByTestId("mode-design").click();
  expect(await doc(page)).toEqual(beforeCode);

  const stressRows = Array.from({ length: 32 }, (_, index) => ({
    department: "Biochemistry",
    testName: index === 0 ? `LAB-000 ${"Long investigation description ".repeat(4)}` : index === 1 ? "LAB-001 తెలుగు పరీక్ష" : `LAB-${String(index).padStart(3, "0")}`,
    result: index === 2 ? null : index,
    flag: index % 2 ? "L" : "H",
  }));
  await page.getByTestId("mode-data").click();
  await page.getByTestId("data-item-clinical").click();
  await page.getByTestId("dataset-json").fill(JSON.stringify({ patient: { name: "Asha Rao" }, investigations: stressRows }));
  await page.getByTestId("dataset-save").click();
  await page.getByTestId("mode-preview").click();
  await expect(page.getByTestId("pdf-info")).toContainText(/\d+ page/);
  await page.getByTestId("preview-tab-html").click();
  const stressBody = page.getByTestId("html-frame").contentFrame().locator("body");
  await expect(stressBody).toContainText("తెలుగు పరీక్ష");
  expect((await stressBody.innerText()).match(/LAB-\d{3}/g)).toHaveLength(32);
  await page.getByTestId("preview-tab-pdf").click();
  const [stressDownload] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-pdf").click()]);
  const stressPdf = path.join(os.tmpdir(), `open-reports-a4-stress-${Date.now()}.pdf`);
  await stressDownload.saveAs(stressPdf);
  const stressText = execFileSync("pdftotext", ["-layout", stressPdf, "-"], { encoding: "utf-8" });
  fs.unlinkSync(stressPdf);
  expect(stressText.match(/LAB-\d{3}/g)).toHaveLength(32);
  expect(stressText).toContain("తెలుగు పరీక్ష");
  expect(stressText).not.toContain("null");

  await page.getByTestId("btn-publish").click();
  await page.getByTestId("publish-run-checks").click();
  await expect(page.getByTestId("publish-preview-reviewed")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("publish-review")).toContainText("clinical.investigations · stress values");
  await expect(page.getByTestId("publish-review")).toContainText("Ready for review");
  await page.getByTestId("publish-preview-reviewed").check();
  if (await page.getByTestId("publish-warnings-reviewed").count()) await page.getByTestId("publish-warnings-reviewed").check();
  await page.getByTestId("publish-notes").fill("Reviewed grouped A4 report and multilingual stress output");
  await expect(page.getByTestId("publish-confirm")).toBeEnabled();
  await page.getByTestId("publish-confirm").click();
  await expect(page.getByTestId("status-pill")).toContainText("published");
  const reportId = (await doc(page)).id;
  const template = await page.request.get(`/api/v1/templates/${reportId}`);
  const { currentVersion } = await template.json();
  const version = await page.request.get(`/api/v1/templates/${reportId}/versions/${currentVersion}`);
  expect((await version.json()).notes).toBe("Reviewed grouped A4 report and multilingual stress output");
});

test("array drop offers table, repeater and cards with optional generated fields", async ({ page }) => {
  await page.getByTestId("left-tab-data").click();
  await page.getByTestId("add-dataset").click();
  await page.getByTestId("dataset-id").fill("items");
  await page.getByTestId("dataset-json").fill(JSON.stringify([{ name: "Flour", quantity: 2 }, { name: "Rice", quantity: 3 }]));
  await page.getByTestId("dataset-save").click();
  await dropInBand(page, "array-items", 0);
  const prompt = page.getByTestId("drop-prompt");
  await expect(prompt).toHaveAttribute("role", "dialog");
  await expect(prompt.getByRole("radio")).toHaveCount(3);
  await expect(prompt.getByRole("checkbox", { name: "Create fields automatically" })).toBeChecked();
  const screenshots = path.resolve("../../output/playwright/ui-audit-2026-10-02");
  fs.mkdirSync(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, "10-array-display-choice.png") });
  await prompt.getByRole("radio", { name: /Cards/ }).check();
  await page.getByTestId("create-array-display").click();
  const report = await doc(page);
  expect(report.sections[0].children[0]).toMatchObject({ type: "repeater", dataset: "items", children: [{ type: "container" }] });
  await expect(page.getByTestId("canvas")).toContainText("Flour");
  await expect(page.getByTestId("canvas")).toContainText("Rice");
  await page.screenshot({ path: path.join(screenshots, "11-array-cards-canvas.png") });

  await page.getByTestId("mode-preview").click();
  await expect(page.getByTestId("pdf-frame")).toBeVisible();
});

test("array drop can create a blank editable table", async ({ page }) => {
  await page.getByTestId("left-tab-data").click();
  await page.getByTestId("add-dataset").click();
  await page.getByTestId("dataset-id").fill("items");
  await page.getByTestId("dataset-json").fill(JSON.stringify([{ name: "Flour", quantity: 2 }]));
  await page.getByTestId("dataset-save").click();
  await dropInBand(page, "array-items", 0);
  await page.getByTestId("drop-prompt").getByRole("checkbox", { name: "Create fields automatically" }).uncheck();
  await page.getByTestId("create-array-display").click();
  expect((await doc(page)).sections[0].children).toMatchObject([{ type: "table", columns: [{ header: "New column" }] }]);
  await page.getByTestId("open-table-designer").click();
  await expect(page.getByTestId("table-designer-add-column")).toBeVisible();
});

test("empty dataset fields can be defined and dragged into a bound table", async ({ page }) => {
  await page.getByTestId("left-tab-data").click();
  await page.getByTestId("add-dataset").click();
  await page.getByTestId("dataset-id").fill("items");
  await page.getByTestId("dataset-json").fill("[]");
  await page.getByTestId("schema-add-field").click();
  await page.getByRole("textbox", { name: "Field 1 path" }).fill("invalid field");
  await page.getByTestId("dataset-save").click();
  await expect(page.getByTestId("dataset-error")).toContainText("dot-separated field names");
  await page.getByRole("textbox", { name: "Field 1 path" }).fill("name");
  await page.getByTestId("schema-add-field").click();
  await page.getByRole("textbox", { name: "Field 2 path" }).fill("quantity");
  await page.getByRole("combobox", { name: "Field 2 type" }).selectOption("number");
  const screenshots = path.resolve("../../output/playwright/ui-audit-2026-10-02");
  fs.mkdirSync(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, "13-defined-dataset-fields.png") });
  await page.getByTestId("dataset-test").click();
  await expect(page.getByTestId("dataset-schema-check")).toContainText("No rows to compare");
  await page.getByTestId("preview-empty").getByRole("button", { name: "View fields" }).click();
  await expect(page.getByTestId("dataset-result")).toContainText("Declared fields");
  await page.screenshot({ path: path.join(screenshots, "14-empty-dataset-preview.png") });
  await page.getByTestId("dataset-save").click();
  expect((await doc(page)).datasets[0].schema).toEqual({ kind: "array", fields: [{ path: "name", kind: "string" }, { path: "quantity", kind: "number" }] });
  await expect(page.getByTestId("field-items-name")).toBeVisible();
  await expect(page.getByTestId("field-items-quantity")).toBeVisible();
  await dropInBand(page, "array-items", 0);
  await expect(page.getByTestId("drop-prompt")).toContainText("2 fields: Name, Quantity");
  await page.getByTestId("create-array-display").click();
  expect((await doc(page)).sections[0].children[0].columns.map((column: any) => column.binding)).toEqual(["row.name", "row.quantity"]);
  await expect(page.locator(".cn-table")).toBeVisible();
  await page.getByRole("button", { name: "Fit to width" }).click();
  await expect(page.locator(".cn-table th")).toHaveText(["Name", "Quantity"]);
  await page.screenshot({ path: path.join(screenshots, "12-empty-dataset-bound-table.png") });
  await page.evaluate(() => { const state = (window as any).__designer.getState(); state.setDoc({ ...state.doc, id: "schema-zero-rows" }); });
  await page.getByTestId("btn-save").click();
  await expect(page.getByTestId("status-pill")).toContainText("draft · v1");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId("starter-blank").waitFor();
  await page.keyboard.press("Escape");
  await page.getByTestId("btn-open").click();
  await page.getByTestId("open-schema-zero-rows").click();
  await expect.poll(async () => (await doc(page)).datasets[0]?.schema?.fields?.map((field: any) => field.path)).toEqual(["name", "quantity"]);
});

test("preview flags declared field mismatches and Problems opens the dataset", async ({ page }) => {
  await page.getByTestId("left-tab-data").click();
  await page.getByTestId("add-dataset").click();
  await page.getByTestId("dataset-id").fill("items");
  await page.getByTestId("dataset-json").fill(JSON.stringify([{ name: "Flour", quantity: 2 }, { name: "Rice", quantity: "3" }]));
  await page.getByTestId("schema-add-field").click();
  await page.getByRole("textbox", { name: "Field 1 path" }).fill("name");
  await page.getByTestId("schema-add-field").click();
  await page.getByRole("textbox", { name: "Field 2 path" }).fill("quantity");
  await page.getByRole("combobox", { name: "Field 2 type" }).selectOption("number");
  await page.getByTestId("dataset-test").click();
  await expect(page.getByTestId("dataset-schema-check")).toContainText("1 schema mismatch");
  await expect(page.getByTestId("dataset-schema-check")).toContainText("row 2");
  const screenshots = path.resolve("../../output/playwright/ui-audit-2026-10-02");
  fs.mkdirSync(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, "15-dataset-schema-mismatch.png") });
  await page.getByTestId("dataset-save").click();
  await expect(page.getByTestId("problem-counts")).toContainText("1 warning");
  await page.getByTestId("toggle-problems").click();
  await page.getByTestId("problem-warning").getByRole("button").click();
  await expect(page.getByTestId("mode-data")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("data-item-items")).toHaveClass(/active/);
  await page.getByTestId("dataset-json").fill(JSON.stringify([{ name: "Flour", quantity: 2 }, { name: "Rice", quantity: 3 }]));
  await page.getByTestId("dataset-test").click();
  await expect(page.getByTestId("dataset-schema-check")).toContainText("No mismatches in checked sample");
  await page.getByTestId("dataset-save").click();
  await expect(page.getByTestId("problem-counts")).toContainText("0 warnings");
});

test("REST fields remain bindable before the first request succeeds", async ({ page }) => {
  await page.getByTestId("left-tab-data").click();
  await page.getByTestId("add-dataset").click();
  await page.getByTestId("dataset-id").fill("record");
  await page.getByTestId("dataset-kind-rest").click();
  await page.getByTestId("dataset-url").fill("https://example.com/record");
  await page.getByTestId("dataset-shape").selectOption("object");
  await page.getByTestId("schema-add-field").click();
  await page.getByRole("textbox", { name: "Field 1 path" }).fill("patient.name");
  await page.getByTestId("schema-add-field").click();
  await page.getByRole("textbox", { name: "Field 2 path" }).fill("items");
  await page.getByRole("combobox", { name: "Field 2 type" }).selectOption("array");
  await page.getByTestId("schema-add-field").click();
  await page.getByRole("textbox", { name: "Field 3 path" }).fill("items.amount");
  await page.getByRole("combobox", { name: "Field 3 type" }).selectOption("number");
  await page.getByTestId("dataset-save").click();
  await expect(page.getByTestId("field-record-patient.name")).toBeVisible();
  await dropInBand(page, "field-record-patient.name", 0);
  expect((await doc(page)).sections[0].children[0].binding).toBe("data.record.patient.name");
  await dropInBand(page, "field-record-items", 0);
  await page.getByTestId("create-array-display").click();
  expect((await doc(page)).sections[0].children.find((child: any) => child.type === "table").columns[0].binding).toBe("row.amount");
  await page.getByTestId("mode-data").click();
  await page.getByTestId("data-item-record").click();
  await expect(page.locator(".data-main > .schema-tree")).toContainText("patient");
  await expect(page.locator(".data-main > .schema-tree")).toContainText("name");
  await page.evaluate(() => (window as any).__designer.getState().setSample("record", { patient: { name: "Old preview" }, items: [] }));
  await page.getByTestId("dataset-url").fill("https://example.com/new-record");
  await page.getByTestId("dataset-save").click();
  const samples = await page.evaluate(() => ({ current: (window as any).__designer.getState().sample, draft: JSON.parse(localStorage.getItem("designer.draft") ?? "null") }));
  expect(samples.current.record).toBeUndefined();
  expect(JSON.stringify(samples.draft)).not.toContain("Old preview");
});

test("collapse a band, then drag its ruler edge to resize and double-click to fit", async ({ page }) => {
  const idx = 0;
  await page.getByTestId(`band-collapse-${idx}`).click();
  expect((await doc(page)).sections[idx].collapsed).toBe(true);
  await page.getByTestId(`band-collapse-${idx}`).click();
  expect((await doc(page)).sections[idx].collapsed).toBeUndefined();

  const edge = page.getByTestId(`band-edge-${idx}`);
  const box = (await edge.boundingBox())!;
  await page.mouse.move(box.x + 3, box.y + 3);
  await page.mouse.down();
  await page.mouse.move(box.x + 3, box.y + 3 + 80, { steps: 5 });
  await page.mouse.up();
  const h = (await doc(page)).sections[idx].height;
  expect(h).toBeGreaterThan(60);
  await page.getByTestId(`band-edge-${idx}`).dblclick();
  expect((await doc(page)).sections[idx].height).toBeUndefined();
});

test("click a ruler to add a guide; double-click it to delete it", async ({ page }) => {
  const ruler = page.getByTestId("ruler-h");
  const b = (await ruler.boundingBox())!;
  await page.mouse.click(b.x + 200, b.y + 9);
  const guides = (await doc(page)).guides;
  expect(guides).toHaveLength(1);
  expect(guides[0].axis).toBe("x");
  await page.getByTestId(`guide-${guides[0].id}`).locator("xpath=..").locator(".guide-hit").dblclick({ force: true });
  expect((await doc(page)).guides).toHaveLength(0);
  const verticalRuler = page.getByTestId("ruler-v");
  const verticalBox = (await verticalRuler.boundingBox())!;
  await page.mouse.click(verticalBox.x + 9, verticalBox.y + 80);
  expect((await doc(page)).guides[0].axis).toBe("y");
});

test("guide settings edit exact position, name and lock without leaving the canvas", async ({ page }) => {
  await page.getByTestId("canvas-options").locator("summary").click();
  await page.getByRole("button", { name: "+ Vertical" }).click();
  await page.getByRole("button", { name: "+ Horizontal" }).click();
  const guides = (await doc(page)).guides;
  expect(guides.map((guide: any) => guide.axis)).toEqual(["x", "y"]);
  const visibleHeight = await page.evaluate(() => (window as any).__designer.getState().engine.structure.pageSize.height);
  expect(guides[1].pos).toBeLessThan(visibleHeight);
  const row = page.getByTestId(`guide-control-${guides[0].id}`);
  await row.getByLabel("Guide name").fill("Logo edge");
  await row.getByLabel("Guide position").fill("25");
  await row.getByLabel("Guide position").blur();
  expect((await doc(page)).guides[0]).toMatchObject({ name: "Logo edge", pos: 70.9 });
  await expect(page.getByTestId(`guide-${guides[0].id}`).locator(".guide-name")).toHaveText("Logo edge");
  await row.getByRole("button", { name: "Lock guide" }).click();
  await expect(page.getByTestId(`guide-${guides[0].id}`).locator("xpath=..").locator(".guide-hit")).toHaveCount(0);
  await expect(row.getByLabel("Guide position")).toBeDisabled();
  await expect(row.getByRole("button", { name: "Delete guide" })).toBeDisabled();
  await page.getByTestId("ruler-origin").selectOption("printable");
  const leftMargin = await page.evaluate(() => (window as any).__designer.getState().engine.paginated.margin.left);
  await expect.poll(async () => Number(await row.getByLabel("Guide position").inputValue())).toBeCloseTo((70.9 - leftMargin) / (72 / 25.4), 1);
  await page.getByTestId("ruler-unit").selectOption("dots");
  await expect.poll(async () => Number(await row.getByLabel("Guide position").inputValue())).toBeCloseTo((70.9 - leftMargin) / (72 / 203), 0);
  const screenshots = path.resolve("../../output/playwright/ui-audit-2026-10-03");
  fs.mkdirSync(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, "37-guide-controls.png") });
  await row.getByRole("button", { name: "Unlock guide" }).click();
  await row.getByRole("button", { name: "Delete guide" }).click();
  expect((await doc(page)).guides).toHaveLength(1);
  expect((await doc(page)).guides[0].axis).toBe("y");
});

test("dragging a margin marker on the ruler changes the page margin", async ({ page }) => {
  const before = (await doc(page)).page.margin.left;
  const m = page.getByTestId("margin-marker-left").first();
  const b = (await m.boundingBox())!;
  await page.mouse.move(b.x + 3, b.y + 4);
  await page.mouse.down();
  await page.mouse.move(b.x + 3 + 40, b.y + 4, { steps: 5 });
  await page.mouse.up();
  expect((await doc(page)).page.margin.left).toBeGreaterThan(before);
});

test("ruler unit switch relabels the rulers and persists", async ({ page }) => {
  await page.getByTestId("canvas-options").locator("summary").click();
  await page.getByTestId("ruler-unit").selectOption("in");
  await expect(page.getByTestId("ruler-h")).toContainText("1");
  expect(await page.evaluate(() => localStorage.getItem("designer.rulerUnit"))).toBe("in");
});

test("the selected band sets the Structure ruler zero without moving content", async ({ page }) => {
  await page.getByTestId("band-tab-0").first().click();
  await page.getByTestId("canvas-options").locator("summary").click();
  await page.getByTestId("ruler-origin").selectOption("section");
  const state = await page.evaluate(() => {
    const st = (window as any).__designer.getState();
    return { y: st.engine.structure.bands.find((band: any) => band.sectionIndex === st.selectedBand).y, zoom: st.zoom };
  });
  const zero = page.getByTestId("ruler-v").locator('.tick.major[data-value="0"]');
  expect(Number(await zero.evaluate((element) => (element as HTMLElement).style.top.replace("px", "")))).toBeCloseTo(state.y * 4 / 3 * state.zoom, 1);
  await expect(page.locator(".canvas-options-panel [role=status]")).toContainText("selected band");
  await page.getByTestId("view-pages").click();
  const pageZero = page.getByTestId("ruler-v").locator('.tick.major[data-value="0"]');
  expect(Number(await pageZero.evaluate((element) => (element as HTMLElement).style.top.replace("px", "")))).toBe(0);
});

test("switching to Pages shows the paginated result", async ({ page }) => {
  await page.getByTestId("view-pages").click();
  await expect(page.locator("[data-testid^=band-tab-]")).toHaveCount(0);
  await expect(page.getByTestId("page-1")).toBeVisible();
});

test("selecting a band opens its editor and persists layout and pagination rules", async ({ page }) => {
  await page.getByTestId("band-tab-0").first().click();
  await expect(page.getByTestId("band-name")).toBeVisible();
  await page.getByTestId("band-name").fill("Line items");
  await page.getByTestId("band-tab-layout").click();
  await page.getByRole("button", { name: "Fixed", exact: true }).click();
  await page.getByTestId("band-height").fill("72");
  await page.getByTestId("band-layout-grid").click();
  await page.getByTestId("band-columns").fill("2");
  await page.getByTestId("band-tab-rules").click();
  await page.getByTestId("properties").getByRole("button", { name: "Pagination" }).click();
  await page.getByTestId("band-allowSplit").selectOption("false");
  await page.getByTestId("band-newPageBefore").check();
  expect((await doc(page)).sections[0]).toMatchObject({ name: "Line items", height: 72, layout: "grid", columns: 2, allowSplit: false, newPageBefore: true });
  await page.getByTestId("band-tab-rules").click();
  await page.getByTestId("band-visibleWhen-toggle").check();
  await page.getByTestId("band-condition-code").click();
  await page.getByTestId("band-visibleWhen").fill("row.quantity > 0");
  await expect(page.getByTestId("band-visibleWhen")).toHaveAttribute("aria-invalid", "false");
  await page.getByTestId("band-visibleWhen").fill("row.quantity >");
  await expect(page.getByTestId("band-visibleWhen")).toHaveAttribute("aria-invalid", "true");
  await page.getByTestId("band-visibleWhen").fill("row.quantity > 0");
  expect((await doc(page)).sections[0].visibleWhen).toBe("row.quantity > 0");
});

test("band layout controls reflow children with gap and padding", async ({ page }) => {
  for (let i = 0; i < 2; i++) {
    await page.getByTestId("band-tab-0").first().click();
    await page.getByTestId("left-tab-insert").click();
    await page.getByTestId("palette-text").click();
  }
  expect((await doc(page)).sections[0].children).toHaveLength(2);
  await page.getByTestId("band-tab-0").first().click();
  await page.getByTestId("band-tab-layout").click();
  await page.getByTestId("band-layout-row").click();
  await page.getByTestId("band-gap").fill("12");
  await page.getByTestId("band-padding-top").fill("8");
  await page.getByTestId("band-padding-left").fill("10");
  await page.getByRole("button", { name: "Fixed", exact: true }).click();
  await page.getByTestId("band-height").fill("90");
  await page.getByRole("button", { name: "Hug content" }).click();
  const band = (await doc(page)).sections[0];
  expect(band).toMatchObject({ layout: "row", gap: 12, style: { padding: { top: 8, right: 0, bottom: 0, left: 10 } } });
  expect(band.height).toBeUndefined();
  await expect.poll(() => page.evaluate(() => (window as any).__designer.getState().engine.structure?.bands.find((b: any) => b.sectionIndex === 0)?.node?.component.layout)).toBe("row");
  const row = await page.evaluate(() => {
    const node = (window as any).__designer.getState().engine.structure.bands.find((b: any) => b.sectionIndex === 0).node;
    return { band: node.box, children: node.children.map((child: any) => child.box) };
  });
  expect(row.children).toHaveLength(2);
  expect(row.children[0].x).toBeGreaterThanOrEqual(row.band.x + 10);
  expect(row.children[0].y).toBeGreaterThanOrEqual(row.band.y + 8);
  expect(row.children[1].x - row.children[0].x - row.children[0].width).toBeGreaterThanOrEqual(11.5);
  const screenshotDir = path.resolve("../../output/playwright/ui-audit-2026-10-03");
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, "33-band-auto-layout.png") });

  await page.getByTestId("band-layout-flow").click();
  await expect.poll(() => page.evaluate(() => (window as any).__designer.getState().engine.structure?.bands.find((b: any) => b.sectionIndex === 0)?.node?.component.layout)).toBeUndefined();
  const flow = await page.evaluate(() => {
    const node = (window as any).__designer.getState().engine.structure.bands.find((b: any) => b.sectionIndex === 0).node;
    return node.children.map((child: any) => child.box);
  });
  expect(flow[1].y - flow[0].y - flow[0].height).toBeGreaterThanOrEqual(11.5);
});

test("row layout lets text hug its content and distributes fixed children", async ({ page }) => {
  for (let i = 0; i < 2; i++) {
    await page.getByTestId("band-tab-0").first().click();
    await page.getByTestId("left-tab-insert").click();
    await page.getByTestId("palette-text").click();
  }
  const [labelId, valueId] = (await doc(page)).sections[0].children.map((child: any) => child.id);
  await page.getByTestId("left-tab-layers").click();
  await page.getByTestId(`layer-${labelId}`).click();
  await page.getByTestId("value-text").fill("Patient:");

  await page.getByTestId("band-tab-0").first().click();
  await page.getByTestId("band-tab-layout").click();
  await page.getByTestId("band-layout-row").click();
  await page.getByTestId("band-gap").fill("12");
  await page.getByTestId("band-justifyContent").selectOption("space-between");
  await page.getByRole("button", { name: "Fixed", exact: true }).click();
  expect((await doc(page)).sections[0].height).toBeGreaterThanOrEqual(24);
  await page.getByRole("button", { name: "Hug content" }).click();

  await page.getByTestId(`layer-${labelId}`).click();
  const openLayout = async () => {
    await page.getByTestId("element-tab-layout").click();
  };
  await openLayout();
  await page.getByTestId("row-width-mode").selectOption("hug");
  await page.getByTestId(`layer-${valueId}`).click();
  await page.getByTestId("value-text").fill("Asha Rao");
  await openLayout();
  await page.getByTestId("row-width-mode").selectOption("fixed");
  await page.getByTestId("quick-geometry").getByLabel("Width").fill("60");
  expect((await doc(page)).sections[0]).toMatchObject({ layout: "row", gap: 12, justifyContent: "space-between", children: [{ width: "auto" }, { width: 60 }] });

  await expect.poll(() => page.evaluate(() => {
    const node = (window as any).__designer.getState().engine.structure?.bands.find((band: any) => band.sectionIndex === 0)?.node;
    return !!node && node.children.length === 2 && node.children[0].box.width < 100 && Math.abs(node.children[1].box.width - 60) < 0.1
      && Math.abs(node.children[1].box.x + node.children[1].box.width - node.box.x - node.box.width) < 0.1;
  })).toBe(true);
  const geometry = await page.evaluate(() => {
    const node = (window as any).__designer.getState().engine.structure.bands.find((band: any) => band.sectionIndex === 0).node;
    return { firstWidth: node.children[0].box.width, lastRight: node.children[1].box.x + node.children[1].box.width, bandRight: node.box.x + node.box.width };
  });
  expect(geometry.firstWidth).toBeLessThan(100);
  expect(geometry.lastRight).toBeCloseTo(geometry.bandRight, 1);
  const firstBox = await page.locator(`.page .cn-text[data-cid="${labelId}"]`).first().boundingBox();
  const secondBox = await page.locator(`.page .cn-text[data-cid="${valueId}"]`).first().boundingBox();
  expect(firstBox && secondBox && secondBox.x - firstBox.x - firstBox.width).toBeGreaterThan(100);
  await page.getByTestId("band-tab-0").first().click();
  await page.getByTestId("band-tab-layout").click();
  const screenshotDir = path.resolve("../../output/playwright/ui-audit-2026-10-03");
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, "60-band-row-hug-and-distribute.png") });
});

test("row overflow names the item, opens it from Problems, and clears after resizing", async ({ page }) => {
  for (let i = 0; i < 2; i++) {
    await page.getByTestId("band-tab-0").first().click();
    await page.getByTestId("left-tab-insert").click();
    await page.getByTestId("palette-text").click();
  }
  const [firstId, secondId] = (await doc(page)).sections[0].children.map((child: any) => child.id);
  await page.getByTestId("band-tab-0").first().click();
  await page.getByTestId("band-tab-layout").click();
  await page.getByTestId("band-layout-row").click();
  await page.getByTestId("band-gap").fill("12");
  for (const id of [firstId, secondId]) {
    await page.getByTestId("left-tab-layers").click();
    await page.getByTestId(`layer-${id}`).click();
    await page.getByTestId("quick-geometry").getByLabel("Width").fill("400");
  }
  await expect(page.getByTestId("problem-counts")).toContainText("1 error");
  const pageBox = (await page.getByTestId("page-1").boundingBox())!;
  const badgeBox = (await page.getByTestId("diag-badge").last().boundingBox())!;
  expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(pageBox.x + pageBox.width);
  await page.getByTestId("diag-badge").last().click();
  await expect(page.getByTestId("problems")).toContainText("beyond the printable page edge");
  await page.getByTestId("problem-error").getByRole("button").first().click();
  await expect(page.getByTestId(`layer-${secondId}`)).toHaveClass(/selected/);
  const screenshotDir = path.resolve("../../output/playwright/ui-audit-2026-10-03");
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, "61-row-printable-width-problem.png") });
  await page.getByTestId("quick-geometry").getByLabel("Width").fill("80");
  await expect(page.getByTestId("problem-counts")).toContainText("0 errors");
});

test("row wrap and child shrink are editable and reflected on the canvas", async ({ page }) => {
  for (let i = 0; i < 2; i++) {
    await page.getByTestId("band-tab-0").first().click();
    await page.getByTestId("left-tab-insert").click();
    await page.getByTestId("palette-text").click();
  }
  const [firstId, secondId] = (await doc(page)).sections[0].children.map((child: any) => child.id);
  await page.getByTestId("band-tab-0").first().click();
  await page.getByTestId("band-tab-layout").click();
  await page.getByTestId("band-layout-row").click();
  await page.getByTestId("band-gap").fill("12");
  for (const id of [firstId, secondId]) {
    await page.getByTestId("left-tab-layers").click();
    await page.getByTestId(`layer-${id}`).click();
    await page.getByTestId("quick-geometry").getByLabel("Width").fill("400");
  }
  await expect(page.getByTestId("problem-counts")).toContainText("1 error");
  await page.getByTestId("band-tab-0").first().click();
  await page.getByTestId("band-tab-layout").click();
  await page.getByTestId("band-wrap").check();
  await expect(page.getByTestId("problem-counts")).toContainText("0 errors");
  await expect.poll(() => page.evaluate(() => {
    const children = (window as any).__designer.getState().engine.structure.bands.find((band: any) => band.sectionIndex === 0).node.children;
    return children[1].box.y >= children[0].box.y + children[0].box.height + 11.5 && Math.abs(children[1].box.x - children[0].box.x) < 0.1;
  })).toBe(true);
  const screenshotDir = path.resolve("../../output/playwright/ui-audit-2026-10-03");
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, "62-row-wrap.png") });

  await page.getByTestId("band-wrap").uncheck();
  for (const id of [firstId, secondId]) {
    await page.getByTestId("left-tab-layers").click();
    await page.getByTestId(`layer-${id}`).click();
    await page.getByTestId("element-tab-layout").click();
    await page.getByLabel("Shrink", { exact: true }).fill("1");
  }
  await expect(page.getByTestId("problem-counts")).toContainText("0 errors");
  await expect.poll(() => page.evaluate(() => {
    const node = (window as any).__designer.getState().engine.structure.bands.find((band: any) => band.sectionIndex === 0).node;
    return node.children[1].box.x + node.children[1].box.width <= node.box.x + node.box.width + 0.1;
  })).toBe(true);
  expect((await doc(page)).sections[0]).toMatchObject({ layout: "row", children: [{ width: 400, shrink: 1 }, { width: 400, shrink: 1 }] });
  await page.screenshot({ path: path.join(screenshotDir, "63-row-shrink.png") });
});

test("tall side-by-side text continues on real pages with an explained row break", async ({ page }) => {
  for (let i = 0; i < 2; i++) {
    await page.getByTestId("band-tab-0").first().click();
    await page.getByTestId("left-tab-insert").click();
    await page.getByTestId("palette-text").click();
  }
  const [leftId, rightId] = (await doc(page)).sections[0].children.map((child: any) => child.id);
  for (const [id, prefix, count] of [[leftId, "LEFT", 95], [rightId, "RIGHT", 75]] as const) {
    await page.getByTestId("left-tab-layers").click();
    await page.getByTestId(`layer-${id}`).click();
    await page.getByTestId("value-text").fill(Array.from({ length: count }, (_, index) => `${prefix}${String(index + 1).padStart(3, "0")}`).join("\n"));
    await page.getByTestId("quick-geometry").getByLabel("Width").fill("240");
  }
  await page.getByTestId("band-tab-0").first().click();
  await page.getByTestId("band-tab-layout").click();
  await page.getByTestId("band-layout-row").click();
  await page.getByTestId("band-gap").fill("12");
  await expect.poll(() => page.evaluate(() => {
    const paginated = (window as any).__designer.getState().engine.paginated;
    return paginated?.pages.length > 1 && paginated.decisions.some((decision: any) => decision.kind === "row-split");
  })).toBe(true);
  await expect(page.getByTestId("problem-counts")).toContainText("0 errors");
  await page.getByTestId("view-pages").click();
  await expect(page.getByTestId("page-2")).toBeVisible();
  await page.getByTestId("toggle-pagination").click();
  await page.getByTestId("pagination-decision").first().click();
  await expect(page.getByTestId("page-break-details")).toContainText("row split");
  await expect(page.getByTestId("page-break-details")).toContainText("text columns");
  await expect(page.getByTestId("page-break-details")).toContainText('Row "Detail"');
  const screenshotDir = path.resolve("../../output/playwright/ui-audit-2026-10-03");
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, "64-row-text-continuation.png") });
});

test("page band master and band actions are editable", async ({ page }) => {
  await page.getByTestId("band-plus-0").first().click({ force: true });
  await page.getByTestId("add-pageHeader").click();
  await expect(page.getByTestId("band-appliesTo")).toBeVisible();
  await page.getByTestId("band-appliesTo").selectOption("first");
  const first = (await doc(page)).sections.findIndex((s: any) => s.type === "pageHeader");
  expect((await doc(page)).sections[first].appliesTo).toBe("first");
  await page.getByRole("button", { name: "Band actions" }).click();
  await page.getByTestId("duplicate-band").click();
  expect((await doc(page)).sections.filter((s: any) => s.type === "pageHeader")).toHaveLength(2);
  await page.getByRole("button", { name: "Band actions" }).click();
  await page.getByTestId("delete-band").click();
  expect((await doc(page)).sections.filter((s: any) => s.type === "pageHeader")).toHaveLength(1);
});

test("group band exposes the owning group's print rules", async ({ page }) => {
  await page.evaluate(() => {
    const st = (window as any).__designer.getState();
    st.setDoc({ ...st.doc,
      datasets: [{ id: "items", source: "inline", query: { data: [{ department: "A" }] } }],
      groups: [{ id: "dept", name: "Department", dataset: "items", by: "row.department", sort: "asc" }],
      sections: [
        { type: "groupHeader", groupId: "dept", children: [] },
        { type: "detail", dataset: "items", children: [] },
        { type: "groupFooter", groupId: "dept", children: [] },
      ],
    });
  });
  await page.getByTestId("band-tab-0").first().click();
  await page.getByTestId("group-by").fill("row.dep");
  await expect(page.getByRole("listbox")).toContainText("row.department");
  await page.getByTestId("group-by").press("Tab");
  await page.getByTestId("group-sort").selectOption("desc");
  await page.getByTestId("group-repeatHeader").check();
  await page.getByTestId("group-newPage").selectOption("before");
  await page.getByTestId("group-minDetailRows").fill("2");
  await page.getByTestId("band-tab-rules").click();
  await page.getByTestId("properties").getByRole("button", { name: "Pagination" }).click();
  await page.getByTestId("band-repeatEveryPage").uncheck();
  expect((await doc(page)).groups[0]).toMatchObject({ by: "row.department", sort: "desc", repeatHeader: true, newPage: "before", minDetailRows: 2 });
  expect((await doc(page)).sections[0].repeatEveryPage).toBe(false);
});

test("report explorer shows nested groups and reorders only valid bands", async ({ page }) => {
  await page.evaluate(() => {
    const st = (window as any).__designer.getState();
    st.setDoc({ ...st.doc,
      groups: [
        { id: "outer", name: "Department", by: "row.department" },
        { id: "inner", name: "Category", by: "row.category" },
      ],
      sections: [
        { type: "reportHeader", name: "A", children: [] },
        { type: "reportHeader", name: "B", children: [] },
        { type: "detail", children: [] },
      ],
    });
  });
  await page.getByTestId("left-tab-layers").click();
  await expect(page.getByTestId("explorer-group-outer")).toContainText("Department");
  await expect(page.getByTestId("explorer-group-inner")).toContainText("Category");
  await page.locator("[data-band-index='0']").dragTo(page.locator("[data-band-index='1']"));
  expect((await doc(page)).sections.map((s: any) => s.name ?? s.type)).toEqual(["B", "A", "detail"]);
  await page.locator("[data-band-index='2']").dragTo(page.locator("[data-band-index='0']"));
  expect((await doc(page)).sections.map((s: any) => s.name ?? s.type)).toEqual(["B", "A", "detail"]);
  await page.locator("[data-band-index='1']").click();
  await expect(page.getByTestId("band-name")).toHaveValue("A");
  await addBand(page, "reportFooter");
  expect((await doc(page)).sections.at(-1).type).toBe("reportFooter");
});

test("band visibility changes output while layout lock protects structure", async ({ page }) => {
  await page.getByTestId("left-tab-layers").click();
  const row = page.locator("[data-band-index='0']");
  await row.click();
  await row.getByRole("button", { name: /Actions for/ }).click();
  await row.getByRole("button", { name: "Hide from output" }).click();
  expect((await doc(page)).sections[0].hidden).toBe(true);
  await expect(row).toHaveClass(/is-hidden/);
  await expect(page.getByTestId("band-0").first()).toHaveClass(/hidden-rule/);

  await row.getByRole("button", { name: /Actions for/ }).click();
  await row.getByRole("button", { name: "Lock layout" }).click();
  expect((await doc(page)).sections[0].locked).toBe(true);
  await expect(row).toHaveAttribute("draggable", "false");
  await expect(page.getByTestId("band-tab-0").first()).toHaveAttribute("draggable", "false");
  await expect(page.getByTestId("band-edge-0")).toHaveCount(0);
  await row.getByRole("button", { name: /Actions for/ }).click();
  await expect(row.getByRole("button", { name: /Remove .* band/ })).toBeDisabled();

  await row.click();
  await page.getByTestId("band-tab-layout").click();
  await expect(page.getByTestId("band-minHeight")).toBeDisabled();
  await page.getByRole("button", { name: "Band actions" }).click();
  await expect(page.getByTestId("delete-band")).toBeDisabled();
  await page.getByRole("button", { name: "Band actions" }).click();
  await page.getByTestId("band-tab-rules").click();
  await page.getByTestId("band-hidden").uncheck();
  await expect(row).not.toHaveClass(/is-hidden/);
  expect((await doc(page)).sections[0].hidden).toBeUndefined();

  await page.getByRole("button", { name: "Band actions" }).click();
  await page.getByTestId("band-lock").click();
  await page.getByTestId("band-tab-layout").click();
  await expect(page.getByTestId("band-minHeight")).toBeEnabled();
  await expect(page.getByTestId("band-edge-0")).toHaveCount(1);
  expect((await doc(page)).sections[0].locked).toBeUndefined();
});

test("group wizard creates nested levels with print rules and can remove one level", async ({ page }) => {
  await page.evaluate(() => {
    const st = (window as any).__designer.getState();
    st.setDoc({ ...st.doc,
      datasets: [{ id: "visits", source: "inline", query: { data: [{ dept: "A", doctor: "Rao" }, { dept: "A", doctor: "Das" }] } }],
      groups: [],
      sections: [{ type: "detail", dataset: "visits", children: [{ type: "text", id: "doctor", binding: "row.doctor" }] }],
    });
  });
  await page.getByTestId("left-tab-layers").click();
  await addGroup(page);
  await expect(page.getByTestId("group-wizard")).toBeVisible();
  await expect(page.getByTestId("wizard-dataset")).toHaveValue("visits");
  await page.getByTestId("wizard-field").selectOption("row.dept");
  await page.getByTestId("wizard-name").fill("Department");
  await page.getByTestId("wizard-repeat").check();
  await page.getByTestId("wizard-new-page").selectOption("before");
  await page.getByTestId("wizard-min-rows").fill("2");
  await page.getByTestId("wizard-create").click();
  expect((await doc(page)).groups[0]).toMatchObject({ name: "Department", dataset: "visits", by: "row.dept", repeatHeader: true, newPage: "before", minDetailRows: 2 });

  await addGroup(page);
  await page.getByTestId("wizard-field").selectOption("row.doctor");
  await page.getByTestId("wizard-name").fill("Doctor");
  await page.getByTestId("wizard-sort").selectOption("desc");
  await page.getByTestId("wizard-create").click();
  const report = await doc(page);
  expect(report.groups.map((g: any) => g.name)).toEqual(["Department", "Doctor"]);
  expect(report.groups[1].sort).toBe("desc");
  expect(report.sections.map((s: any) => s.type)).toEqual(["groupHeader", "groupHeader", "detail", "groupFooter", "groupFooter"]);
  const outer = page.getByTestId(`explorer-group-${report.groups[0].id}`);
  const inner = outer.getByTestId(`explorer-group-${report.groups[1].id}`);
  await expect(inner).toBeVisible();
  await expect(inner.locator('[data-band-index="2"]')).toBeVisible();
  await outer.getByRole("button", { name: "Collapse Department" }).click();
  await expect(inner).toHaveCount(0);
  await outer.getByRole("button", { name: "Expand Department" }).click();
  await expect(outer.getByTestId(`explorer-group-${report.groups[1].id}`)).toBeVisible();
  await outer.getByRole("button", { name: "Department", exact: true }).click();
  await expect(page.getByTestId("group-name")).toHaveValue("Department");

  await outer.getByTestId(`explorer-group-${report.groups[1].id}`).getByRole("button", { name: /Actions for Doctor/ }).click();
  await page.getByTestId(`explorer-remove-group-${report.groups[1].id}`).click();
  const after = await doc(page);
  expect(after.groups).toHaveLength(1);
  expect(after.sections.map((s: any) => s.type)).toEqual(["groupHeader", "detail", "groupFooter"]);
});

test("adding a group band with no group opens the wizard", async ({ page }) => {
  await page.getByTestId("band-plus-0").click({ force: true });
  await page.getByTestId("add-groupHeader").click();
  await expect(page.getByTestId("group-wizard")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  expect((await doc(page)).groups ?? []).toHaveLength(0);
});

test("structure view locates real page starts and opens their pagination reasons", async ({ page }) => {
  await page.evaluate(() => {
    const st = (window as any).__designer.getState();
    st.setDoc({ ...st.doc,
      datasets: [{ id: "items", source: "inline", query: { data: Array.from({ length: 120 }, (_, i) => ({ n: `Item ${i + 1}` })) } }],
      sections: [{ type: "detail", children: [{ type: "table", id: "items-table", dataset: "items", columns: [{ id: "n", header: "Item", binding: "row.n" }] }] }],
    });
  });
  await expect(page.getByTestId("structure-page-thumb")).toHaveCount(0);
  await page.getByTestId("toggle-structure-pagination").click();
  await expect.poll(() => page.getByTestId("structure-page-thumb").count()).toBeGreaterThan(1);
  await page.getByTestId("structure-page-why-2").click();
  await expect(page.getByTestId("structure-page-reason")).toContainText("Why page 2 starts here");
  await expect(page.getByTestId("structure-page-reason")).toContainText("Table");
  await expect(page.getByTestId("structure-break-marker").first()).toBeVisible();
  await page.getByTestId("structure-break-marker").first().locator("button").click();
  await expect(page.getByTestId("structure-break-popover")).toContainText("page 2");
  await expect(page.getByTestId("structure-break-popover")).toContainText("Table");
  await page.getByTestId("toggle-structure-pagination").click();
  await expect(page.getByTestId("structure-page-thumb")).toHaveCount(0);
  await expect(page.getByTestId("structure-break-marker")).toHaveCount(0);
  await page.getByTestId("toggle-structure-pagination").click();
  await page.getByTestId("toggle-preview-split").click();
  await expect(page.getByTestId("structure-preview-pane")).toBeVisible();
  await expect(page.getByTestId("structure-pdf-frame")).toHaveAttribute("src", /^blob:/);
  expect(await page.getByTestId("structure-pdf-frame").evaluate(async (frame) => (await (await fetch((frame as HTMLIFrameElement).src)).blob()).slice(0, 5).text())).toBe("%PDF-");
  await expect(page.getByTestId("structure-pdf-info")).toContainText("page");
  await page.getByTestId("structure-page-thumb").nth(1).click();
  await expect(page.getByTestId("view-pages")).toHaveClass(/on/);
  await expect(page.getByTestId("page-2")).toBeVisible();
});

test("a repeated group-header explanation fixes the source band", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 900 });
  await page.evaluate(() => {
    const st = (window as any).__designer.getState();
    st.setDoc({ ...st.doc,
      datasets: [{ id: "items", source: "inline", query: { data: Array.from({ length: 120 }, (_, i) => ({ dept: "Laboratory", name: `Test ${i + 1}` })) } }],
      groups: [{ id: "department", dataset: "items", by: "row.dept", repeatHeader: true, minDetailRows: 1 }],
      sections: [
        { id: "department-header", type: "groupHeader", groupId: "department", children: [{ id: "department-title", type: "text", value: "Laboratory" }] },
        { id: "results-detail", type: "detail", dataset: "items", children: [{ id: "results-table", type: "table", dataset: "items", columns: [{ id: "name", header: "Test", binding: "row.name" }] }] },
      ],
    });
  });
  await page.getByTestId("toggle-structure-pagination").click();
  await expect.poll(() => page.evaluate(() => (window as any).__designer.getState().engine.paginated?.decisions.some((decision: any) => decision.kind === "group-header-repeated" && decision.page === 2))).toBe(true);
  await page.getByTestId("structure-page-why-2").click();
  const fix = page.getByTestId("structure-page-reason").getByRole("button", { name: "Stop repeating this header" });
  await expect(fix).toBeVisible();
  const screenshots = path.resolve("../../output/playwright/ui-audit-2026-10-03");
  fs.mkdirSync(screenshots, { recursive: true });
  await page.screenshot({ path: path.join(screenshots, "49-pagination-band-fix.png") });
  await fix.click();
  expect((await doc(page)).sections[0].repeatEveryPage).toBe(false);
  await expect.poll(() => page.evaluate(() => (window as any).__designer.getState().engine.paginated?.decisions.some((decision: any) => decision.kind === "group-header-repeated"))).toBe(false);
});
