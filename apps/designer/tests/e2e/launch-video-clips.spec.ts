import { test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Stop-motion capture of live product footage for marketing/launch-video: every scripted step saves frames, so
 * drags, typing and clicks are smooth at 30 fps whatever the real timing.  VIDEO_ASSETS=1 npx playwright test launch-video-clips
 */
test.skip(!process.env.VIDEO_ASSETS, "set VIDEO_ASSETS=1 to capture launch video clips");
test.use({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "light" });
test.setTimeout(240_000);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../../marketing/launch-video/assets/clips");
const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

class Clip {
  private frames: [string, number][] = [];
  /** Clicks and keystrokes by output frame, so the soundtrack can hit them exactly. */
  private events: { frame: number; type: "click" | "key" }[] = [];
  private get length() { return this.frames.reduce((sum, [, n]) => sum + n, 0); }
  private x = 1200;
  private y = 820;
  constructor(private page: Page, private name: string) {
    fs.rmSync(path.join(root, name), { recursive: true, force: true });
    fs.mkdirSync(path.join(root, name), { recursive: true });
  }
  private async place(pressed = false) {
    await this.page.evaluate(([x, y, pressed]) => {
      let cursor = document.getElementById("video-cursor");
      if (!cursor) {
        cursor = document.createElement("div");
        cursor.id = "video-cursor";
        cursor.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M4 2.5l15 11.2-6.7 1.1 3.9 7.3-2.6 1.4-3.9-7.4L4 21z" fill="#111827" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
        Object.assign(cursor.style, { position: "fixed", zIndex: "2147483647", pointerEvents: "none", left: "0", top: "0", transformOrigin: "4px 3px" });
        document.body.appendChild(cursor);
      }
      cursor.style.transform = `translate(${(x as number) - 4}px, ${(y as number) - 3}px) scale(${pressed ? 0.85 : 1})`;
    }, [this.x, this.y, pressed] as const);
  }
  async snap(count = 1) {
    await this.place();
    const file = `${String(this.frames.length).padStart(4, "0")}.jpg`;
    await this.page.screenshot({ path: path.join(root, this.name, file), type: "jpeg", quality: 90 });
    this.frames.push([file, count]);
  }
  /** Repeat the last frame. */
  hold(count: number) {
    this.frames[this.frames.length - 1]![1] += count;
  }
  async move(x: number, y: number, frames = 18) {
    const from = { x: this.x, y: this.y };
    for (let i = 1; i <= frames; i++) {
      const p = ease(i / frames);
      this.x = from.x + (x - from.x) * p;
      this.y = from.y + (y - from.y) * p;
      await this.snap();
    }
  }
  async click(x?: number, y?: number) {
    if (x !== undefined && y !== undefined) await this.move(x, y);
    await this.place(true);
    this.events.push({ frame: this.length, type: "click" });
    await this.snap();
    await this.page.mouse.click(this.x, this.y);
    await this.place(false);
  }
  async at(selector: string) {
    const box = (await this.page.locator(selector).first().boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
  async type(text: string, perChar = 1) {
    for (const char of text) {
      await this.page.keyboard.type(char);
      this.events.push({ frame: this.length, type: "key" });
      await this.snap(perChar);
    }
  }
  save() {
    const total = this.frames.reduce((sum, [, n]) => sum + n, 0);
    fs.writeFileSync(path.join(root, this.name, "manifest.json"), JSON.stringify({ fps: 30, width: 2880, height: 1800, total, frames: this.frames, events: this.events }));
  }
}

async function start(page: Page, starter: string, search?: string) {
  await page.goto("/");
  if (search) await page.getByTestId("starter-search").fill(search);
  await page.getByTestId(`starter-${starter}`).click();
  await page.getByTestId("page-1").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
}
const settle = (page: Page, ms = 700) => page.waitForTimeout(ms);

test("data: paste JSON, get a report", async ({ page }) => {
  await page.goto("/");
  const clip = new Clip(page, "data");
  await clip.snap(6);
  await clip.click(...Object.values(await clip.at('[data-testid="starter-json"]')) as [number, number]);
  await settle(page, 400);
  await page.getByTestId("generate-name").fill("Order summary");
  const box = page.getByTestId("generate-json");
  await box.fill("");
  await clip.click(...Object.values(await clip.at('[data-testid="generate-json"]')) as [number, number]);
  await clip.type('{ "customer": "Acme Corp",\n  "items": [\n    { "item": "Design sprint", "qty": 2, "price": 1200 },\n    { "item": "Hosting", "qty": 12, "price": 40 },\n    { "item": "Support", "qty": 1, "price": 300 } ] }', 1);
  await clip.hold(8);
  await clip.click(...Object.values(await clip.at('[data-testid="generate-create"]')) as [number, number]);
  await page.getByTestId("page-1").waitFor();
  await settle(page, 900);
  await clip.snap(45);
  clip.save();
});

test("drag: drop a list, choose Table", async ({ page }) => {
  await start(page, "blank");
  await page.evaluate(() => {
    const store = (window as any).__designer.getState();
    store.loadDoc({ ...store.doc, id: "orders", name: "Orders", datasets: [{ id: "orders", source: "inline", query: { data: [
      { customer: "Acme Corp", city: "Pune", total: 2400 }, { customer: "Globex", city: "Austin", total: 980 }, { customer: "Initech", city: "Leeds", total: 3150 },
      { customer: "Umbrella", city: "Lyon", total: 1720 }, { customer: "Hooli", city: "Palo Alto", total: 4400 },
    ] } }], sections: [{ type: "detail", children: [] }] });
  });
  await page.getByTestId("left-tab-data").click();
  await settle(page);
  const clip = new Clip(page, "drag");
  await clip.snap(8);
  const source = page.getByTestId("array-orders");
  const from = await clip.at('[data-testid="array-orders"]');
  const target = page.getByTestId("page-1");
  const to = await clip.at('[data-testid="page-1"]');
  await clip.move(from.x, from.y, 16);
  await clip.hold(4);
  // Ghost chip follows the cursor while the real drag happens at the end.
  await page.evaluate(() => {
    const ghost = document.createElement("div");
    ghost.id = "video-ghost";
    ghost.textContent = "[ ] Orders rows";
    Object.assign(ghost.style, { position: "fixed", zIndex: "2147483646", pointerEvents: "none", padding: "6px 10px", borderRadius: "8px", background: "#2563eb", color: "#fff", font: "600 13px Inter, system-ui", boxShadow: "0 8px 24px rgba(37,99,235,.35)" });
    document.body.appendChild(ghost);
  });
  const moveGhost = async () => page.evaluate(() => {
    const cursor = document.getElementById("video-cursor")!.getBoundingClientRect();
    const ghost = document.getElementById("video-ghost")!;
    ghost.style.left = `${cursor.left + 18}px`;
    ghost.style.top = `${cursor.top + 18}px`;
  });
  const steps = 24;
  for (let i = 1; i <= steps; i++) {
    const p = ease(i / steps);
    (clip as any).x = from.x + (to.x - from.x) * p;
    (clip as any).y = from.y + (to.y - 120 - from.y) * p;
    await (clip as any).place();
    await moveGhost();
    await clip.snap();
  }
  await page.evaluate(() => document.getElementById("video-ghost")?.remove());
  await source.dragTo(target, { targetPosition: { x: 300, y: 120 } });
  await settle(page, 500);
  await clip.snap(14);
  const table = page.getByRole("button", { name: /table/i }).first();
  const tableBox = (await table.boundingBox())!;
  await clip.click(tableBox.x + tableBox.width / 2, tableBox.y + tableBox.height / 2);
  const create = page.getByRole("button", { name: /^(create|add|insert)/i }).first();
  if (await create.isVisible().catch(() => false)) {
    const createBox = (await create.boundingBox())!;
    await clip.click(createBox.x + createBox.width / 2, createBox.y + createBox.height / 2);
  }
  await settle(page, 900);
  await clip.move(1180, 760, 12);
  await clip.snap(45);
  clip.save();
});

test("pages: rows grow, pages follow", async ({ page }) => {
  await start(page, "account-statement");
  const all = await page.evaluate(() => (window as any).__designer.getState().doc.datasets[0].query.data);
  const rowsKey = Object.keys(all).find((k) => Array.isArray(all[k]))!;
  const rows = all[rowsKey] as unknown[];
  const setRows = (n: number) => page.evaluate(([key, n, rows]) => {
    const store = (window as any).__designer.getState();
    const ds = store.doc.datasets[0];
    store.setDoc({ ...store.doc, datasets: [{ ...ds, query: { ...ds.query, data: { ...ds.query.data, [key as string]: (rows as unknown[]).slice(0, n as number) } } }, ...store.doc.datasets.slice(1)] });
  }, [rowsKey, n, rows] as const);
  await page.evaluate(() => (window as any).__designer.getState().set({ zoom: 0.5 }));
  await setRows(14);
  await settle(page, 1200);
  const clip = new Clip(page, "pages");
  await clip.snap(15);
  for (const n of [40, 70, 100, rows.length]) {
    await setRows(n);
    await settle(page, 1200);
    await clip.snap(15);
  }
  await clip.click(...Object.values(await clip.at('[data-testid="toggle-pagination"]')) as [number, number]);
  await settle(page, 800);
  await clip.snap(10);
  await clip.click(...Object.values(await clip.at('[data-testid="pagination-decision"]')) as [number, number]);
  await settle(page, 600);
  await clip.snap(40);
  clip.save();
});

test("rules: add a rule, rows light up", async ({ page }) => {
  await start(page, "lab-report");
  await page.evaluate(() => {
    const store = (window as any).__designer.getState();
    store.patch("results", { rowRules: undefined, rowStyleWhen: undefined });
    store.set({ tableEditId: "results" });
  });
  await page.getByTestId("table-tab-conditions").click();
  await settle(page);
  const clip = new Clip(page, "rules");
  await clip.snap(10);
  await clip.click(...Object.values(await clip.at('[data-testid="table-row-rules-add"]')) as [number, number]);
  await settle(page, 400);
  await clip.snap(8);
  await clip.click(...Object.values(await clip.at('[data-testid="table-row-rules-code-0"]')) as [number, number]);
  await settle(page, 300);
  await clip.snap(4);
  const formula = '[data-testid="table-row-rules-formula-0"]';
  await clip.click(...Object.values(await clip.at(formula)) as [number, number]);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.press("Backspace");
  await clip.snap(2);
  await clip.type("row.value > row.high || row.value < row.low", 1);
  await page.keyboard.press("Tab");
  await settle(page, 700);
  await clip.snap(12);
  await clip.move(720, 520, 16);
  await clip.snap(45);
  clip.save();
});

test("formats: one report, every output", async ({ page }) => {
  const clip = new Clip(page, "formats");
  await start(page, "invoice");
  await page.getByTestId("mode-preview").click();
  for (const tab of ["pdf", "html", "xlsx", "csv"]) {
    await page.getByTestId(`preview-tab-${tab}`).click();
    await settle(page, tab === "pdf" ? 2500 : 1500);
    await clip.snap(15);
  }
  for (const [name, tab] of [["pharmacy-label", "zpl"], ["receipt", "escpos"]] as const) {
    await page.getByTestId("mode-design").click();
    const doc = JSON.parse(fs.readFileSync(path.resolve(here, `../../../../examples/${name}.report.json`), "utf8"));
    await page.evaluate((doc) => (window as any).__designer.getState().loadDoc(doc), doc);
    await settle(page, 900);
    await page.getByTestId("mode-preview").click();
    await page.getByTestId(`preview-tab-${tab}`).click();
    await settle(page, 1800);
    await clip.snap(15);
  }
  clip.save();
});

test("ai: ask, review, accept", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("designer.ai", JSON.stringify({ provider: "anthropic", model: "claude", apiKey: "demo", baseUrl: "" })));
  await page.route("https://api.anthropic.com/**", async (route) => {
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    await route.fulfill({ headers: cors, contentType: "application/json", body: JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ explanation: "Made the company name larger, bold and blue.", ops: [{ op: "replace", path: "#company/style/fontSize", value: 30 }, { op: "add", path: "#company/style/fontWeight", value: "bold" }, { op: "add", path: "#company/style/color", value: "#1d4ed8" }] }) }] }) });
  });
  await start(page, "invoice");
  await page.evaluate(() => (window as any).__designer.getState().select(["company"]));
  await page.keyboard.press("Control+j");
  await settle(page, 400);
  const clip = new Clip(page, "ai");
  await clip.snap(8);
  await clip.click(...Object.values(await clip.at('[data-testid="ai-prompt"]')) as [number, number]);
  await clip.type("make the company name bigger, bold and blue", 1);
  await clip.hold(6);
  await clip.click(...Object.values(await clip.at('[data-testid="ai-send"]')) as [number, number]);
  await page.getByTestId("ai-proposal").waitFor();
  await settle(page, 600);
  await clip.snap(30);
  await clip.click(...Object.values(await clip.at('[data-testid="ai-accept"]')) as [number, number]);
  await settle(page, 700);
  await clip.snap(40);
  clip.save();
});
