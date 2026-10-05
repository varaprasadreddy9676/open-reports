import { expect, test } from "@playwright/test";

test("a first visitor can choose appearance and follow the invoice preview path", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "light");
  await page.getByTestId("home-appearance").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-ui-theme", "dark");
  await page.reload();
  await expect(page.getByTestId("home-appearance")).toHaveValue("dark");
  await page.getByTestId("home-appearance").selectOption("light");

  await page.getByTestId("home-try-invoice").click();
  await expect(page.getByTestId("getting-started")).toContainText("Try one edit");
  await page.getByTestId("layer-company").click();
  await page.getByTestId("value-text").fill("MY INVOICE DEMO");
  await expect(page.getByTestId("getting-started")).toContainText("See the printable result");
  await page.getByTestId("getting-started").getByRole("button", { name: /Preview PDF/ }).click();
  await expect(page.getByTestId("pdf-info")).toContainText("page");
  await expect(page.getByTestId("preview-tab-zpl")).toHaveCount(0);
  await expect(page.getByTestId("preview-tab-escpos")).toHaveCount(0);
});

test("a local edit is protected when opening a different starter", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.getByTestId("palette-text").click();
  await page.getByRole("button", { name: "Home" }).click();
  await page.getByTestId("home-try-invoice").click();
  await expect(page.getByRole("dialog", { name: "Unsaved changes" })).toBeVisible();
  await page.getByTestId("replace-cancel").click();
  await expect(page.getByTestId("home-screen")).toBeVisible();
  await page.getByTestId("home-try-invoice").click();
  await page.getByTestId("replace-confirm").click();
  await expect(page.getByTestId("getting-started")).toContainText("Try one edit");
});

test("an empty table leads to a valid dataset and generated columns", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await expect(page.getByTestId("getting-started")).toContainText("Start on the page");
  await page.getByTestId("palette-table").click();
  await expect(page.getByTestId("getting-started")).toContainText("Connect table data");
  await page.getByTestId("canvas-create-dataset").click();
  await page.getByTestId("dataset-json").fill("{bad");
  await expect(page.getByTestId("dataset-json-error")).toBeVisible();
  await expect(page.getByTestId("dataset-save")).toBeDisabled();
  await page.getByTestId("dataset-json").fill('[{"item":"Consultation","amount":120}]');
  await page.getByTestId("dataset-save").click();
  await page.getByTestId("canvas-table-data").selectOption("dataset1");
  await expect(page.getByTestId("canvas")).toContainText("Consultation");
});

test("a table dropped halfway across a page stays within the printable width", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  const sheet = page.getByTestId("page-1");
  const bounds = (await sheet.boundingBox())!;
  await page.getByTestId("palette-table").dragTo(sheet, { targetPosition: { x: bounds.width / 2, y: bounds.height / 3 } });
  await expect.poll(async () => {
    return page.evaluate(() => {
      const s = (window as any).__designer.getState();
      const p = s.engine.paginated;
      const findTable = (nodes: any[]): any => nodes.flatMap((node: any) => [node, ...findTable(node.children ?? [])]);
      const table = findTable(p.pages[0].content).find((node: any) => node.component.type === "table");
      return table ? table.box.x + table.box.width - (p.pageSize.width - p.margin.right) : Infinity;
    });
  }).toBeLessThanOrEqual(0.5);
});

test("an off-page element reports a printable-width error", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate(() => {
    const s = (window as any).__designer.getState();
    s.loadDoc({ ...s.doc, sections: [{ type: "detail", children: [{ id: "outside", type: "text", value: "Outside", x: 450, width: 150 }] }] });
  });
  await expect.poll(async () => (await page.evaluate(() => (window as any).__designer.getState().engine.problems)).some((p: any) => p.code === "OUTSIDE_PRINTABLE_WIDTH")).toBe(true);
});

test("phone visitors can view examples and a sample without entering the cramped designer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByTestId("starter-invoice").click();
  await expect(page.getByTestId("mobile-designer-gate")).toBeVisible();
  await expect(page.getByTestId("mobile-designer-gate").getByRole("link", { name: /sample invoice PDF/ })).toHaveAttribute("href", "/sample-invoice.pdf");
  expect((await page.request.get("/sample-invoice.pdf")).ok()).toBe(true);
  await page.getByRole("button", { name: /Back to examples/ }).click();
  await expect(page.getByTestId("home-screen")).toBeVisible();
});

test("a table dropped near the right edge keeps a usable width and moves left instead of shrinking", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  const sheet = page.getByTestId("page-1");
  const bounds = (await sheet.boundingBox())!;
  await page.getByTestId("palette-table").dragTo(sheet, { targetPosition: { x: bounds.width * 0.9, y: bounds.height / 3 } });
  await expect.poll(async () => page.evaluate(() => {
    const p = (window as any).__designer.getState().engine.paginated;
    const all = (nodes: any[]): any[] => nodes.flatMap((node: any) => [node, ...all(node.children ?? [])]);
    const table = all(p.pages[0].content).find((node: any) => node.component.type === "table");
    const right = p.pageSize.width - p.margin.right;
    return table ? { width: Math.round(table.box.width), inside: table.box.x + table.box.width <= right + 0.5 } : null;
  })).toEqual({ width: expect.any(Number), inside: true });
  const width = await page.evaluate(() => {
    const p = (window as any).__designer.getState().engine.paginated;
    const all = (nodes: any[]): any[] => nodes.flatMap((node: any) => [node, ...all(node.children ?? [])]);
    return all(p.pages[0].content).find((node: any) => node.component.type === "table").box.width;
  });
  // At least 120 mm, never a sliver.
  expect(width).toBeGreaterThanOrEqual(120 * (72 / 25.4) - 1);
});
