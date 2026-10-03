import { test, expect, type Page } from "@playwright/test";

const orders = [
  { number: "SO-1", customer: "Acme", lines: [{ sku: "SKU-A", qty: 2 }, { sku: "SKU-B", qty: 1 }] },
  { number: "SO-2", customer: "Globex", lines: [{ sku: "SKU-C", qty: 5 }] },
];

async function start(page: Page) {
  await page.addInitScript(() => localStorage.setItem("designer.canvasView", "structure"));
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate((orders) => {
    const store = (window as any).__designer.getState();
    store.loadDoc({ ...store.doc, id: "orders", datasets: [{ id: "orders", source: "inline", query: { data: orders } }], sections: [{ type: "detail", children: [] }] });
  }, orders);
  await page.getByTestId("left-tab-data").click();
  await page.getByTestId("field-orders-lines").scrollIntoViewIfNeeded();
}

async function drag(page: Page, source: string, target: { x: number; y: number }) {
  await expect.poll(() => page.evaluate(() => (window as any).__designer.getState().engineBusy)).toBe(false);
  const from = (await page.getByTestId(source).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2 + 8, { steps: 3 });
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await page.mouse.up();
}

const doc = (page: Page) => page.evaluate(() => (window as any).__designer.getState().doc);

test("dragging a nested list onto the page builds a master-detail layout", async ({ page }) => {
  await start(page);
  const band = (await page.getByTestId("band-0").first().boundingBox())!;
  await drag(page, "field-orders-lines", { x: band.x + band.width / 2, y: band.y + Math.min(band.height / 2, 24) });
  await expect(page.getByTestId("drop-prompt-nesting")).toHaveText("Each Orders record will list its own lines.");
  await expect(page.getByTestId("drop-prompt")).toContainText("2 fields: SKU, Qty");
  await page.getByTestId("create-array-display").click();
  const [repeater] = (await doc(page)).sections[0].children;
  expect(repeater).toMatchObject({ type: "repeater", dataset: "orders", children: [{ type: "table", dataset: "row.lines" }] });
  expect(repeater.children[0].columns.map((c: any) => c.binding)).toEqual(["row.sku", "row.qty"]);

  // Column choices inside the nested table offer the line fields and the parent order's fields.
  await page.evaluate((id) => (window as any).__designer.getState().select([id]), repeater.children[0].id);
  await page.getByTestId("open-table-designer").click();
  await page.getByTestId("table-tab-columns").click();
  await page.getByTestId("column-0").locator("button.link").click();
  const choices = await page.getByTestId("column-0").getByLabel("Column field").locator("option").allTextContents();
  expect(choices.join("|")).toMatch(/SKU/);
  expect(choices.join("|")).toMatch(/Parent › Customer/);
  await page.getByTestId("table-designer-done").click();

  await page.getByTestId("mode-preview").click();
  const text = page.getByTestId("pdf-frame").locator('.page[data-page-number="1"] .textLayer');
  await expect(text).toContainText("SKU-A");
  await expect(text).toContainText("SKU-C");
});

test("dragging a nested list into a row of its parent list shows that record's own list", async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const store = (window as any).__designer.getState();
    store.loadDoc({ ...store.doc, sections: [{ type: "detail", children: [{ type: "repeater", id: "each-order", dataset: "orders", children: [{ type: "text", id: "order-no", binding: "row.number" }] }] }] });
    store.set({ canvasView: "pages" });
  });
  await page.getByTestId("left-tab-data").click();
  const anchor = (await page.locator('.cn-text[data-cid="order-no"]').first().boundingBox())!;
  await drag(page, "field-orders-lines", { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height - 2 });
  await expect(page.getByTestId("drop-prompt-nesting")).toHaveText("Shows the lines of each record in this list.");
  await page.getByTestId("create-array-display").click();
  const repeater = (await doc(page)).sections[0].children[0];
  expect(repeater.children.map((c: any) => [c.type, c.dataset])).toEqual([["text", undefined], ["table", "row.lines"]]);
  await expect.poll(() => page.evaluate(() => (window as any).__designer.getState().engineBusy)).toBe(false);
  const tables = await page.evaluate(() => {
    const walk = (nodes: any[]): any[] => nodes.flatMap((n) => [n, ...walk(n.children ?? [])]);
    const s = (window as any).__designer.getState();
    return walk(s.engine.resolved.sections.flatMap((x: any) => x.children)).filter((n) => n.type === "table").map((t) => t.rows.map((r: any) => r.formatted.sku));
  });
  expect(tables).toEqual([["SKU-A", "SKU-B"], ["SKU-C"]]);
});
