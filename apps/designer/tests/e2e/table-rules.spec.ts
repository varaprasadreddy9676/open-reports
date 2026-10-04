import { test, expect, type Page } from "@playwright/test";

const table = (page: Page) => page.evaluate(() => (window as any).__designer.getState().doc.sections[0].children[0]);
const resolvedTable = (page: Page) => page.evaluate(() => {
  const walk = (list: any[]): any => list.map((n) => (n.component.type === "table" ? n.component : walk(n.children ?? []))).find(Boolean);
  return walk((window as any).__designer.getState().engine.paginated?.pages[0]?.content ?? []);
});

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate(() => {
    const store = (window as any).__designer.getState();
    store.loadDoc({
      ...store.doc, id: "table-rules",
      parameters: [{ id: "showCost", type: "boolean", default: true }],
      datasets: [{ id: "lines", source: "inline", query: { data: [{ item: "Rent", amount: 1200, cost: 3 }, { item: "Refund", amount: -80, cost: 1 }, { item: "Void", amount: 0, cost: 0 }] } }],
      sections: [{ type: "detail", children: [{
        type: "table", id: "lines", dataset: "lines",
        rowStyleWhen: [{ when: "row.amount > 1000", style: { fontWeight: "bold" } }],
        columns: [
          { id: "item", header: "Item", binding: "row.item" },
          { id: "amount", header: "Amount", binding: "row.amount" },
          { id: "cost", header: "Cost", binding: "row.cost" },
        ],
      }] }],
    });
    store.set({ tableEditId: "lines" });
  });
  await page.getByTestId("table-tab-conditions").click();
});

test("legacy row conditions become rules, and a rule can leave rows out", async ({ page }) => {
  await expect(page.getByTestId("legacy-row-rules")).toBeVisible();
  await expect(page.getByTestId("table-row-rules-0")).toBeVisible();
  await page.getByTestId("table-row-rules-add").click();
  await page.getByLabel("Rule 2 field").selectOption("row.amount");
  await page.getByLabel("Rule 2 value").fill("0");
  await page.getByLabel("Rule 2 hide row").check();
  const t = await table(page);
  expect(t.rowStyleWhen).toBeUndefined();
  expect(t.rowRules).toEqual([
    { when: "row.amount > 1000", set: { "style.fontWeight": "bold" } },
    { when: "row.amount == 0", set: { "style.color": "#b91c1c", "style.fontWeight": "bold", visible: false } },
  ]);
  await expect.poll(async () => (await resolvedTable(page))?.rows.map((r: any) => r.raw.item)).toEqual(["Rent", "Refund"]);
});

test("cell rules colour a column's cells and replace their text", async ({ page }) => {
  await page.getByTestId("rules-column").selectOption({ label: "Amount" });
  await page.getByTestId("table-cell-rules-add").click();
  await page.getByLabel("Rule 1 replacement text").fill("credit");
  const amount = (await table(page)).columns[1];
  expect(amount.rules).toEqual([{ when: "value < 0", set: { "style.color": "#b91c1c", "style.fontWeight": "bold", text: "credit" } }]);
  await expect.poll(async () => (await resolvedTable(page))?.rows[1].formatted.amount).toBe("credit");
  // The live sample shows the rule's effect on exactly the matching cell.
  await expect(page.getByTestId("preview-cell-1-1")).toHaveCSS("color", "rgb(185, 28, 28)");
  await expect(page.getByTestId("preview-cell-1-1")).toHaveText("credit");
  await expect(page.getByTestId("preview-cell-0-1")).not.toHaveCSS("color", "rgb(185, 28, 28)");
  await page.getByTestId("table-designer-done").click();
  await expect(page.locator(".cn-table tbody tr").nth(1).locator("td").nth(1)).toHaveCSS("color", "rgb(185, 28, 28)");
  await expect(page.locator(".cn-table tbody tr").nth(0).locator("td").nth(1)).not.toHaveCSS("color", "rgb(185, 28, 28)");
});

test("a column can be hidden by a parameter", async ({ page }) => {
  await page.getByTestId("rules-column").selectOption({ label: "Cost" });
  const hide = page.getByTestId("column-hide-when");
  await hide.click();
  await page.keyboard.type("!params.showCost");
  await page.keyboard.press("Tab");
  expect((await table(page)).columns[2].rules).toEqual([{ when: "!params.showCost", set: { visible: false } }]);
  await expect.poll(async () => (await resolvedTable(page))?.columns.map((c: any) => c.id)).toEqual(["item", "amount", "cost"]);
  await page.evaluate(() => (window as any).__designer.getState().setParameter("showCost", false));
  await expect.poll(async () => (await resolvedTable(page))?.columns.map((c: any) => c.id)).toEqual(["item", "amount"]);
});
