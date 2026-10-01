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
    await expect.poll(() => page.getByTestId("page-thumb").count()).toBeGreaterThan(1);
  });
});

test.describe("properties, masters, print, blocks", () => {
  test("layers: rename, hide and lock rows; table shows header/detail/footer pseudo rows", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-invoice").click();
    await page.getByTestId("left-tab-layers").click();
    await page.getByTestId("layer-company").hover();
    await page.getByTestId("hide-company").click();
    expect((await doc(page)).sections[0].children[0].children[0].hidden).toBe(true);
    await page.getByTestId("layer-company").dblclick();
    await page.getByTestId("layer-rename").fill("Company name");
    await page.getByTestId("layer-rename").press("Enter");
    expect(JSON.stringify(await doc(page))).toContain('"name":"Company name"');
    await expect(page.getByTestId("layers-tab")).toContainText("Header row");
  });

  test("layout inspector edits margin, padding and size limits; calculated-value builder writes the expression", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-blank").click();
    await page.getByTestId("palette-text").click();
    await page.getByLabel("Margin top").fill("6");
    await page.getByLabel("Padding left").fill("4");
    const d = JSON.stringify(await doc(page));
    expect(d).toContain('"margin":{"top":6');
    expect(d).toContain('"padding":{"top":0,"right":0,"bottom":0,"left":4}');

    await page.getByTestId("value-mode-formula").click();
    await page.getByTestId("formula-input").fill("params.a * params.b");
    await page.getByTestId("calc-view-builder").click();
    await expect(page.getByTestId("calc-builder")).toBeVisible();
    await page.getByTestId("calc-add").click();
    expect(JSON.stringify(await doc(page))).toMatch(/params\.a \* params\.b [+] /);
  });

  test("page masters: different first page is added from the page panel", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-invoice").click();
    await page.evaluate(() => (window as any).__designer.getState().select([]));
    await page.getByRole("button", { name: /Headers & footers/ }).click();
    await page.getByTestId("master-add-pageHeader-first").click();
    const sections = (await doc(page)).sections;
    expect(sections.some((s: any) => s.type === "pageHeader" && s.appliesTo === "first")).toBe(true);
    await page.getByTestId("master-remove-pageHeader-first").click();
    expect((await doc(page)).sections.some((s: any) => s.appliesTo === "first")).toBe(false);
  });

  test("print profile: preset sets page size and dpi; ZPL preview shows source and download", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-blank").click();
    await page.evaluate(() => (window as any).__designer.getState().select([]));
    await page.getByRole("button", { name: /Print & labels/ }).click();
    await page.getByTestId("print-preset").selectOption({ label: "Label 50 × 30 mm (ZPL 203 dpi)" });
    const d = await doc(page);
    expect(d.print).toMatchObject({ printerType: "label", language: "zpl", dpi: 203 });
    expect(d.page.width).toBe(50);
    await expect(page.getByTestId("print-facts")).toContainText("50.0 × 30.0 mm");
    await page.getByTestId("palette-qr-code").click();
    await page.getByTestId("mode-preview").click();
    await page.getByTestId("preview-tab-zpl").click();
    await expect(page.getByTestId("zpl-text")).toContainText("^XA");
    await expect(page.getByTestId("zpl-info")).toContainText("203 dpi");
  });

  test("label starter: barcode too small gets a one-click fix", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-search").fill("pharmacy");
    await page.getByTestId("starter-pharmacy-label").click();
    await page.evaluate(() => {
      const s = (window as any).__designer.getState();
      s.patch("rx-qr", { width: 12, height: 12 });
    });
    await page.getByTestId("toggle-problems").click();
    await expect(page.getByTestId("problems")).toContainText(/QR code .* should be at least/, { timeout: 8000 });
    await page.getByTestId("problem-fix").first().click();
    expect(JSON.stringify(await doc(page))).not.toContain('"width":12,"height":12');
  });

  test("My Components: save a selection as a reusable block and insert it again", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-blank").click();
    await page.getByTestId("palette-text").click();
    await page.getByTestId("save-block").click();
    await page.getByTestId("block-name").fill("Letterhead " + Date.now().toString(36));
    await page.getByTestId("block-save").click();
    await expect(page.getByTestId("my-components").locator(".block-item").first()).toBeVisible();
    const before = (await doc(page)).sections[0].children.length;
    await page.getByTestId("my-components").locator(".block-item").first().click();
    expect((await doc(page)).sections[0].children.length).toBe(before + 1);
  });

  test("new-report dialog: size picker and template search", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("blank-size").selectOption({ label: "Receipt 58 mm" });
    await page.getByTestId("starter-blank").click();
    expect((await doc(page)).page.width).toBe(58);
    await page.getByTestId("btn-more").click();
    await page.getByTestId("btn-new").click();
    await page.getByTestId("starter-search").fill("wristband");
    await expect(page.getByTestId("starter-wristband")).toBeVisible();
    await expect(page.getByTestId("starter-invoice")).toHaveCount(0);
  });
});

test.describe("data and code tooling", () => {
  test("CodeMirror shows schema errors as squiggles and offers key completions", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-blank").click();
    await page.getByTestId("mode-code").click();
    await expect(page.locator(".cm-editor")).toBeVisible();
    await page.evaluate(() => {
      const v = (window as any).__codeView;
      const t = v.state.doc.toString().replace('"type": "detail"', '"type": "bogus"');
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: t } });
    });
    await expect(page.locator(".cm-lintRange-error").first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId("code-status")).toContainText("problem");
  });

  test("CSV dataset becomes inline data with schema view and insights", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-blank").click();
    await page.getByTestId("mode-data").click();
    await page.getByTestId("data-add").click();
    await page.getByTestId("dataset-kind-csv").click();
    await page.getByTestId("dataset-csv").fill("name,amount,date\nConsultation,600,2025-01-05\nX-ray,700,2025-01-06\n");
    await page.getByTestId("dataset-test").click();
    await expect(page.getByTestId("dataset-insights")).toContainText("2 rows");
    await page.getByTestId("result-view-schema").click();
    await page.getByTestId("dataset-save").click();
    const d = await page.evaluate(() => (window as any).__designer.getState().doc);
    expect(d.datasets[0].query.data).toEqual([
      { name: "Consultation", amount: 600, date: "2025-01-05" },
      { name: "X-ray", amount: 700, date: "2025-01-06" },
    ]);
  });

  test("compare versions lists changes between a saved version and the editor", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-blank").click();
    await page.evaluate(() => { const s = (window as any).__designer.getState(); s.setDoc({ ...s.doc, id: "cmp-" + Date.now() }); });
    await page.getByTestId("btn-save").click();
    await expect(page.getByTestId("status-pill")).toContainText("v1");
    await page.getByTestId("palette-text").click();
    await page.getByTestId("btn-save").click();
    await expect(page.getByTestId("status-pill")).toContainText("v2");
    await page.getByTestId("btn-more").click();
    await page.getByRole("menuitem", { name: /Compare versions/ }).click();
    await page.getByTestId("compare-from").selectOption({ label: /v1/ as any }).catch(() => {});
    await expect(page.getByTestId("compare-changes")).toBeVisible();
  });
});

test.describe("label sheets", () => {
  test("sticker sheet starter lays 8 labels per A4 sheet and the panel validates fit", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-search").fill("sticker");
    await page.getByTestId("starter-sticker-sheet").click();
    await expect(page.getByTestId("page-2")).toBeVisible();
    await page.evaluate(() => (window as any).__designer.getState().select(["sheet"]));
    await expect(page.getByTestId("sheet-facts")).toContainText("8 labels per sheet");
    await expect(page.getByTestId("sheet-facts")).not.toHaveClass(/bad/);
    // oversize a label: the panel flags it
    await page.getByLabel("Label height (mm)").fill("100");
    await expect(page.getByTestId("sheet-facts")).toHaveClass(/bad/);
  });

  test("insert a Label sheet, pick a stock preset and a start position", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-blank").click();
    await page.getByTestId("palette-label-sheet").click();
    await page.getByTestId("sheet-preset").selectOption({ label: "A4 · 3 × 7 (63.5 × 38.1 mm)" });
    let d = await page.evaluate(() => (window as any).__designer.getState().doc);
    const sheet = d.sections[0].children[0];
    expect(sheet).toMatchObject({ type: "labelSheet", columns: 3, rows: 7, labelWidth: 63.5, labelHeight: 38.1 });
    expect(d.page.margin.top).toBe(15.1);
    await page.getByLabel("Start position").fill("5");
    d = await page.evaluate(() => (window as any).__designer.getState().doc);
    expect(d.sections[0].children[0].startPosition).toBe(5);
  });
});

test.describe("AI assistant (BYOK, mocked provider)", () => {
  async function mockProvider(page: Page, reply: unknown, status = 200) {
    let calls = 0;
    let lastBody = "";
    await page.route("https://api.anthropic.com/**", async (route) => {
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      calls++;
      lastBody = route.request().postData() ?? "";
      await route.fulfill({ status, headers: cors, contentType: "application/json", body: JSON.stringify(status === 200 ? { content: [{ type: "text", text: JSON.stringify(reply) }] } : { error: { message: "invalid x-api-key" } }) });
    });
    return { calls: () => calls, body: () => lastBody };
  }
  const withKey = async (page: Page) =>
    page.addInitScript(() => localStorage.setItem("designer.ai", JSON.stringify({ provider: "anthropic", model: "claude-test", apiKey: "sk-test", baseUrl: "" })));

  test("selection-scoped edit: proposal previews on the canvas, Accept commits, Undo restores", async ({ page }) => {
    await withKey(page);
    const mock = await mockProvider(page, { explanation: "Made the title larger and bold.", ops: [{ op: "replace", path: "#company/style/fontSize", value: 28 }, { op: "add", path: "#company/style/fontWeight", value: "bold" }] });
    await page.goto("/");
    await page.getByTestId("starter-invoice").click();
    await expect(page.getByTestId("page-1")).toBeVisible();
    await page.evaluate(() => (window as any).__designer.getState().select(["company"]));
    await page.keyboard.press("Control+j");
    await expect(page.getByTestId("ai-scope")).toContainText("1 selected");
    await page.getByTestId("ai-prompt").fill("make the company name bigger and bold");
    await page.getByTestId("ai-send").click();
    await expect(page.getByTestId("ai-proposal")).toBeVisible();
    await expect(page.getByTestId("ai-changes")).toContainText('changed text "company"');
    // nothing committed yet
    expect((await doc(page)).sections[0].children[0].children[0].style.fontSize).not.toBe(28);
    // the model never saw sample data values
    expect(mock.body()).not.toContain("Sai Varaprasad");
    expect(mock.body()).toContain("claude-test");
    await page.getByTestId("ai-accept").click();
    expect(JSON.stringify(await doc(page))).toContain('"fontSize":28');
    await page.getByTestId("btn-undo").click();
    expect(JSON.stringify(await doc(page))).not.toContain('"fontSize":28');
  });

  test("Reject leaves the report untouched", async ({ page }) => {
    await withKey(page);
    await mockProvider(page, { explanation: "Removed it.", ops: [{ op: "remove", path: "#company" }] });
    await page.goto("/");
    await page.getByTestId("starter-invoice").click();
    await page.keyboard.press("Control+j");
    await page.getByTestId("ai-prompt").fill("delete the company name");
    await page.getByTestId("ai-send").click();
    await expect(page.getByTestId("ai-proposal")).toBeVisible();
    await page.getByTestId("ai-reject").click();
    expect(JSON.stringify(await doc(page))).toContain('"id":"company"');
    await expect(page.getByTestId("ai-proposal")).toHaveCount(0);
  });

  test("a bad model reply or provider error is shown, and nothing changes", async ({ page }) => {
    await withKey(page);
    await mockProvider(page, { explanation: "oops", ops: [{ op: "replace", path: "#ghost/value", value: 1 }] });
    await page.goto("/");
    await page.getByTestId("starter-invoice").click();
    await page.keyboard.press("Control+j");
    await page.getByTestId("ai-prompt").fill("do something");
    await page.getByTestId("ai-send").click();
    await expect(page.getByTestId("ai-error")).toContainText("Nothing was changed");
  });

  test("without a key the settings dialog opens; the key is stored locally only", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-blank").click();
    await page.getByTestId("btn-ai").click();
    await page.getByTestId("ai-prompt").fill("add a title");
    await page.getByTestId("ai-send").click();
    await page.getByTestId("ai-key").fill("sk-local");
    await page.getByTestId("ai-settings-save").click();
    const stored = await page.evaluate(() => localStorage.getItem("designer.ai"));
    expect(stored).toContain("sk-local");
    await expect(page.getByTestId("ai-bar")).toBeVisible();
  });
});

test("watermark and bookmark settings write to the report", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.getByRole("button", { name: /^▸ Watermark|^▾ Watermark/ }).click().catch(() => {});
  await page.getByTestId("watermark-text").fill("CONFIDENTIAL");
  expect((await page.evaluate(() => (window as any).__designer.getState().doc)).watermark.text).toBe("CONFIDENTIAL");
  await page.getByTestId("palette-text").click();
  await page.getByRole("button", { name: /Advanced/ }).click();
  await page.getByTestId("flag-bookmark").check();
  expect(JSON.stringify(await page.evaluate(() => (window as any).__designer.getState().doc))).toContain('"bookmark":true');
});
