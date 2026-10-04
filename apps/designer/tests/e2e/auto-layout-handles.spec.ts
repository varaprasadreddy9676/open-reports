import { test, expect, type Page } from "@playwright/test";

const comp = (page: Page, id: string) => page.evaluate((id) => {
  const find = (list: any[]): any => list.flatMap((c) => [c, ...find(c.children ?? [])]);
  return find((window as any).__designer.getState().doc.sections.flatMap((s: any) => s.children)).find((c: any) => c.id === id);
}, id);

async function dragBy(page: Page, testId: string, dx: number, dy: number, modifiers: { shift?: boolean } = {}) {
  const handle = page.getByTestId(testId);
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  if (modifiers.shift) await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 });
  return async () => { await page.mouse.up(); if (modifiers.shift) await page.keyboard.up("Shift"); };
}

test("gap and padding are set by dragging on the canvas, each drag undoes in one step", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate(() => {
    const store = (window as any).__designer.getState();
    store.loadDoc({ ...store.doc, id: "auto-layout", sections: [{ type: "detail", children: [
      { type: "row", id: "toolbar", gap: 8, style: { padding: 4 }, children: [
        { type: "text", id: "a", value: "Alpha", width: 80 }, { type: "text", id: "b", value: "Beta", width: 80 }, { type: "text", id: "c", value: "Gamma" },
      ] },
    ] }] });
    store.set({ fitToWidth: false, zoom: 1.5 });
    store.select(["toolbar"]);
  });
  const k = await page.evaluate(() => (4 / 3) * (window as any).__designer.getState().zoom);
  await expect(page.getByTestId("gap-handle-0")).toBeVisible();
  await expect(page.getByTestId("gap-handle-1")).toBeVisible();

  const releaseGap = await dragBy(page, "gap-handle-0", 12 * k, 0);
  await expect(page.getByTestId("al-label")).toContainText("gap");
  await releaseGap();
  expect((await comp(page, "toolbar")).gap).toBe(20);
  await expect.poll(() => page.evaluate(() => {
    const nodes: any[] = [];
    const walk = (list: any[]) => list.forEach((n) => { nodes.push(n); walk(n.children ?? []); });
    walk((window as any).__designer.getState().engine.paginated.pages[0].content);
    const a = nodes.find((n) => n.component.id === "a").box;
    const b = nodes.find((n) => n.component.id === "b").box;
    return Math.round(b.x - (a.x + a.width));
  })).toBe(20);

  const releaseLeft = await dragBy(page, "padding-handle-left", 6 * k, 0);
  await releaseLeft();
  expect((await comp(page, "toolbar")).style.padding).toEqual({ top: 4, right: 4, bottom: 4, left: 10 });

  const releaseAll = await dragBy(page, "padding-handle-top", 0, 4 * k, { shift: true });
  await releaseAll();
  expect((await comp(page, "toolbar")).style.padding).toBe(8);

  await page.keyboard.press(process.platform === "darwin" ? "Meta+Z" : "Control+Z");
  expect((await comp(page, "toolbar")).style.padding).toEqual({ top: 4, right: 4, bottom: 4, left: 10 });
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Z" : "Control+Z");
  expect((await comp(page, "toolbar")).style.padding).toBe(4);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Z" : "Control+Z");
  expect((await comp(page, "toolbar")).gap).toBe(8);
});

test("double-clicking the right handle of a text in a row makes it hug its text", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate(() => {
    const store = (window as any).__designer.getState();
    store.loadDoc({ ...store.doc, id: "hug", sections: [{ type: "detail", children: [
      { type: "row", id: "line", children: [{ type: "text", id: "label", value: "Label", width: 150 }, { type: "text", id: "value", value: "Value" }] },
    ] }] });
    store.select(["label"]);
  });
  await page.locator(".handle.e").dblclick();
  expect((await comp(page, "label")).width).toBe("auto");
});
