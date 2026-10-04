import { test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Captures real product screens and rendered outputs for marketing/launch-video:  VIDEO_ASSETS=1 npx playwright test launch-video-assets */
test.skip(!process.env.VIDEO_ASSETS, "set VIDEO_ASSETS=1 to capture launch video assets");
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "light" });

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../../marketing/launch-video/assets");
const shot = (name: string) => path.join(root, "shots", name);
const API = "http://127.0.0.1:4100";

async function open(page: Page, starter: string) {
  await page.goto("/");
  await page.getByTestId(`starter-${starter}`).click();
  await page.getByTestId("page-1").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);
}

test("designer before and after selecting the table", async ({ page }) => {
  await open(page, "invoice");
  await page.evaluate(() => (window as any).__designer.getState().select([]));
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot("designer-before.png") });
  fs.writeFileSync(shot("designer-table.json"), JSON.stringify(await page.locator('[data-cid="items"]').first().boundingBox()));
  await page.evaluate(() => (window as any).__designer.getState().select(["items"]));
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot("designer-after.png") });
});

test("table conditions", async ({ page }) => {
  await open(page, "lab-report");
  await page.evaluate(() => (window as any).__designer.getState().set({ tableEditId: "results" }));
  await page.getByTestId("table-tab-conditions").click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: shot("rules.png") });
});

test("pagination explained", async ({ page }) => {
  await open(page, "account-statement");
  await page.getByTestId("toggle-pagination").click();
  await page.evaluate(() => (window as any).__designer.getState().set({ zoom: 0.8 }));
  await page.waitForTimeout(800);
  await page.screenshot({ path: shot("pagination.png") });
  fs.writeFileSync(shot("pagination-decisions.json"), JSON.stringify(await Promise.all((await page.getByTestId("pagination-decision").all()).map((row) => row.boundingBox()))));
});

test("AI proposal", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("designer.ai", JSON.stringify({ provider: "anthropic", model: "claude", apiKey: "demo", baseUrl: "" })));
  await page.route("https://api.anthropic.com/**", async (route) => {
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    await route.fulfill({ headers: cors, contentType: "application/json", body: JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ explanation: "Made the company name larger, bold and blue.", ops: [{ op: "replace", path: "#company/style/fontSize", value: 26 }, { op: "add", path: "#company/style/fontWeight", value: "bold" }, { op: "add", path: "#company/style/color", value: "#1d4ed8" }] }) }] }) });
  });
  await open(page, "invoice");
  await page.evaluate(() => (window as any).__designer.getState().select(["company"]));
  await page.keyboard.press("Control+j");
  await page.getByTestId("ai-prompt").fill("make the company name larger, bold and blue");
  await page.getByTestId("ai-send").click();
  await page.getByTestId("ai-proposal").waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: shot("ai.png") });
  const accept = await page.getByTestId("ai-accept").boundingBox();
  fs.writeFileSync(shot("ai-accept.json"), JSON.stringify(accept));
  await page.getByTestId("ai-accept").click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: shot("ai-accepted.png") });
});

test("rendered outputs", async ({ request }) => {
  const examples = path.resolve(here, "../../../../examples");
  for (const name of ["invoice", "lab-report", "receipt", "pharmacy-label", "account-statement"]) {
    const report = JSON.parse(fs.readFileSync(path.join(examples, `${name}.report.json`), "utf8"));
    const response = await request.post(`${API}/api/v1/render`, { data: { report, format: "pdf" } });
    if (!response.ok()) throw new Error(`${name}: ${response.status()} ${await response.text()}`);
    fs.writeFileSync(path.join(root, "outputs", `${name}.pdf`), await response.body());
  }
  const label = JSON.parse(fs.readFileSync(path.join(examples, "pharmacy-label.report.json"), "utf8"));
  const zpl = await request.post(`${API}/api/v1/render`, { data: { report: label, format: "zpl" } });
  fs.writeFileSync(path.join(root, "outputs", "pharmacy-label.zpl"), await zpl.body());
});
