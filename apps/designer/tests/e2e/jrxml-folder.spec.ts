import { test, expect } from "@playwright/test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const report = (name: string, body = "") => `<?xml version="1.0"?>
<jasperReport name="${name}" pageWidth="595" pageHeight="842" leftMargin="20" rightMargin="20" topMargin="20" bottomMargin="20">
  <detail><band height="30">${body || `<staticText><reportElement x="10" y="0" width="100" height="20"/><text>${name}</text></staticText>`}</band></detail>
</jasperReport>`;

let fixtureRoot: string;
test.beforeAll(() => {
  fixtureRoot = mkdtempSync(path.join(tmpdir(), "jrxml-folder-e2e-"));
  const small = path.join(fixtureRoot, "small");
  mkdirSync(small);
  writeFileSync(path.join(small, "parent.jrxml"), report("Parent", `<subreport><reportElement x="10" y="0" width="100" height="20"/><subreportExpression><![CDATA["header.jasper"]]></subreportExpression></subreport>`));
  writeFileSync(path.join(small, "header.jrxml"), report("Header"));
  writeFileSync(path.join(small, "notes.txt"), "Ignored by JRXML import");
  const large = path.join(fixtureRoot, "large");
  mkdirSync(large);
  for (let index = 0; index < 5000; index++) writeFileSync(path.join(large, `report-${index}.jrxml`), report(`Report ${index}`));
  const medium = path.join(fixtureRoot, "medium");
  mkdirSync(medium);
  for (let index = 0; index < 8; index++) writeFileSync(path.join(medium, `report-${index}.jrxml`), report(`Report ${index}`));
});
test.afterAll(() => rmSync(fixtureRoot, { recursive: true, force: true }));

test("converts a folder, links children, and saves editable drafts", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByTestId("starter-jrxml").click();
  await page.getByRole("button", { name: "Folder", exact: true }).click();
  await page.getByTestId("jrxml-folder").setInputFiles(path.join(fixtureRoot, "small"));
  const review = page.getByTestId("jrxml-folder-review");
  await expect(review).toContainText("2 drafts ready");
  await expect(review).toContainText("1 other files skipped");
  await page.screenshot({ path: testInfo.outputPath("jrxml-folder-review.png") });
  await page.getByTestId("save-jrxml-folder").click();
  await expect(page.getByText("2 drafts saved. Open any draft to review its migration issues.")).toBeVisible();
  await page.getByRole("searchbox", { name: "Find JRXML file" }).fill("parent");
  await expect(review.locator(".migration-row")).toHaveCount(1);
  await review.locator(".migration-row").getByRole("button", { name: "Open" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__designer.getState().doc.name)).toBe("Parent");
  const childId = await page.evaluate(() => {
    const doc = (window as any).__designer.getState().doc;
    return doc.sections.flatMap((section: any) => section.children).find((component: any) => component.type === "subreport")?.reportId;
  });
  expect(childId).toMatch(/^jrxml-.*-header$/);
});

test("stops saving after the current batch and retries remaining drafts", async ({ page }) => {
  await page.route("**/api/v1/templates", async (route) => {
    if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.continue();
  });
  await page.goto("/");
  await page.getByTestId("starter-jrxml").click();
  await page.getByRole("button", { name: "Folder", exact: true }).click();
  await page.getByTestId("jrxml-folder").setInputFiles(path.join(fixtureRoot, "medium"));
  await expect(page.getByTestId("jrxml-folder-review")).toContainText("8 drafts ready");
  await page.getByTestId("save-jrxml-folder").click();
  await expect(page.getByTestId("jrxml-folder-progress")).toContainText("Saving drafts");
  await page.getByRole("button", { name: "Stop saving" }).click();
  await expect(page.getByText("Saving stopped. 4 drafts are saved; you can retry the rest.")).toBeVisible();
  await page.getByTestId("save-jrxml-folder").click();
  await expect(page.getByText("8 drafts saved. Open any draft to review its migration issues.")).toBeVisible();
});

test("shows live progress and can cancel a large folder conversion", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-jrxml").click();
  await page.getByRole("button", { name: "Folder", exact: true }).click();
  await page.getByTestId("jrxml-folder").setInputFiles(path.join(fixtureRoot, "large"));
  const progress = page.getByTestId("jrxml-folder-progress");
  await expect(progress).toBeVisible();
  await expect(progress).toContainText("Converting reports");
  await expect(progress).toContainText("5000");
  await expect(progress).toContainText(/About \d+ (sec|min) left/);
  await page.getByRole("button", { name: "Cancel conversion" }).click();
  await expect(page.getByText("Conversion cancelled. No drafts were saved.")).toBeVisible();
  await expect(progress).toHaveCount(0);
});
