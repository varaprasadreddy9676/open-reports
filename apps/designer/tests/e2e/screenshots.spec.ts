import { test, type Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));

/** Regenerates the README screenshots:  SCREENSHOTS=1 pnpm --filter @reporting/designer exec playwright test screenshots */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to regenerate docs/images");
test.use({ viewport: { width: 1480, height: 900 }, colorScheme: "light" });
const out = (n: string) => path.resolve(here, "../../../../docs/images", n);
const state = (page: Page, fn: string) => page.evaluate(fn);

async function open(page: Page, starter: string, search?: string) {
  await page.goto("/");
  if (search) await page.getByTestId("starter-search").fill(search);
  await page.getByTestId(`starter-${starter}`).click();
  await page.getByTestId("page-1").waitFor();
  await page.waitForTimeout(700);
}

test("designer canvas", async ({ page }) => {
  await open(page, "invoice");
  await page.evaluate(() => (window as any).__designer.getState().select(["items"]));
  await page.waitForTimeout(500);
  await page.screenshot({ path: out("designer.png") });
});

test("pagination explained", async ({ page }) => {
  await open(page, "account-statement");
  await page.getByTestId("toggle-pagination").click();
  await page.evaluate(() => (window as any).__designer.getState().set({ zoom: 0.8 }));
  await page.waitForTimeout(700);
  await page.screenshot({ path: out("pagination.png") });
});

test("sticker sheet", async ({ page }) => {
  await open(page, "sticker-sheet", "sticker");
  await page.evaluate(() => (window as any).__designer.getState().select(["sheet"]));
  await page.evaluate(() => (window as any).__designer.getState().set({ zoom: 0.7 }));
  await page.waitForTimeout(700);
  await page.screenshot({ path: out("sticker-sheet.png") });
});

test("labels and print profile", async ({ page }) => {
  await open(page, "pharmacy-label", "pharmacy");
  await page.evaluate(() => (window as any).__designer.getState().select([]));
  await page.evaluate(() => (window as any).__designer.getState().set({ zoom: 2 }));
  await page.waitForTimeout(700);
  await page.screenshot({ path: out("labels.png") });
});

test("AI proposal with diff", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("designer.ai", JSON.stringify({ provider: "anthropic", model: "claude", apiKey: "demo", baseUrl: "" })));
  await page.route("https://api.anthropic.com/**", async (route) => {
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    await route.fulfill({ headers: cors, contentType: "application/json", body: JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ explanation: "Made the company name larger, bold and teal.", ops: [{ op: "replace", path: "#company/style/fontSize", value: 26 }, { op: "add", path: "#company/style/fontWeight", value: "bold" }, { op: "add", path: "#company/style/color", value: "#0f766e" }] }) }] }) });
  });
  await open(page, "invoice");
  await page.evaluate(() => (window as any).__designer.getState().select(["company"]));
  await page.keyboard.press("Control+j");
  await page.getByTestId("ai-prompt").fill("make the company name larger, bold and teal");
  await page.getByTestId("ai-send").click();
  await page.getByTestId("ai-proposal").waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: out("ai-diff.png") });
});
