import { expect, test, type Page } from "@playwright/test";

const state = (page: Page) => page.evaluate(() => (window as any).__designer.getState());

async function box(page: Page, id: string) {
  return page.evaluate((target) => {
    const visit = (nodes: any[]): any => {
      for (const node of nodes) {
        if (node.component?.id === target) return node.box;
        const child = visit(node.children ?? []);
        if (child) return child;
      }
      return null;
    };
    const p = (window as any).__designer.getState().engine.paginated.pages[0];
    return visit([...p.header, ...p.content, ...p.footer]);
  }, id);
}

test("a flow QR can be moved without shifting its neighbor; resizing a table updates its box and inspector", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate(() => {
    const s = (window as any).__designer.getState();
    s.loadDoc({ ...s.doc, id: "free-placement-browser", datasets: [{ id: "items-data", source: "inline", query: { data: [{ name: "Consultation" }] } }], sections: [{ type: "detail", children: [
      { id: "qr", type: "qrcode", value: "INV-100", width: 60, height: 60 },
      { id: "neighbor", type: "text", value: "Invoice total", width: 180 },
      { id: "items", type: "table", dataset: "items-data", width: 220, columns: [{ id: "name", header: "Item", binding: "row.name" }] },
      { id: "after", type: "text", value: "Thank you" },
    ] }] });
    s.set({ canvasView: "pages" });
  });
  await expect(page.locator('[data-cid="qr"]')).toBeVisible();
  await expect.poll(async () => (await state(page)).engine.paginationSource).toBe("pdf");
  const beforeNeighbor = await box(page, "neighbor");
  const beforeQr = await box(page, "qr");
  const source = (await page.locator('[data-cid="qr"]').boundingBox())!;
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2 + 80, source.y + source.height / 2 + 30, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await box(page, "qr")).x).toBeGreaterThan(beforeQr.x + 20);
  const movedQr = await box(page, "qr");
  expect(movedQr.x).toBeGreaterThan(beforeQr.x + 20);
  expect(movedQr.y).toBeGreaterThan(beforeQr.y + 5);
  expect(await box(page, "neighbor")).toMatchObject({ x: beforeNeighbor.x, y: beforeNeighbor.y });
  expect((await state(page)).doc.sections[0].children.find((c: any) => c.id === "qr")).toMatchObject({ width: 60, height: 60 });

  const secondSource = (await page.locator('[data-cid="qr"]').boundingBox())!;
  await page.mouse.move(secondSource.x + secondSource.width / 2, secondSource.y + secondSource.height / 2);
  await page.mouse.down();
  await page.mouse.move(secondSource.x + secondSource.width / 2 + 40, secondSource.y + secondSource.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await box(page, "qr")).x).toBeGreaterThan(movedQr.x + 10);
  expect(await box(page, "neighbor")).toMatchObject({ x: beforeNeighbor.x, y: beforeNeighbor.y });

  await page.locator('[data-cid="items"]').click();
  const tableBefore = await box(page, "items");
  const afterBefore = await box(page, "after");
  const handle = (await page.locator('.selbox .handle[data-handle="s"]').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + 100, { steps: 10 });
  const liveTable = (await page.locator('[data-cid="items"]').boundingBox())!;
  expect(liveTable.height).toBeGreaterThan(tableBefore.height + 30);
  await expect(page.getByTestId("selection-metrics")).toContainText(`H ${(liveTable.height / (72 / 25.4) / ((4 / 3) * (await state(page)).zoom)).toFixed(1)}`);
  expect((await state(page)).doc.sections[0].children.find((c: any) => c.id === "items").height).toBeUndefined();
  await page.mouse.up();
  await expect.poll(async () => (await box(page, "items")).height).toBeGreaterThan(tableBefore.height + 30);
  const tableAfter = await box(page, "items");
  expect(tableAfter.height).toBeGreaterThan(tableBefore.height + 30);
  expect((await box(page, "after")).y).toBeGreaterThan(afterBefore.y + 30);
  const storedHeight = (await state(page)).doc.sections[0].children.find((c: any) => c.id === "items").height;
  expect(storedHeight).toBeCloseTo(tableAfter.height, 0);
  await expect(page.getByTestId("properties").getByLabel("Height", { exact: true })).toHaveValue(String(storedHeight));
  await expect(page.getByTestId("selection-metrics")).toContainText(`H ${(tableAfter.height / (72 / 25.4)).toFixed(1)}`);

  const afterFlow = await box(page, "after");
  const tableSource = (await page.locator('[data-cid="items"]').boundingBox())!;
  await page.mouse.move(tableSource.x + tableSource.width / 2, tableSource.y + 12);
  await page.mouse.down();
  await page.mouse.move(tableSource.x + tableSource.width / 2 + 75, tableSource.y + 12, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await box(page, "items")).x).toBeGreaterThan(tableAfter.x + 20);
  expect(await box(page, "after")).toEqual(afterFlow);
  await expect.poll(async () => (await state(page)).engine.paginationSource).toBe("pdf");
  expect((await box(page, "items")).x).toBeGreaterThan(tableAfter.x + 20);
});

test("the invoice QR follows a drag to the middle of the page", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-invoice").click();
  await page.evaluate(() => (window as any).__designer.getState().set({ canvasView: "pages" }));
  const qr = page.locator('[data-cid="pay-qr"]');
  await expect(qr).toBeVisible();
  const before = (await qr.boundingBox())!;
  const sheet = (await page.getByTestId("page-1").boundingBox())!;
  const target = { x: sheet.x + sheet.width / 2, y: sheet.y + sheet.height / 2 };
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  const preview = (await page.getByTestId("drag-preview").boundingBox())!;
  expect(Math.hypot(preview.x + preview.width / 2 - target.x, preview.y + preview.height / 2 - target.y)).toBeLessThan(25);
  const liveQr = (await qr.boundingBox())!;
  expect(Math.hypot(liveQr.x + liveQr.width / 2 - target.x, liveQr.y + liveQr.height / 2 - target.y)).toBeLessThan(25);
  await page.mouse.up();
  await expect.poll(async () => {
    const b = (await qr.boundingBox())!;
    return Math.hypot(b.x + b.width / 2 - target.x, b.y + b.height / 2 - target.y);
  }).toBeLessThan(25);
  const moved = (await state(page)).doc.sections.flatMap((s: any) => JSON.stringify(s.children)).join("");
  expect(moved).toContain('"id":"pay-qr"');
});

test("dropping a new QR at a chosen location undoes in one step", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  const sheet = page.getByTestId("page-1");
  const bounds = (await sheet.boundingBox())!;
  await page.getByTestId("palette-qr-code").dragTo(sheet, { targetPosition: { x: bounds.width / 2, y: bounds.height / 2 } });
  await expect(page.locator('[data-cid^="qrcode-"]')).toBeVisible();
  const inserted = (await state(page)).doc.sections[0].children;
  expect(inserted).toHaveLength(1);
  expect(inserted[0]).toMatchObject({ type: "qrcode", x: expect.any(Number), y: expect.any(Number) });
  await page.getByTestId("btn-undo").click();
  expect((await state(page)).doc.sections[0].children).toHaveLength(0);
});

test("canvas updates from local layout while PDF analysis is delayed", async ({ page }) => {
  await page.route("**/api/v1/analyze", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate(() => {
    const s = (window as any).__designer.getState();
    s.loadDoc({ ...s.doc, sections: [{ type: "detail", children: [{ id: "qr", type: "qrcode", value: "test", width: 60, height: 60 }] }] });
    s.set({ canvasView: "pages" });
  });
  await expect(page.locator('[data-cid="qr"]')).toBeVisible();
  const before = await box(page, "qr");
  await page.evaluate(() => (window as any).__designer.getState().patch("qr", { x: 100, y: 100 }));
  await expect.poll(async () => (await box(page, "qr")).x).toBeGreaterThan(before.x + 50);
  expect((await state(page)).engine.paginationSource).toBe("estimate");
});

test("a QR visibly grows while its resize handle is held", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-invoice").click();
  await page.evaluate(() => (window as any).__designer.getState().set({ canvasView: "pages" }));
  await page.locator('[data-cid="pay-qr"]').click();
  const qr = page.locator('[data-cid="pay-qr"]');
  const before = (await qr.boundingBox())!;
  const handle = (await page.locator('.selbox .handle[data-handle="se"]').boundingBox())!;
  const originalWidth = await page.evaluate(() => {
    const walk = (children: any[]): any => children.flatMap((c) => [c, ...walk(c.children ?? [])]);
    return walk((window as any).__designer.getState().doc.sections.flatMap((s: any) => s.children)).find((c: any) => c.id === "pay-qr").width;
  });
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 70, handle.y + handle.height / 2 + 50, { steps: 10 });
  const live = (await qr.boundingBox())!;
  expect(live.width).toBeGreaterThan(before.width + 40);
  expect(live.height).toBeGreaterThan(before.height + 25);
  expect(await page.getByTestId("selection-metrics").innerText()).toContain("W ");
  expect(await page.evaluate(() => {
    const walk = (children: any[]): any => children.flatMap((c) => [c, ...walk(c.children ?? [])]);
    return walk((window as any).__designer.getState().doc.sections.flatMap((s: any) => s.children)).find((c: any) => c.id === "pay-qr").width;
  })).toBe(originalWidth);
  await page.mouse.up();
  await expect.poll(async () => (await qr.boundingBox())!.width).toBeGreaterThan(before.width + 40);
});
