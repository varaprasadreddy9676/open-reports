import { expect, test } from "@playwright/test";

const sales = [
  { region: "North", month: "Jan", amount: 100 },
  { region: "North", month: "Feb", amount: 150 },
  { region: "South", month: "Jan", amount: 80 },
  { region: "South", month: "Mar", amount: 60 },
];

test("a crosstab built from the palette fills itself from the chosen data and shows totals", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate((data) => {
    const s = (window as any).__designer.getState();
    s.loadDoc({ ...s.doc, id: "pivot-ui", datasets: [{ id: "sales", source: "inline", query: { data } }], sections: [{ type: "detail", children: [] }] });
    s.set({ canvasView: "pages", leftOpen: true, leftTab: "insert", rightOpen: true });
  }, sales);
  await page.getByTestId("palette-crosstab").click();
  const properties = page.getByTestId("properties");
  await properties.getByLabel("Crosstab dataset").selectOption("sales");

  const canvas = page.getByTestId("page-1");
  for (const text of ["Region", "Jan", "Feb", "Mar", "North", "South", "Total", "390"]) await expect(canvas).toContainText(text);

  await properties.getByLabel("Value 1 calculation").selectOption("count");
  await expect(canvas).toContainText("4");
  await properties.getByLabel("Total row").uncheck();
  await expect.poll(async () => page.evaluate(() => (window as any).__designer.getState().doc.sections[0].children[0].totalRow)).toBe(false);
});
