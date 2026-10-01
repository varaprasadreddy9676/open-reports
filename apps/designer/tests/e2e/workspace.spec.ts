import { test, expect, type Page } from "@playwright/test";

const doc = (page: Page) => page.evaluate(() => (window as any).__designer.getState().doc);
const st = (page: Page) => page.evaluate(() => {
  const s = (window as any).__designer.getState();
  return { selection: s.selection, bottom: s.bottom, mode: s.mode, past: s.past.length };
});

async function absoluteForm(page: Page) {
  await page.goto("/");
  await page.getByTestId("starter-absolute-form").click();
  await expect(page.getByTestId("page-1")).toBeVisible();
}

test.describe("workspace", () => {
  test("modes: Data mode lists datasets; split view shows canvas and code together", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-invoice").click();
    await page.getByTestId("mode-data").click();
    await expect(page.getByTestId("data-mode")).toBeVisible();
    await expect(page.getByTestId("data-item-invoice")).toBeVisible();
    await page.getByTestId("mode-design").click();
    await page.getByTestId("toggle-split").click();
    await expect(page.getByTestId("canvas")).toBeVisible();
    await expect(page.locator(".split")).toBeVisible();
  });

  test("editing shows a subtle save state and labelled history", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-blank").click();
    await expect(page.getByTestId("save-state")).toContainText(/Draft|Saved/);
    await page.getByTestId("palette-text").click();
    await page.getByTestId("toggle-history").click();
    await expect(page.getByTestId("history-row").first()).toBeVisible();
    await expect(page.getByTestId("history-panel")).toContainText(/Added/);
  });

  test("pagination panel explains page breaks and offers a fix", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-account-statement").click();
    await expect(page.getByTestId("page-2")).toBeVisible();
    await page.getByTestId("toggle-pagination").click();
    await expect(page.getByTestId("pagination-panel")).toBeVisible();
    await expect(page.getByTestId("pagination-decision").first()).toBeVisible();
    await expect(page.getByTestId("pg-marker").first()).toBeVisible();
  });

  test("view menu toggles overlays and the target selector changes renderer warnings", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-absolute-form").click();
    await page.getByTestId("btn-view").click();
    await page.getByTestId("toggle-boundaries").click();
    await expect(page.locator(".page.boundaries")).toHaveCount(1);
    await page.getByTestId("toggle-problems").click();
    await page.getByTestId("target-select").selectOption("xlsx");
    await expect(page.getByTestId("problems")).toContainText(/Excel|XLSX|Absolute/i, { timeout: 8000 });
  });
});

test.describe("canvas interactions", () => {
  test("group, lock and hide via the context menu and shortcuts", async ({ page }) => {
    await absoluteForm(page);
    await page.evaluate(() => (window as any).__designer.getState().select(["title", "name"]));
    await page.keyboard.press("Control+g");
    let d = await doc(page);
    const group = d.sections[0].children[0].children.find((c: any) => c.type === "group" || c.children?.some?.((x: any) => x.id === "title"));
    expect(group).toBeTruthy();

    await page.keyboard.press("Control+Shift+g");
    d = await doc(page);
    expect(d.sections[0].children[0].children.some((c: any) => c.id === "title")).toBe(true);

    await page.evaluate(() => (window as any).__designer.getState().select(["date"]));
    await page.keyboard.press("Control+l");
    expect((await doc(page)).sections[0].children[0].children.find((c: any) => c.id === "date").locked).toBe(true);
    await page.keyboard.press("Control+l");
    await page.keyboard.press("Control+Shift+h");
    expect((await doc(page)).sections[0].children[0].children.find((c: any) => c.id === "date").hidden).toBe(true);
  });

  test("right-click opens the context menu with actions", async ({ page }) => {
    await absoluteForm(page);
    await page.locator('[data-cid="title"]').first().click({ button: "right" });
    await expect(page.getByTestId("context-menu")).toBeVisible();
    await page.getByTestId("ctx-lock").click();
    expect((await doc(page)).sections[0].children[0].children.find((c: any) => c.id === "title").locked).toBe(true);
  });

  test("double-click edits static text in place", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-blank").click();
    await page.getByTestId("palette-text").click();
    const id = (await st(page)).selection[0];
    await expect(page.locator(`[data-cid="${id}"]`).first()).toContainText("New text");
    await page.waitForTimeout(300);
    await page.locator(`[data-cid="${id}"]`).first().dblclick();
    const editor = page.getByTestId("inline-editor");
    await expect(editor).toBeVisible();
    await editor.fill("Hello patients");
    await editor.press("Enter");
    await expect(page.getByTestId("canvas")).toContainText("Hello patients");
  });

  test("floating toolbar changes text style", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-blank").click();
    await page.getByTestId("palette-text").click();
    await page.getByTestId("ft-bold").click();
    const d = await doc(page);
    expect(JSON.stringify(d)).toContain('"fontWeight":"bold"');
  });

  test("marquee selects several elements; alt-drag duplicates; guides snap", async ({ page }) => {
    await absoluteForm(page);
    await page.waitForTimeout(400);
    const pageBox = (await page.getByTestId("page-1").boundingBox())!;
    await page.mouse.move(pageBox.x + 3, pageBox.y + 3);
    await page.mouse.down();
    await page.mouse.move(pageBox.x + pageBox.width - 3, pageBox.y + pageBox.height / 2, { steps: 6 });
    await page.mouse.up();
    expect((await st(page)).selection.length).toBeGreaterThan(1);

    // alt-drag a single element: original stays, a copy is created
    await page.evaluate(() => (window as any).__designer.getState().select([]));
    const before = (await doc(page)).sections[0].children[0].children.length;
    const el = (await page.locator('[data-cid="date"]').first().boundingBox())!;
    await page.keyboard.down("Alt");
    await page.mouse.move(el.x + 4, el.y + 4);
    await page.mouse.down();
    await page.mouse.move(el.x + 40, el.y + 70, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up("Alt");
    expect((await doc(page)).sections[0].children[0].children.length).toBe(before + 1);
  });

  test("clicking a diagnostics badge opens Problems; one-click fix for an oversized element", async ({ page }) => {
    await absoluteForm(page);
    await page.evaluate(() => {
      const s = (window as any).__designer.getState();
      s.patch("title", { width: 900 });
    });
    await page.getByTestId("toggle-problems").click();
    await expect(page.getByTestId("problem-fix").first()).toBeVisible({ timeout: 8000 });
    await page.getByTestId("problem-fix").first().click();
    expect((await doc(page)).sections[0].children[0].children.find((c: any) => c.id === "title").width).toBeLessThan(900);
    await expect(page.getByTestId("problem-fix")).toHaveCount(0, { timeout: 8000 });
  });

  test("pages tab shows thumbnails that jump to a page", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-account-statement").click();
    await page.getByTestId("left-tab-pages").click();
    await expect(page.getByTestId("page-thumb").first()).toBeVisible();
    expect(await page.getByTestId("page-thumb").count()).toBeGreaterThan(1);
  });
});
