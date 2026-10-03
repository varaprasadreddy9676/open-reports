import { test, expect } from "@playwright/test";

test("a strict dataset contract is saved and reported as an error", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.getByTestId("left-tab-data").click();
  await page.getByTestId("add-dataset").click();
  await page.getByTestId("dataset-id").fill("items");
  await page.getByTestId("dataset-json").fill(JSON.stringify([{ name: "Flour", quantity: 2 }, { name: "Rice", quantity: "3" }]));
  await page.getByTestId("schema-add-field").click();
  await page.getByRole("textbox", { name: "Field 1 path" }).fill("quantity");
  await page.getByRole("combobox", { name: "Field 1 type" }).selectOption("number");
  await page.getByTestId("dataset-on-mismatch").selectOption("error");
  await page.getByTestId("dataset-test").click();
  await expect(page.getByTestId("dataset-schema-check")).toContainText("1 schema mismatch");
  await page.getByTestId("dataset-save").click();
  const schema = await page.evaluate(() => (window as any).__designer.getState().doc.datasets.find((d: any) => d.id === "items").schema);
  expect(schema).toEqual({ kind: "array", fields: [{ path: "quantity", kind: "number" }], onMismatch: "error" });
  await expect(page.getByTestId("problem-counts")).toContainText("1 error");
  await page.getByTestId("toggle-problems").click();
  await expect(page.getByTestId("problems")).toContainText("quantity: expected number, got string at row 2");
});
