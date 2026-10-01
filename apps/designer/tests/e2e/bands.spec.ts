import { test, expect, type Page } from "@playwright/test";

const doc = (page: Page) => page.evaluate(() => (window as any).__designer.getState().doc);

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
  expect(guides[0].axis).toBe("y");
  await page.getByTestId(`guide-${guides[0].id}`).locator("xpath=..").locator(".guide-hit").dblclick({ force: true });
  expect((await doc(page)).guides).toHaveLength(0);
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
  await page.getByTestId("ruler-unit").selectOption("in");
  await expect(page.getByTestId("ruler-h")).toContainText("1");
  expect(await page.evaluate(() => localStorage.getItem("designer.rulerUnit"))).toBe("in");
});

test("switching to Pages shows the paginated result", async ({ page }) => {
  await page.getByTestId("view-pages").click();
  await expect(page.locator("[data-testid^=band-tab-]")).toHaveCount(0);
  await expect(page.getByTestId("page-1")).toBeVisible();
});
