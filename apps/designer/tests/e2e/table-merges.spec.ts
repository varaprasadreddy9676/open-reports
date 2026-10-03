import { test, expect, type Page } from "@playwright/test";

const orders = [
  { code: "A1", region: "East", product: "Desk", total: 10 },
  { code: "B2", region: "East", product: "Chair", total: 20 },
  { code: "C3", region: "East", product: "Lamp", total: 30 },
  { code: "D4", region: "West", product: "Desk", total: 40 },
  { code: "E5", region: "West", product: "Shelf", total: 50 },
];

async function open(page: Page) {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate((orders) => {
    const store = (window as any).__designer.getState();
    store.loadDoc({
      ...store.doc, id: "merges",
      datasets: [{ id: "orders", source: "inline", query: { data: orders } }],
      sections: [{ type: "detail", children: [{ type: "table", id: "orders-table", dataset: "orders", columns: [
        { id: "code", header: "Code", binding: "row.code" },
        { id: "region", header: "Region", binding: "row.region" },
        { id: "product", header: "Product", binding: "row.product" },
        { id: "total", header: "Total", binding: "row.total" },
      ] }] }],
    });
    store.select(["orders-table"]);
  }, orders);
  await page.getByTestId("open-table-designer").click();
}

const resolvedSpans = (page: Page) => page.evaluate(() => {
  const s = (window as any).__designer.getState();
  const find = (nodes: any[]): any => nodes.flatMap((n) => [n, ...(n.children ? find(n.children) : [])]);
  return find(s.engine.resolved.sections.flatMap((section: any) => section.children)).find((n: any) => n.id === "orders-table").cellSpans;
});
const table = (page: Page) => page.evaluate(() => {
  const s = (window as any).__designer.getState();
  return s.doc.sections[0].children[0];
});

test("a merge kept with a record follows that record when the table is re-sorted", async ({ page }) => {
  await open(page);
  await page.getByTestId("table-tab-rows").click();
  await page.getByTestId("body-cell-1-2").click();
  await page.getByTestId("body-cell-1-3").click();
  const anchor = page.getByTestId("merge-anchor");
  await expect(anchor.locator("option:checked")).toHaveText('With the record where Code = "B2"');
  await expect(anchor).toContainText('With the record where Region = "East" (not unique in the sample)');
  await page.getByTestId("body-merge").click();
  expect((await table(page)).cellSpans).toEqual([{ match: { field: "row.code", value: "B2" }, column: 2, rowSpan: 1, colSpan: 2 }]);
  await expect.poll(() => resolvedSpans(page)).toEqual([{ row: 1, column: 2, colSpan: 2, rowSpan: 1, source: 0 }]);

  await page.getByTestId("body-cell-1-2").click();
  await expect(page.getByTestId("merge-anchor-info")).toHaveText('Follows the record where Code = "B2"');

  await page.evaluate(() => (window as any).__designer.getState().patch("orders-table", { sortBy: [{ binding: "row.total", direction: "desc" }] }));
  await expect.poll(() => resolvedSpans(page)).toEqual([{ row: 3, column: 2, colSpan: 2, rowSpan: 1, source: 0 }]);
  await expect(page.getByTestId("body-cell-3-2")).toHaveText("Chair");
  await expect(page.getByTestId("body-cell-3-3")).toHaveCount(0);

  await page.getByTestId("body-cell-3-2").click();
  await page.getByTestId("body-split").click();
  expect((await table(page)).cellSpans).toBeUndefined();
});

test("merging repeated values is a column setting that the canvas and PDF honour", async ({ page }) => {
  await open(page);
  await page.getByTestId("table-tab-columns").click();
  await page.getByTestId("column-1").locator("button.link").click();
  await page.getByTestId("column-merge-repeated-1").check();
  expect((await table(page)).columns[1].mergeRepeated).toBe(true);
  await expect.poll(() => resolvedSpans(page)).toEqual([{ row: 0, column: 1, rowSpan: 3, splittable: true }, { row: 3, column: 1, rowSpan: 2, splittable: true }]);

  await page.getByTestId("table-tab-rows").click();
  await expect(page.getByTestId("body-cell-0-1")).toHaveClass(/auto-merged/);
  await page.getByTestId("body-cell-0-1").click();
  await expect(page.getByTestId("merge-anchor-info")).toContainText("Merged automatically");
  await expect(page.getByTestId("body-split")).toBeDisabled();

  await page.getByTestId("table-designer-done").click();
  await expect(page.locator(".cn-table tbody td[rowspan='3']").first()).toHaveText("East");
  await page.getByTestId("mode-preview").click();
  const text = page.getByTestId("pdf-frame").locator('.page[data-page-number="1"] .textLayer');
  await expect(text).toContainText("West");
  expect(((await text.textContent()) ?? "").split("East").length - 1).toBe(1);
});
