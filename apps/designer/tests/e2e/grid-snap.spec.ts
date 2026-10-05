import { test, expect, type Page } from "@playwright/test";

const MM = 72 / 25.4;

async function open(page: Page) {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate(() => {
    const store = (window as any).__designer.getState();
    store.loadDoc({
      ...store.doc, id: "grid-snap",
      // 20 mm margins are deliberately not a multiple of the old 5 pt step.
      page: { ...store.doc.page, margin: { top: 20, right: 20, bottom: 20, left: 20 }, unit: "mm" },
      sections: [{ type: "detail", layout: "absolute", height: 400, children: [
        { id: "left", type: "text", value: "Left", x: 100, y: 100, width: 30, height: 20 },
        { id: "right", type: "text", value: "Right", x: 200, y: 100, width: 30, height: 20 },
        { id: "moving", type: "text", value: "Move", x: 300, y: 100, width: 30, height: 20 },
      ] }],
    });
  });
  await expect(page.locator('.cn-text[data-cid="moving"]')).toBeVisible();
}

async function openOptions(page: Page) {
  const options = page.getByTestId("canvas-options");
  if (!(await options.evaluate((el) => (el as HTMLDetailsElement).open))) await options.locator("summary").click();
}

async function setTargets(page: Page, on: Record<string, boolean>) {
  for (const [key, value] of Object.entries(on)) await page.getByTestId(`snap-${key}`).setChecked(value);
}

/** Page-coordinate box of a component from the engine's paginated output. */
const pageBox = (page: Page, id: string) => page.evaluate((id) => {
  const found: any[] = [];
  const walk = (nodes: any[]) => nodes.forEach((n) => { if (n.component?.id === id) found.push(n.box); walk(n.children ?? []); });
  const p = (window as any).__designer.getState().engine.paginated.pages[0];
  walk([...p.header, ...p.content, ...p.footer]);
  return found[0];
}, id);

async function drag(page: Page, id: string, dxPx: number, dyPx: number, handle?: string) {
  const target = handle ? page.locator(`.handle[data-handle="${handle}"]`).first() : page.locator(`.cn-text[data-cid="${id}"]`);
  if (handle) await page.locator(`.cn-text[data-cid="${id}"]`).click();
  const b = (await target.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + dxPx, b.y + b.height / 2 + dyPx, { steps: 10 });
  await page.mouse.up();
}

const onStep = (pt: number, stepMm: number) => {
  const r = (pt / MM) % stepMm;
  return Math.min(r, stepMm - r);
};

test("grid spacing and subdivisions in mm snap moved and resized edges onto page grid lines and persist", async ({ page }) => {
  await open(page);
  await openOptions(page);
  await page.getByTestId("ruler-unit").selectOption("mm");
  await page.getByTestId("grid-mode").selectOption("lines");
  await page.getByTestId("grid-spacing").fill("10");
  await page.getByTestId("grid-spacing").press("Enter");
  await page.getByTestId("grid-subdivisions").selectOption("2");
  await expect(page.getByTestId("grid-step")).toHaveText("Snaps every 5 mm");
  await setTargets(page, { objects: false, bounds: false, guides: false, spacing: false, baseline: false });

  const k = await page.evaluate(() => (4 / 3) * (window as any).__designer.getState().zoom);
  const pageEl = page.locator(".page").first();
  expect(parseFloat(await pageEl.evaluate((el) => getComputedStyle(el).getPropertyValue("--grid-major")))).toBeCloseTo(10 * MM * k, 1);
  expect(parseFloat(await pageEl.evaluate((el) => getComputedStyle(el).getPropertyValue("--grid-minor")))).toBeCloseTo(5 * MM * k, 1);

  await drag(page, "moving", -37 * k, 23 * k);
  await expect.poll(async () => onStep((await pageBox(page, "moving")).x, 5)).toBeLessThan(0.01);
  expect(onStep((await pageBox(page, "moving")).y, 5)).toBeLessThan(0.01);

  await drag(page, "moving", 31 * k, 17 * k, "se");
  await expect.poll(async () => { const b = await pageBox(page, "moving"); return onStep(b.x + b.width, 5); }).toBeLessThan(0.01);
  const resized = await pageBox(page, "moving");
  expect(onStep(resized.y + resized.height, 5)).toBeLessThan(0.01);

  await page.reload();
  await page.waitForFunction(() => (window as any).__designer);
  expect(await page.evaluate(() => { const s = (window as any).__designer.getState(); return { grid: s.grid, targets: s.snapTargets }; })).toMatchObject({
    grid: { subdivisions: 2 }, targets: { grid: true, objects: false, bounds: false, guides: false, spacing: false, baseline: false },
  });
  const resume = page.getByRole("button", { name: /Continue Untitled report/ });
  if (await resume.isVisible()) await resume.click();
  else if (await page.getByTestId("starter-blank").isVisible()) await page.getByTestId("starter-blank").click();
  await expect(page.getByTestId("canvas-options")).toBeVisible();
  await openOptions(page);
  await expect(page.getByTestId("grid-spacing")).toHaveValue("10");
  await expect(page.getByTestId("grid-subdivisions")).toHaveValue("2");
  await expect(page.getByTestId("snap-objects")).not.toBeChecked();
  await expect(page.getByTestId("snap-grid")).toBeChecked();
});

test("each snap target can be switched off on its own", async ({ page }) => {
  await open(page);
  await openOptions(page);
  const k = await page.evaluate(() => (4 / 3) * (window as any).__designer.getState().zoom);
  const x = () => page.evaluate(() => (window as any).__designer.getState().doc.sections[0].children.find((c: any) => c.id === "moving").x);

  // Equal spacing on: lands exactly between the pair (x = 150).
  await drag(page, "moving", -148 * k, 0);
  await expect.poll(x).toBe(150);
  await page.evaluate(() => (window as any).__designer.getState().patch("moving", { x: 300, y: 100 }));

  // Equal spacing off, everything else on: no equal-gap guide, and it does not land on 150.
  await setTargets(page, { spacing: false });
  const b = (await page.locator('.cn-text[data-cid="moving"]').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 - 148 * k, b.y + b.height / 2, { steps: 10 });
  await expect(page.getByTestId("equal-gap-guide")).toHaveCount(0);
  await page.mouse.up();
  expect(await x()).not.toBe(150);
  await page.evaluate(() => (window as any).__designer.getState().patch("moving", { x: 300, y: 100 }));

  // Grid off and every object target off: the drop is free (0.1 pt precision), not on a 5 pt step.
  await setTargets(page, { grid: false, objects: false, bounds: false, guides: false, baseline: false });
  await drag(page, "moving", -37.3 * k, 0);
  await expect.poll(async () => Math.abs((await x()) - 262.7)).toBeLessThan(1.5);
  expect((await x()) % 5).not.toBe(0);
});
