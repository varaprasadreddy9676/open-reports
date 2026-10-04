import { test, expect, type Page } from "@playwright/test";

/**
 * Screenshot tests for the designer's main surfaces. Baselines are per platform; CI compares the Linux baselines inside
 * the official Playwright image (see .github/workflows/ci.yml). After an intended visual change, regenerate with
 * scripts/update-visual-baselines.sh (Linux, in Docker) and `playwright test --grep @visual --update-snapshots` (local).
 */

test.use({ viewport: { width: 1440, height: 900 } });

const shot = { maxDiffPixelRatio: 0.002, animations: "disabled" as const, caret: "hide" as const };

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  // Let pagination and canvas font measurement finish before capturing.
  await expect.poll(() => page.evaluate(() => Boolean((window as any).__designer?.getState().engine?.paginated))).toBe(true);
  await page.waitForTimeout(400);
}

async function openStarter(page: Page, starter: string) {
  await page.goto("/");
  await page.getByTestId(`starter-${starter}`).click();
  await expect(page.getByTestId("page-1")).toBeVisible();
  await settle(page);
}

test.describe("@visual designer surfaces", () => {
  test("start screen", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-blank").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot("start-screen.png", shot);
  });

  test("workspace with a selected element", async ({ page }) => {
    await openStarter(page, "invoice");
    await page.evaluate(() => (window as any).__designer.getState().select(["company"]));
    await settle(page);
    await expect(page).toHaveScreenshot("workspace-selected.png", shot);
  });

  test("report settings: print", async ({ page }) => {
    await openStarter(page, "lab-report");
    await page.locator('[data-page="0"]').click({ position: { x: 8, y: 8 } });
    await page.getByTestId("report-tab-print").click();
    await settle(page);
    await expect(page.getByTestId("properties")).toHaveScreenshot("inspector-print.png", shot);
  });

  test("table designer: conditions", async ({ page }) => {
    await openStarter(page, "lab-report");
    await page.evaluate(() => (window as any).__designer.getState().set({ tableEditId: "results" }));
    await page.getByTestId("table-tab-conditions").click();
    await settle(page);
    await expect(page.getByTestId("table-designer")).toHaveScreenshot("table-designer-conditions.png", shot);
  });

  test("data workspace", async ({ page }) => {
    await openStarter(page, "lab-report");
    await page.getByTestId("left-tab-data").click();
    await settle(page);
    await expect(page).toHaveScreenshot("data-workspace.png", shot);
  });

  test("theme dialog", async ({ page }) => {
    await openStarter(page, "invoice");
    await page.evaluate(() => (window as any).__designer.getState().set({ dialog: "theme" }));
    await expect(page.getByTestId("theme-dialog")).toBeVisible();
    await settle(page);
    await expect(page.getByTestId("theme-dialog")).toHaveScreenshot("theme-dialog.png", shot);
  });
});

test.describe("@visual dark mode", () => {
  test.use({ colorScheme: "dark" });

  test("workspace", async ({ page }) => {
    await openStarter(page, "invoice");
    await page.evaluate(() => (window as any).__designer.getState().select(["company"]));
    await settle(page);
    await expect(page).toHaveScreenshot("workspace-dark.png", shot);
  });

  test("table designer", async ({ page }) => {
    await openStarter(page, "lab-report");
    await page.evaluate(() => (window as any).__designer.getState().set({ tableEditId: "results" }));
    await page.getByTestId("table-tab-conditions").click();
    await settle(page);
    await expect(page.getByTestId("table-designer")).toHaveScreenshot("table-designer-dark.png", shot);
  });
});
