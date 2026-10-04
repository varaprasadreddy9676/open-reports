import { test, expect, type Page } from "@playwright/test";

const doc = (page: Page) => page.evaluate(() => (window as any).__designer.getState().doc);
const comp = (page: Page, id: string) => page.evaluate((id) => {
  const find = (list: any[]): any[] => list.flatMap((c) => [c, ...find(c.children ?? [])]);
  return find((window as any).__designer.getState().doc.sections.flatMap((s: any) => s.children)).find((c: any) => c.id === id);
}, id);
const nodes = (page: Page) => page.evaluate(() => {
  const out: any[] = [];
  const walk = (list: any[]) => list.forEach((n) => { out.push({ id: n.component.id, text: n.component.text, box: n.box }); walk(n.children ?? []); });
  for (const p of (window as any).__designer.getState().engine.paginated?.pages ?? []) walk(p.content);
  return out;
});

async function load(page: Page, definition: Record<string, unknown>) {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate((definition) => {
    const store = (window as any).__designer.getState();
    store.loadDoc({ ...store.doc, ...definition });
  }, definition);
}

test("text can sit in the middle of its box and boxes can have rounded corners", async ({ page }) => {
  await load(page, { id: "box-style", sections: [{ type: "detail", children: [{ type: "text", id: "badge", value: "PAID", height: 60, style: { background: "#dcfce7" } }] }] });
  await page.evaluate(() => (window as any).__designer.getState().select(["badge"]));
  await page.getByTestId("element-tab-style").click();
  await page.getByTestId("vertical-align").selectOption("middle");
  await page.getByLabel("Corner radius").fill("6");
  await page.getByLabel("Corner radius").blur();
  expect((await comp(page, "badge")).style).toMatchObject({ verticalAlign: "middle", borderRadius: 6 });
  const text = page.locator('[data-cid="badge"]');
  await expect(text).toHaveCSS("border-top-left-radius", /px$/);
  await expect.poll(() => text.evaluate((el) => parseFloat(getComputedStyle(el).paddingTop))).toBeGreaterThan(20);
});

test("the report time zone is chosen in report details", async ({ page }) => {
  await load(page, { id: "tz", sections: [{ type: "detail", children: [{ type: "field", id: "when", expression: "\"2025-01-15T22:30:00Z\"", format: "date:yyyy-MM-dd HH:mm" }] }] });
  await page.locator('[data-page="0"]').click({ position: { x: 8, y: 8 } });
  await page.getByTestId("report-tab-details").click();
  await page.getByText("Locale & theme").click();
  await page.getByLabel("Time zone").fill("Asia/Kolkata");
  await expect.poll(async () => (await nodes(page)).find((n) => n.id === "when")?.text).toBe("2025-01-16 04:00");
  expect((await doc(page)).theme.timezone).toBe("Asia/Kolkata");
});

test("a running total restarts per group from the variables panel", async ({ page }) => {
  await load(page, {
    id: "running",
    datasets: [{ id: "sales", source: "inline", query: { data: [{ region: "East", amount: 10 }, { region: "East", amount: 5 }, { region: "West", amount: 7 }] } }],
    groups: [{ id: "byRegion", dataset: "sales", by: "row.region" }],
    variables: [{ id: "running", scope: "row", expression: "(vars.running ?? 0) + row.amount" }],
    sections: [{ type: "detail", dataset: "sales", children: [{ type: "text", id: "line", expression: "row.region + \" \" + vars.running" }] }],
  });
  await page.getByTestId("left-tab-data").click();
  await page.getByLabel("Reset on").selectOption("byRegion");
  expect((await doc(page)).variables[0].resetOn).toBe("byRegion");
  await page.getByLabel("Scope").first().selectOption("report");
  expect((await doc(page)).variables[0].resetOn).toBeUndefined();
});

test("repeater items can be laid out side by side or in a grid", async ({ page }) => {
  await load(page, {
    id: "cards",
    datasets: [{ id: "people", source: "inline", query: { data: [{ n: "Ann" }, { n: "Bob" }, { n: "Cy" }] } }],
    sections: [{ type: "detail", children: [{ type: "repeater", id: "list", dataset: "people", children: [{ type: "text", binding: "row.n" }] }] }],
  });
  await page.evaluate(() => (window as any).__designer.getState().select(["list"]));
  await page.getByTestId("element-tab-layout").click();
  await page.getByTestId("repeater-item-layout").selectOption("grid");
  expect(await comp(page, "list")).toMatchObject({ itemLayout: "grid", columns: 2 });
  await expect.poll(async () => {
    const texts = (await nodes(page)).filter((n) => ["Ann", "Bob", "Cy"].includes(n.text));
    return texts.length === 3 && texts[0].box.y === texts[1].box.y && texts[2].box.y > texts[0].box.y;
  }).toBe(true);
  await page.getByTestId("repeater-item-layout").selectOption("flow");
  expect((await comp(page, "list")).itemLayout).toBeUndefined();
});

test("table rows can be allowed to break across pages", async ({ page }) => {
  const note = Array.from({ length: 120 }, (_, i) => `line ${i}`).join("\n");
  await load(page, {
    id: "split",
    datasets: [{ id: "notes", source: "inline", query: { data: [{ note }] } }],
    sections: [{ type: "detail", children: [{ type: "table", id: "notes", dataset: "notes", columns: [{ id: "note", header: "Note", binding: "row.note" }] }] }],
  });
  await page.evaluate(() => (window as any).__designer.getState().set({ tableEditId: "notes" }));
  await page.getByTestId("table-tab-pagination").click();
  await page.getByLabel("Allow rows to break across pages").check();
  expect((await comp(page, "notes")).allowRowSplit).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__designer.getState().engine.paginated?.pages.length ?? 0)).toBeGreaterThan(1);
});
