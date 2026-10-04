import { test, expect, type Page } from "@playwright/test";

const doc = (page: Page) => page.evaluate(() => (window as any).__designer.getState().doc);
const pageHeight = (page: Page) => page.evaluate(() => (window as any).__designer.getState().engine.paginated.pageSize.height);

async function openPrintSettings(page: Page) {
  await page.getByTestId("starter-blank").click();
  await page.locator('[data-page="0"]').click({ position: { x: 8, y: 8 } });
  await page.getByTestId("report-tab-print").click();
}

test("a roll preset makes the page as long as its content, with min and max lengths", async ({ page }) => {
  await page.goto("/");
  await openPrintSettings(page);
  await page.getByTestId("print-preset").selectOption({ label: "Continuous label roll 100 mm (ZPL, up to 600 mm)" });
  expect((await doc(page)).page).toMatchObject({ width: 100, continuous: { maxLength: 600 } });
  await expect(page.getByTestId("page-continuous")).toBeChecked();

  await page.evaluate(() => {
    const store = (window as any).__designer.getState();
    store.setDoc({ ...store.doc, sections: [{ type: "detail", children: Array.from({ length: 4 }, (_, i) => ({ type: "text", value: `Line ${i + 1}` })) }] });
  });
  await expect.poll(() => pageHeight(page)).toBeLessThan(150);
  const short = await pageHeight(page);
  await page.evaluate(() => {
    const store = (window as any).__designer.getState();
    store.setDoc({ ...store.doc, sections: [{ type: "detail", children: Array.from({ length: 50 }, (_, i) => ({ type: "text", value: `Line ${i + 1}` })) }] });
  });
  await expect.poll(() => pageHeight(page)).toBeGreaterThan(short + 300);
  expect(await page.evaluate(() => (window as any).__designer.getState().engine.paginated.pages.length)).toBe(1);

  await page.getByLabel("Minimum length").fill("1000");
  await page.getByLabel("Minimum length").blur();
  await expect.poll(() => pageHeight(page)).toBeCloseTo((600 / 25.4) * 72, 0);

  // Switching back to a fixed-size preset drops the continuous setting.
  await page.getByTestId("print-preset").selectOption({ label: "Label 50 × 30 mm (ZPL 203 dpi)" });
  expect((await doc(page)).page.continuous).toBeUndefined();
  await expect(page.getByTestId("page-continuous")).not.toBeChecked();
});

test("a wristband preset prints rotated, and rotation can be changed", async ({ page }) => {
  await page.goto("/");
  await openPrintSettings(page);
  await page.getByTestId("print-preset").selectOption({ label: "Wristband 254 × 25 mm (ZPL 300 dpi, printed rotated)" });
  await expect(page.getByTestId("print-rotation")).toHaveValue("90");
  expect((await doc(page)).print).toMatchObject({ printerType: "wristband", rotation: 90 });
  await page.getByTestId("print-rotation").selectOption("0");
  expect((await doc(page)).print.rotation).toBeUndefined();
  await expect(page.getByTestId("print-preset")).toHaveValue("");
});
