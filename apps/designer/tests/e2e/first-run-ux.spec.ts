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
  // The hint names the example's real heading, and following it works.
  const heading = await page.evaluate(() => {
    const s = (window as any).__designer.getState();
    const walk = (list: any[]): any[] => list.flatMap((c) => [c, ...walk(c.children ?? [])]);
    return walk(s.doc.sections.flatMap((section: any) => section.children ?? [])).find((c) => c.type === "text" && c.value && !c.binding && !c.expression);
  });
  await expect(page.getByTestId("getting-started")).toContainText(`Double-click “${heading.value}”`);
  await page.evaluate((id) => (window as any).__designer.getState().select([id]), heading.id);
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
  await expect(page.getByTestId("blank-start")).toBeVisible();
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


test.describe("first steps on a blank report", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await page.getByTestId("starter-blank").click();
  });

  test("the empty page offers a first step and gets out of the way once there is content", async ({ page }) => {
    const start = page.getByTestId("blank-start");
    await expect(start).toBeVisible();
    await expect(start).toContainText("Start your report");
    await start.getByTestId("blank-add-text").click();
    await expect(start).toHaveCount(0);
    await expect(page.getByTestId("page-1")).toContainText("Report title");
    await expect.poll(() => page.evaluate(() => (window as any).__designer.getState().editingText)).toBeTruthy();
  });

  test("adding a page header puts a ready-to-type name inside the header section", async ({ page }) => {
    await page.getByTestId("blank-add-header").click();
    const doc = await page.evaluate(() => (window as any).__designer.getState().doc);
    const header = doc.sections.find((section: any) => section.type === "pageHeader");
    expect(header.children).toEqual([expect.objectContaining({ type: "text", value: "Company name" })]);
    await expect(page.getByTestId("toast").filter({ hasText: "repeats at the top of every page" })).toBeVisible();
  });

  test("starting from an example or from JSON opens the right dialog", async ({ page }) => {
    await page.getByTestId("blank-from-example").click();
    await expect.poll(() => page.evaluate(() => (window as any).__designer.getState().dialog)).toBe("new");
    await page.keyboard.press("Escape");
    await page.getByTestId("blank-from-json").click();
    await expect.poll(() => page.evaluate(() => (window as any).__designer.getState().dialog)).toBe("generate");
  });

  test("the Data components say to add data first, until the report has some", async ({ page }) => {
    await page.evaluate(() => (window as any).__designer.getState().set({ leftOpen: true, leftTab: "insert" }));
    const note = page.getByTestId("data-first-note");
    await expect(note).toContainText("No data yet");
    await note.getByTestId("data-first-add").click();
    await expect.poll(() => page.evaluate(() => (window as any).__designer.getState().dialog)).toBe("dataset");
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const s = (window as any).__designer.getState();
      s.setDoc({ ...s.doc, datasets: [{ id: "items", source: "inline", query: { data: [{ name: "A" }] } }] });
    });
    await expect(note).toHaveCount(0);
  });

  test("the canvas views are named for what they show, and Save says what it did", async ({ page }) => {
    await expect(page.getByTestId("view-structure")).toHaveText("Sections");
    await expect(page.getByTestId("view-pages")).toHaveText("Pages");
    await expect(page.getByTestId("btn-save")).toHaveAttribute("title", /draft version/);
    await expect(page.getByTestId("btn-publish")).toHaveAttribute("title", /report viewer, API/);
    await page.getByTestId("btn-save").click();
    await expect(page.getByTestId("toast").filter({ hasText: "Saved draft version" })).toContainText("Publish it when");
  });
});
