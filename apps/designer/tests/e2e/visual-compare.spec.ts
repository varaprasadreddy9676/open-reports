import { test, expect } from "@playwright/test";

test("comparing versions visually highlights the pages and regions that changed", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate(() => {
    const store = (window as any).__designer.getState();
    store.loadDoc({ ...store.doc, id: `visual-compare-${Date.now()}`, name: "Visual compare", sections: [{ type: "detail", children: [
      { type: "text", id: "title", value: "Quarterly statement", style: { fontSize: 18 } },
      { type: "text", id: "note", value: "Unchanged line" },
    ] }] });
  });
  await page.getByTestId("btn-save").click();
  await expect.poll(() => page.evaluate(() => (window as any).__designer.getState().meta.id)).toBeTruthy();
  await page.evaluate(() => (window as any).__designer.getState().patch("title", { value: "Annual statement", style: { fontSize: 18, color: "#b91c1c" } }));

  await page.getByTestId("btn-more").click();
  await page.getByRole("menuitem", { name: "Compare versions…" }).click();
  await expect(page.getByTestId("compare-from")).toHaveValue("1");
  await page.getByTestId("compare-view-visual").click();
  await page.getByTestId("visual-compare-run").click();
  await expect(page.getByTestId("visual-compare-summary")).toContainText("1 of 1 page differ: page 1", { timeout: 30_000 });
  await expect(page.getByTestId("visual-page-1")).toContainText("changed");
  await expect(page.getByTestId("visual-diff-1")).toBeVisible();
  expect(await page.getByTestId("visual-diff-1").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(400);

  await page.getByTestId("compare-to").selectOption("1");
  await page.getByTestId("visual-compare-run").click();
  await expect(page.getByTestId("visual-compare-summary")).toHaveText("No visual differences across 1 page.", { timeout: 30_000 });
});
