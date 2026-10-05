import { expect, test, type Page } from "@playwright/test";

const state = (page: Page) => page.evaluate(() => (window as any).__designer.getState());
const comp = async (page: Page, id: string) => page.evaluate((target) => {
  const visit = (list: any[]): any => {
    for (const c of list) {
      if (c.id === target) return c;
      const hit = visit(c.children ?? []);
      if (hit) return hit;
    }
    return null;
  };
  return visit((window as any).__designer.getState().doc.sections.flatMap((s: any) => s.children ?? []));
}, id);
const order = async (page: Page, parent: string) => ((await comp(page, parent)).children as any[]).map((c) => c.id);
const selection = async (page: Page) => (await state(page)).selection as string[];

async function freeLayout(page: Page) {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate(() => {
    const s = (window as any).__designer.getState();
    s.loadDoc({ ...s.doc, id: "canvas-keyboard", sections: [{ type: "detail", children: [
      { id: "box", type: "container", layout: "absolute", height: 200, children: [
        { id: "a", type: "text", text: "Alpha", x: 10, y: 10, width: 60, height: 14 },
        { id: "b", type: "text", text: "Bravo", x: 90, y: 40, width: 60, height: 14 },
        { id: "c", type: "text", text: "Charlie", x: 170, y: 70, width: 60, height: 14 },
      ] },
      { id: "after", type: "text", text: "After the box" },
    ] }] });
    s.set({ canvasView: "pages", snap: false });
  });
  await expect(page.locator('[data-cid="c"]')).toBeVisible();
  await expect.poll(async () => (await state(page)).engine.paginationSource).toBe("pdf");
}

test.describe("canvas keyboard model", () => {
  test("arrow keys move the selection in the same frame, before layout finishes", async ({ page }) => {
    await freeLayout(page);
    await page.locator('[data-cid="a"]').click();
    const shift = await page.evaluate(async () => {
      const left = () => document.querySelector('[data-cid="a"]')!.getBoundingClientRect().left;
      const before = left();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", code: "ArrowRight", shiftKey: true, bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return left() - before;
    });
    // 10 pt at the current zoom, well inside the 60 ms layout debounce.
    expect(shift).toBeGreaterThan(5);
    await expect.poll(async () => (await comp(page, "a")).x).toBe(20);
  });

  test("Tab, Enter and Shift+Enter walk the element tree", async ({ page }) => {
    await freeLayout(page);
    await page.locator('[data-cid="a"]').click();
    await page.keyboard.press("Tab");
    expect(await selection(page)).toEqual(["b"]);
    await page.keyboard.press("Tab");
    expect(await selection(page)).toEqual(["c"]);
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    expect(await selection(page)).toEqual(["c"]);
    // At the last element Tab is left to the browser, so focus can move on: no keyboard trap.
    const trapped = await page.evaluate(() => {
      const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(trapped).toBe(false);
    await page.keyboard.press("Shift+Enter");
    expect(await selection(page)).toEqual(["box"]);
    await page.keyboard.press("ControlOrMeta+a");
    expect(await selection(page)).toEqual(["box", "after"]);
    await page.evaluate(() => (window as any).__designer.getState().select(["box"]));
    await page.keyboard.press("Enter");
    expect(await selection(page)).toEqual(["a", "b", "c"]);
  });

  test("Enter on plain text starts editing it", async ({ page }) => {
    await freeLayout(page);
    await page.locator('[data-cid="b"]').click();
    await page.keyboard.press("Enter");
    expect((await state(page)).editingText).toBe("b");
  });

  test("align, distribute, order and resize from the keyboard", async ({ page }) => {
    await freeLayout(page);
    await page.evaluate(() => (window as any).__designer.getState().select(["a", "b", "c"]));
    await page.keyboard.press("Alt+KeyA");
    await expect.poll(async () => [(await comp(page, "b")).x, (await comp(page, "c")).x]).toEqual([10, 10]);
    await page.keyboard.press("Alt+KeyW");
    await expect.poll(async () => (await comp(page, "c")).y).toBe(10);

    await page.evaluate(() => (window as any).__designer.getState().select(["a"]));
    await page.keyboard.press("ControlOrMeta+BracketRight");
    expect(await order(page, "box")).toEqual(["b", "a", "c"]);
    await page.keyboard.press("ControlOrMeta+Alt+BracketRight");
    expect(await order(page, "box")).toEqual(["b", "c", "a"]);
    await page.keyboard.press("ControlOrMeta+Alt+BracketLeft");
    expect(await order(page, "box")).toEqual(["a", "b", "c"]);

    await page.keyboard.press("ControlOrMeta+Shift+ArrowRight");
    await page.keyboard.press("ControlOrMeta+ArrowDown");
    expect(await comp(page, "a")).toMatchObject({ width: 70, height: 15 });
  });

  test("aligning a single element explains what it needs", async ({ page }) => {
    await freeLayout(page);
    await page.locator('[data-cid="a"]').click();
    await page.keyboard.press("Alt+KeyA");
    await expect(page.getByText("Select two or more free-positioned elements")).toBeVisible();
  });
});

test.describe("canvas zoom", () => {
  test("keyboard zoom steps through presets, and Shift+0 returns to 100%", async ({ page }) => {
    await freeLayout(page);
    await page.evaluate(() => (window as any).__designer.getState().set({ zoom: 1, fitToWidth: false }));
    await page.keyboard.press("ControlOrMeta+Equal");
    await expect(page.getByTestId("zoom-label")).toHaveText("125%");
    await page.keyboard.press("ControlOrMeta+Minus");
    await page.keyboard.press("ControlOrMeta+Minus");
    await expect(page.getByTestId("zoom-label")).toHaveText("75%");
    await page.keyboard.press("Shift+Digit0");
    await expect(page.getByTestId("zoom-label")).toHaveText("100%");
  });

  test("Ctrl + wheel zooms around the cursor", async ({ page }) => {
    await freeLayout(page);
    const target = page.locator('[data-cid="b"]');
    const before = (await target.boundingBox())!;
    const point = { x: before.x + 4, y: before.y + 4 };
    await page.mouse.move(point.x, point.y);
    await page.keyboard.down("Control");
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -40);
    await page.keyboard.up("Control");
    await expect.poll(async () => (await target.boundingBox())!.width).toBeGreaterThan(before.width * 1.5);
    const after = (await target.boundingBox())!;
    const scale = after.width / before.width;
    expect(Math.abs(after.x + 4 * scale - point.x)).toBeLessThan(3);
    expect(Math.abs(after.y + 4 * scale - point.y)).toBeLessThan(3);
  });
});

test("? opens a searchable shortcut sheet, and the palette shows shortcuts", async ({ page }) => {
  await freeLayout(page);
  await page.keyboard.press("Shift+Slash");
  const sheet = page.getByTestId("shortcut-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Bring to front")).toBeVisible();
  await sheet.getByLabel("Search shortcuts").fill("zoom");
  await expect(sheet.getByText("Bring to front")).toHaveCount(0);
  await expect(sheet.getByText("Zoom to selection")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+k");
  await page.getByTestId("palette-input").fill("zoom in");
  await expect(page.locator(".palette-list li.active kbd")).toHaveText(/⌘=|Ctrl\+=/);
});

test.describe("drag modifiers", () => {
  async function dragBy(page: Page, selector: string, dx: number, dy: number, modifiers: string[] = []) {
    const source = (await page.locator(selector).boundingBox())!;
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    for (const key of modifiers) await page.keyboard.down(key);
    await page.mouse.move(source.x + source.width / 2 + dx, source.y + source.height / 2 + dy, { steps: 8 });
    await page.mouse.up();
    for (const key of modifiers) await page.keyboard.up(key);
  }

  test("Shift locks a move to one axis, and Alt-drag leaves a copy behind", async ({ page }) => {
    await freeLayout(page);
    await dragBy(page, '[data-cid="b"]', 90, 12, ["Shift"]);
    await expect.poll(async () => (await comp(page, "b")).y).toBe(40);
    expect((await comp(page, "b")).x).toBeGreaterThan(110);

    await dragBy(page, '[data-cid="a"]', 0, 60, ["Alt"]);
    await expect.poll(async () => (await comp(page, "box")).children.length).toBe(4);
    expect(await comp(page, "a")).toMatchObject({ x: 10, y: 10 });
  });

  test("Shift-resize keeps proportions and Alt-resize grows from the centre", async ({ page }) => {
    await freeLayout(page);
    await page.locator('[data-cid="b"]').click();
    const k = await page.evaluate(() => (4 / 3) * (window as any).__designer.getState().zoom);
    await dragBy(page, '.selbox .handle[data-handle="se"]', 60 * k, 0, ["Shift"]);
    await expect.poll(async () => (await comp(page, "b")).width).toBe(120);
    expect((await comp(page, "b")).height).toBe(28);

    await page.evaluate(() => (window as any).__designer.getState().patch("b", { x: 90, y: 40, width: 60, height: 14 }));
    await expect.poll(async () => Math.round((await page.locator(".selbox").boundingBox())!.width)).toBe(Math.round(60 * k));
    await dragBy(page, '.selbox .handle[data-handle="e"]', 10 * k, 0, ["Alt"]);
    await expect.poll(async () => (await comp(page, "b")).width).toBe(80);
    expect((await comp(page, "b")).x).toBe(80);
  });
});

test("holding Alt measures the gap from the selection to the hovered element", async ({ page }) => {
  await freeLayout(page);
  await page.locator('[data-cid="a"]').click();
  const b = (await page.locator('[data-cid="b"]').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.getByTestId("measure-overlay")).toHaveCount(0);
  await page.keyboard.down("Alt");
  await page.mouse.move(b.x + b.width / 2 + 1, b.y + b.height / 2);
  // a ends at x=70 and b starts at x=90: 20 pt is 7.1 mm; a's bottom (24) to b's top (40) is 16 pt, 5.6 mm.
  await expect(page.getByTestId("measure-overlay")).toContainText("7.1 mm");
  await expect(page.getByTestId("measure-overlay")).toContainText("5.6 mm");
  await page.keyboard.up("Alt");
  await expect(page.getByTestId("measure-overlay")).toHaveCount(0);
});

test("deleting crumbles the element away and offers Undo", async ({ page }) => {
  await freeLayout(page);
  await page.locator('[data-cid="b"]').click();
  await page.keyboard.press("Delete");
  await expect(page.locator(".dust-layer")).toHaveCount(1);
  await expect(page.locator('[data-cid="b"]')).toHaveCount(0);
  await expect(page.locator(".dust-layer")).toHaveCount(0, { timeout: 3000 });
  await page.getByTestId("toast-action").click();
  await expect(page.locator('[data-cid="b"]')).toBeVisible();
});

test("the delete effect is skipped for people who prefer reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await freeLayout(page);
  await page.locator('[data-cid="b"]').click();
  await page.keyboard.press("Delete");
  await expect(page.locator('[data-cid="b"]')).toHaveCount(0);
  await expect(page.locator(".dust-layer")).toHaveCount(0);
});
