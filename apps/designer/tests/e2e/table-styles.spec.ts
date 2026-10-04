import { test, expect, type Page } from "@playwright/test";

const doc = (page: Page) => page.evaluate(() => (window as any).__designer.getState().doc);

test("table styles are edited in the Table Designer, shown on the canvas, and saved as a theme preset", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate(() => {
    const store = (window as any).__designer.getState();
    store.loadDoc({ ...store.doc, id: "styled-table",
      datasets: [{ id: "rows", source: "inline", query: { data: [{ item: "Apples" }, { item: "Pears" }, { item: "Plums" }] } }],
      sections: [{ type: "detail", children: [{ type: "table", id: "fruit", dataset: "rows", columns: [{ id: "item", header: "Item", binding: "row.item" }] }] }] });
    store.select(["fruit"]);
  });
  await page.getByTestId("open-table-designer").click();
  await page.getByTestId("table-tab-style").click();
  const header = page.getByTestId("table-style-header");
  await header.getByLabel("Header background value").fill("#1d4ed8");
  await header.getByLabel("Header text colour value").fill("#ffffff");
  await page.getByTestId("table-style-alternateRow").getByLabel("Stripes (every second row) background value").fill("#fde68a");
  await page.getByTestId("table-grid-lines").selectOption("all");
  await page.getByLabel("Line colour value").fill("#ff0000");
  expect((await doc(page)).sections[0].children[0].styles).toEqual({
    header: { background: "#1d4ed8", color: "#ffffff" }, alternateRow: { background: "#fde68a" }, grid: { lines: "all", color: "#ff0000" },
  });
  await page.getByTestId("table-designer-done").click();

  const table = page.locator('.cn-table[data-cid="fruit"]').first();
  await expect(table.locator("th").first()).toHaveCSS("background-color", "rgb(29, 78, 216)");
  await expect(table.locator("th").first()).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(table.locator("tbody tr").nth(1)).toHaveCSS("background-color", "rgb(253, 230, 138)");
  await expect(table.locator("tbody tr").nth(0)).not.toHaveCSS("background-color", "rgb(253, 230, 138)");
  await expect(table.locator("tbody td").first()).toHaveCSS("border-top-color", "rgb(255, 0, 0)");

  await page.evaluate(() => (window as any).__designer.getState().select(["fruit"]));
  await page.getByTestId("open-table-designer").click();
  await page.getByTestId("table-tab-style").click();
  page.once("dialog", (dialog) => dialog.accept("fruit-ledger"));
  await page.getByTestId("table-style-save-preset").click();
  const saved = await doc(page);
  expect(saved.theme.tableStyles["fruit-ledger"]).toEqual({ header: { background: "#1d4ed8", color: "#ffffff" }, alternateRow: { background: "#fde68a" }, grid: { lines: "all", color: "#ff0000" } });
  expect(saved.sections[0].children[0]).toMatchObject({ tableStyle: "fruit-ledger" });
  expect(saved.sections[0].children[0].styles).toBeUndefined();
  await expect(page.getByTestId("table-style-preset")).toHaveValue("fruit-ledger");
  await page.getByTestId("table-designer-done").click();
  await expect(table.locator("th").first()).toHaveCSS("background-color", "rgb(29, 78, 216)");

  await page.getByTestId("mode-preview").click();
  await expect(page.getByTestId("pdf-frame").locator('.page[data-page-number="1"] .textLayer')).toContainText("Plums");
});
