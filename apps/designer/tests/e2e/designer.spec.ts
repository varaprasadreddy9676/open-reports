import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const doc = (page: Page) => page.evaluate(() => (window as any).__designer.getState().doc);
const state = (page: Page) => page.evaluate(() => {
  const s = (window as any).__designer.getState();
  return { selection: s.selection, doc: s.doc, past: s.past.length, future: s.future.length, clipboard: s.clipboard.length };
});

async function startBlank(page: Page) {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await expect(page.getByTestId("page-1")).toBeVisible();
}

function pdfText(file: string): string {
  return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf-8" });
}

test.describe("complete journey: create, bind, style, preview, save, reload, export", () => {
  test("blank report to PDF with real data", async ({ page }) => {
    await startBlank(page);

    // 1. add a title
    await page.getByTestId("palette-text").click();
    const first = (await state(page)).selection[0];
    await page.getByTestId("value-text").fill("Patient Invoice");
    await expect(page.getByTestId("canvas")).toContainText("Patient Invoice");

    // 2. create a dataset from JSON through the dataset editor
    await page.getByTestId("left-tab-data").click();
    await page.getByTestId("add-dataset").click();
    await page.getByTestId("dataset-id").fill("invoice");
    await page.getByTestId("dataset-json").fill(
      JSON.stringify({ number: "INV-77", customer: { name: "Asha Rao" }, items: [{ description: "Consult", quantity: 2, rate: 500 }, { description: "X-ray", quantity: 1, rate: 800 }] })
    );
    await page.getByTestId("dataset-test").click();
    await expect(page.getByTestId("dataset-result")).toBeVisible();
    await page.getByTestId("dataset-save").click();
    await expect(page.getByTestId("dataset-invoice")).toBeVisible();

    // 3. drag a field onto the page -> bound text
    await page.getByTestId("field-invoice-customer.name").dragTo(page.getByTestId("page-1"), { targetPosition: { x: 200, y: 400 } });
    await expect(page.getByTestId("canvas")).toContainText("Asha Rao");

    // 4. drag the items array -> prompt -> Table with generated columns
    await page.getByTestId("field-invoice-items").dragTo(page.getByTestId("page-1"), { targetPosition: { x: 200, y: 500 } });
    await page.getByTestId("drop-prompt").getByText("Table", { exact: true }).click();
    await expect(page.getByTestId("canvas")).toContainText("Consult");
    await expect(page.getByTestId("canvas")).toContainText("Description");

    // 5. add an Amount column with a formula and a currency format, plus a total
    await page.getByTestId("add-column").click();
    await page.getByTestId("column-3").getByRole("button", { name: /New column/ }).click();
    await page.getByTestId("column-3").getByLabel("Column header").fill("Amount");
    await page.getByTestId("column-3").getByRole("button", { name: "fx Formula" }).click();
    await page.getByTestId("column-formula-3").fill("row.quantity * row.rate");
    await page.getByTestId("column-3").getByLabel("Format as").selectOption("currency");
    await page.getByTestId("column-3").getByLabel("Footer total").selectOption("sum");
    await expect(page.getByTestId("canvas")).toContainText("1,800.00"); // 2*500 + 800 total, formatted

    // 6. change styling of the title
    await page.getByTestId("left-tab-layers").click();
    await page.getByTestId(`layer-${first}`).click();
    await page.getByLabel("Font size").fill("24");
    await page.getByRole("button", { name: "Italic" }).click();
    expect((await doc(page)).sections[0].children[0].style).toMatchObject({ fontSize: 24, italic: true });

    // 7. preview: the real PDF renderer on the server
    await page.getByTestId("mode-preview").click();
    await expect(page.getByTestId("pdf-frame")).toBeVisible();
    await expect(page.getByTestId("pdf-info")).toContainText("1 page");

    // 8. save, reload the page, reopen, and export
    await page.getByTestId("btn-save").click();
    await expect(page.getByTestId("status-pill")).toContainText("draft · v1");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.getByTestId("starter-blank").waitFor();
    await page.keyboard.press("Escape"); // dismiss the welcome gallery
    await page.getByTestId("btn-open").click();
    await page.getByTestId("open-untitled").click();
    await page.getByTestId("mode-design").click();
    await expect(page.getByTestId("canvas")).toContainText("Patient Invoice");
    await expect(page.getByTestId("canvas")).toContainText("Consult");

    await page.getByTestId("btn-export").click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-pdf").click()]);
    const file = path.join(os.tmpdir(), `e2e-${Date.now()}.pdf`);
    await download.saveAs(file);
    expect(fs.readFileSync(file).subarray(0, 5).toString()).toBe("%PDF-");
    const text = pdfText(file);
    expect(text).toContain("Patient Invoice");
    expect(text).toContain("Asha Rao");
    expect(text).toContain("Consult");
    expect(text).toContain("1,800.00");
  });
});

test.describe("editing", () => {
  test("undo, redo, copy, paste, duplicate and delete", async ({ page }) => {
    await startBlank(page);
    await page.getByTestId("palette-text").click();
    await page.getByTestId("value-text").fill("Hello");
    let s = await state(page);
    expect(s.doc.sections[0].children).toHaveLength(1);

    // focus the canvas so shortcuts are not swallowed by the text area
    await page.getByTestId("canvas").click({ position: { x: 5, y: 5 } });
    await page.evaluate(() => (window as any).__designer.getState().select([(window as any).__designer.getState().doc.sections[0].children[0].id]));
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    s = await state(page);
    expect(s.doc.sections[0].children).toHaveLength(2);

    await page.keyboard.press("Control+d");
    expect((await state(page)).doc.sections[0].children).toHaveLength(3);

    await page.keyboard.press("Delete");
    expect((await state(page)).doc.sections[0].children).toHaveLength(2);

    await page.keyboard.press("Control+z");
    expect((await state(page)).doc.sections[0].children).toHaveLength(3);
    await page.keyboard.press("Control+Shift+z");
    expect((await state(page)).doc.sections[0].children).toHaveLength(2);

    await page.getByTestId("btn-undo").click();
    expect((await state(page)).doc.sections[0].children).toHaveLength(3);
  });

  test("drag from the palette, reorder by dragging, and the layer tree stays in sync", async ({ page }) => {
    await startBlank(page);
    await page.getByTestId("palette-text").click();
    await page.getByTestId("palette-line").dragTo(page.getByTestId("page-1"), { targetPosition: { x: 300, y: 300 } });
    let kids = (await doc(page)).sections[0].children.map((c: any) => c.type);
    expect(kids).toEqual(["text", "line"]);

    await page.getByTestId("left-tab-layers").click();
    const textId = (await doc(page)).sections[0].children[0].id;
    const lineId = (await doc(page)).sections[0].children[1].id;
    await page.getByTestId(`layer-${lineId}`).dragTo(page.getByTestId(`layer-${textId}`), { targetPosition: { x: 20, y: 2 } });
    kids = (await doc(page)).sections[0].children.map((c: any) => c.type);
    expect(kids).toEqual(["line", "text"]);
  });

  test("absolute layout: arrow-key nudge, resize handle and alignment", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-absolute-form").click();
    await expect(page.getByTestId("page-1")).toBeVisible();

    const before = (await doc(page)).sections[0].children[0].children.find((c: any) => c.id === "date");
    await page.evaluate(() => (window as any).__designer.getState().select(["date"]));
    await page.getByTestId("canvas").focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Shift+ArrowDown");
    const moved = (await doc(page)).sections[0].children[0].children.find((c: any) => c.id === "date");
    expect(moved.x).toBe(before.x + 1);
    expect(moved.y).toBe(before.y + 10);

    // resize: drag the east handle (wait for the debounced re-render so the handle sits at its new position)
    await page.waitForTimeout(400);
    const handle = page.locator(".handle.e");
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + 5, box.y + 5);
    await page.mouse.down();
    await page.mouse.move(box.x + 5 + 60, box.y + 5, { steps: 6 });
    await page.mouse.up();
    const resized = (await doc(page)).sections[0].children[0].children.find((c: any) => c.id === "date");
    expect(resized.width).toBeGreaterThan(before.width + 30);

    // multi-select + align
    await page.evaluate(() => (window as any).__designer.getState().select(["title", "name", "course"]));
    await page.getByTestId("align-left").click();
    const kids = (await doc(page)).sections[0].children[0].children;
    const xs = ["title", "name", "course"].map((id) => kids.find((c: any) => c.id === id).x);
    expect(new Set(xs).size).toBe(1);
  });

  test("text content: field binding, formula with autocomplete and inline error", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-invoice").click();
    await expect(page.getByTestId("page-1")).toBeVisible();
    await page.evaluate(() => (window as any).__designer.getState().select(["company"]));

    await page.getByTestId("value-mode-formula").click();
    const input = page.getByTestId("formula-input");
    await input.fill('upper(data.invoice.customer.na');
    await expect(page.getByRole("option").first()).toContainText("data.invoice.customer.name");
    await page.keyboard.press("Enter");
    await input.type(")");
    await expect(page.getByTestId("canvas")).toContainText("SAI VARAPRASAD");
    expect((await doc(page)).sections[0].children[0].children[0].expression).toBe("upper(data.invoice.customer.name)");

    await input.fill("1 +");
    await expect(page.getByRole("alert")).toBeVisible();
    // an invalid expression never breaks the canvas: the element shows the error instead
    await expect(page.getByTestId("canvas")).toContainText("⚠");
  });

  test("low-code visibility rule becomes an expression", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-conditional").click();
    await expect(page.getByTestId("page-1")).toBeVisible();
    await page.evaluate(() => (window as any).__designer.getState().select(["attention"]));
    await page.getByRole("button", { name: /Advanced/ }).click();
    await page.getByTestId("visible-when-toggle").check();
    await page.getByTestId("cond-field").selectOption({ index: 0 });
    await page.getByTestId("cond-op").selectOption("gt");
    await page.getByTestId("cond-value").fill("0");
    const c = (await doc(page)).sections[0].children.find((x: any) => x.id === "attention");
    expect(c.visibleWhen).toMatch(/^[\w.]+ > 0$/);
  });
});

test.describe("data, code and problems", () => {
  test("paste sample JSON generates a bound report", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-json").click();
    await page.getByTestId("generate-create").click();
    await expect(page.getByTestId("canvas")).toContainText("Sai Varaprasad");
    await expect(page.getByTestId("canvas")).toContainText("Blood test (CBC)");
    await expect(page.getByTestId("canvas")).toContainText("Items");
  });

  test("code mode edits the same model: JSON change shows in design, and design change shows in JSON", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-receipt").click();
    await page.getByTestId("mode-code").click();
    const area = page.getByTestId("code-textarea");
    const original = await area.inputValue();
    expect(original).toContain("ACME PHARMACY");
    const edited = original.replace("Thank you - get well soon", "Edited from code");
    await area.fill(edited);
    await expect(page.getByTestId("code-status")).toContainText("valid");
    await page.getByTestId("mode-design").click();
    await expect(page.getByTestId("canvas")).toContainText("Edited from code");

    // invalid JSON is reported with a position and does not clobber the design
    await page.getByTestId("mode-code").click();
    await area.fill("{ nope");
    await expect(page.getByTestId("code-status")).toContainText("problem");
    await expect(page.getByRole("alert")).toContainText(/Line \d+/);
    await page.getByTestId("mode-design").click();
    await expect(page.getByTestId("canvas")).toContainText("Edited from code");
  });

  test("Open in Code jumps to the component, and the cursor selects it back on the canvas", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-invoice").click();
    await page.evaluate(() => (window as any).__designer.getState().select(["pay-qr"]));
    await page.getByTestId("open-in-code").click();
    const selected = await page.getByTestId("code-textarea").evaluate((el: HTMLTextAreaElement) => el.value.slice(el.selectionStart, el.selectionEnd));
    expect(selected).toContain('"id": "pay-qr"');

    await page.evaluate(() => (window as any).__designer.getState().select([]));
    await page.getByTestId("code-textarea").evaluate((el: HTMLTextAreaElement) => {
      const i = el.value.indexOf('"id": "items"');
      el.focus();
      el.setSelectionRange(i + 5, i + 5);
    });
    await page.getByTestId("code-textarea").click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.getByTestId("code-textarea").evaluate((el: HTMLTextAreaElement) => {
      const i = el.value.indexOf('"id": "items"');
      el.setSelectionRange(i + 5, i + 5);
      el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect((await state(page)).selection).toEqual(["items"]);
  });

  test("problems panel reports an unknown dataset and clicking it selects the component", async ({ page }) => {
    await startBlank(page);
    await page.getByTestId("palette-table").click();
    await page.getByTestId("table-dataset").selectOption({ index: 0 }).catch(() => {});
    await page.evaluate(() => {
      const s = (window as any).__designer.getState();
      s.patch(s.selection[0], { dataset: "orderss" });
    });
    await expect(page.getByTestId("problem-error").first()).toContainText(/orderss/);
    await page.evaluate(() => (window as any).__designer.getState().select([]));
    await page.getByTestId("problem-error").first().click();
    expect((await state(page)).selection).toHaveLength(1);
  });

  test("command palette: Ctrl+K runs commands", async ({ page }) => {
    await startBlank(page);
    await page.keyboard.press("Control+k");
    await page.getByTestId("palette-input").fill("add qr");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await doc(page)).sections[0].children.map((c: any) => c.type)).toContain("qrcode");

    await page.keyboard.press("Control+k");
    await page.getByTestId("palette-input").fill("landscape");
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await doc(page)).page.orientation).toBe("landscape");
  });
});

test.describe("preview and export formats", () => {
  test("HTML, XLSX grid and CSV previews show the same business values", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-invoice").click();
    await page.getByTestId("mode-preview").click();

    await page.getByTestId("preview-tab-html").click();
    await expect(page.frameLocator('[data-testid="html-frame"]').locator("body")).toContainText("15,340.00");

    await page.getByTestId("preview-tab-xlsx").click();
    await expect(page.getByTestId("xlsx-grid")).toContainText("Progressive Lenses");
    await expect(page.getByTestId("xlsx-grid")).toContainText("6400"); // raw number, not "₹6,400.00"

    await page.getByTestId("preview-tab-csv").click();
    await expect(page.getByTestId("csv-text")).toContainText("Progressive Lenses,2,3200,6400");

    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-csv").click()]);
    const file = path.join(os.tmpdir(), `e2e-${Date.now()}.csv`);
    await dl.saveAs(file);
    expect(fs.readFileSync(file, "utf-8")).toContain("Progressive Lenses,2,3200,6400");
  });

  test("a multi-page statement previews as several pages", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("starter-account-statement").click();
    await expect(page.getByTestId("page-2")).toBeVisible();
    await page.getByTestId("mode-preview").click();
    await expect(page.getByTestId("pdf-info")).toContainText(/[2-9] pages/);
  });
});

test("publish creates an immutable published version", async ({ page }) => {
  await startBlank(page);
  await page.getByTestId("btn-publish").click();
  await expect(page.getByTestId("status-pill")).toContainText("published");
});
