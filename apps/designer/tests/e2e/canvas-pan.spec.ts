import { test, expect, type Page } from "@playwright/test";

async function openZoomedReport(page: Page) {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate(() => {
    const store = (window as any).__designer.getState();
    store.loadDoc({ ...store.doc, id: "pan", sections: [{ type: "detail", children: [{ type: "text", id: "title", value: "Pan me", width: 200 }] }] });
    store.set({ fitToWidth: false, zoom: 3 });
  });
  const canvas = page.getByTestId("canvas");
  await expect(canvas).toContainText("Pan me");
  await expect.poll(() => canvas.evaluate((el) => el.scrollWidth > el.clientWidth && el.scrollHeight > el.clientHeight)).toBe(true);
  return canvas;
}

const scroll = (canvas: ReturnType<Page["getByTestId"]>) => canvas.evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
const docJson = (page: Page) => page.evaluate(() => JSON.stringify((window as any).__designer.getState().doc));

test("holding Space and dragging pans the canvas without selecting or moving anything", async ({ page }) => {
  const canvas = await openZoomedReport(page);
  const before = await docJson(page);
  const box = (await canvas.boundingBox())!;
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  await page.mouse.move(start.x, start.y);
  await page.keyboard.down("Space");
  await expect(canvas).toHaveClass(/pan-ready/);
  await page.mouse.down();
  await expect(canvas).toHaveClass(/panning/);
  await page.mouse.move(start.x - 200, start.y - 150, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  await expect(canvas).not.toHaveClass(/pan-ready|panning/);

  const after = await scroll(canvas);
  expect(after.left).toBeGreaterThan(190);
  expect(after.top).toBeGreaterThan(140);
  expect(await docJson(page)).toBe(before);
  expect(await page.evaluate(() => (window as any).__designer.getState().selection)).toEqual([]);

  // Dragging the other way pans back.
  await page.keyboard.down("Space");
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 200, start.y + 150, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  const back = await scroll(canvas);
  expect(back.left).toBeLessThan(after.left - 190);
  expect(back.top).toBeLessThan(after.top - 140);
});

test("a Space-drag that starts on a component pans instead of moving it", async ({ page }) => {
  const canvas = await openZoomedReport(page);
  const before = await docJson(page);
  const target = (await canvas.getByText("Pan me").boundingBox())!;
  const start = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.keyboard.down("Space");
  await page.mouse.down();
  await page.mouse.move(start.x - 150, start.y - 100, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Space");
  expect((await scroll(canvas)).left).toBeGreaterThan(140);
  expect(await docJson(page)).toBe(before);
  expect(await page.evaluate(() => (window as any).__designer.getState().selection)).toEqual([]);
});

test("the middle mouse button pans the canvas", async ({ page }) => {
  const canvas = await openZoomedReport(page);
  const before = await docJson(page);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2 - 90, { steps: 6 });
  await page.mouse.up({ button: "middle" });
  const after = await scroll(canvas);
  expect(after.left).toBeGreaterThan(110);
  expect(after.top).toBeGreaterThan(80);
  expect(await docJson(page)).toBe(before);
});

test("Space still types in text fields and activates focused buttons", async ({ page }) => {
  await openZoomedReport(page);
  const name = page.getByRole("textbox", { name: "Report name" });
  await name.fill("Quarterly");
  await name.press("Space");
  await name.type("sales");
  await expect(name).toHaveValue("Quarterly sales");

  const toggle = page.getByTestId("toggle-problems");
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("problems")).toBeVisible();
});
