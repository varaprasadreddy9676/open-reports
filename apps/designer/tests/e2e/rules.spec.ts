import { test, expect, type Page } from "@playwright/test";

async function load(page: Page, sections: unknown[]) {
  await page.evaluate((sections) => {
    const store = (window as any).__designer.getState();
    store.loadDoc({ ...store.doc, id: "rules", parameters: [{ id: "patientType", type: "string", default: "OP" }], sections });
  }, sections);
}

const ruled = [{ type: "detail", children: [
  { type: "text", id: "ip-only", value: "INPATIENT-ONLY", rules: [{ when: "params.patientType != 'IP'", set: { visible: false } }] },
  { type: "text", id: "badge", value: "placeholder", rules: [{ when: { field: "params.patientType", op: "==", value: "OP" }, set: { value: "OUTPATIENT-BADGE", "style.color": "#b91c1c" } }] },
] }];

test("conditional rules apply on the design canvas and in the real PDF, and invalid rules are reported", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await load(page, ruled);

  const canvas = page.getByTestId("canvas");
  await expect(canvas).toContainText("OUTPATIENT-BADGE");
  await expect(canvas).not.toContainText("INPATIENT-ONLY");
  await expect(canvas).not.toContainText("placeholder");
  expect(await canvas.getByText("OUTPATIENT-BADGE").evaluate((element) => getComputedStyle(element).color)).toBe("rgb(185, 28, 28)");

  await page.getByTestId("mode-preview").click();
  const textLayer = page.getByTestId("pdf-frame").locator('.page[data-page-number="1"] .textLayer');
  await expect(textLayer).toContainText("OUTPATIENT-BADGE");
  await expect(textLayer).not.toContainText("INPATIENT-ONLY");

  await page.getByTestId("mode-design").click();
  await load(page, [{ type: "detail", children: [{ type: "text", id: "typo", value: "x", rules: [{ when: "true", set: { "style.colr": "#b91c1c" } }] }] }]);
  await page.getByTestId("toggle-problems").click();
  await expect(page.getByTestId("problems")).toContainText('"style.colr" is not a property of this text component');
});
