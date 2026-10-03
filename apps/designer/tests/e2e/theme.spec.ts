import { test, expect, type Page } from "@playwright/test";

const doc = (page: Page) => page.evaluate(() => (window as any).__designer.getState().doc);

async function openTheme(page: Page) {
  await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
  await page.keyboard.type("theme");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("theme-dialog")).toBeVisible();
}

test("a theme colour and text style are created, applied, renamed and deleted through the UI", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate(() => {
    const store = (window as any).__designer.getState();
    store.loadDoc({ ...store.doc, id: "themed", sections: [{ type: "detail", children: [
      { type: "text", id: "heading", value: "Quarterly results" },
      { type: "text", id: "note", value: "Big note", style: { fontSize: 14, fontWeight: "bold", background: "#eeeeee" } },
    ] }] });
  });

  await openTheme(page);
  await page.getByTestId("theme-add").click();
  const colour = page.getByTestId("theme-row-colour-1");
  await colour.getByLabel("colour name").fill("brand");
  await colour.getByLabel("colour name").press("Enter");
  await page.getByTestId("theme-row-brand").getByLabel("brand colour value").fill("#b91c1c");

  await page.getByTestId("theme-tab-textStyles").click();
  await page.getByTestId("theme-add").click();
  const style = page.getByTestId("theme-row-style-1");
  await style.getByLabel("text style name").fill("title");
  await style.getByLabel("text style name").press("Enter");
  const title = page.getByTestId("theme-row-title");
  await title.getByLabel("Text style colour").selectOption("$brand");
  await title.getByLabel("Text style weight").selectOption("bold");
  await expect(page.getByTestId("theme-preview-title")).toHaveCSS("color", "rgb(185, 28, 28)");
  await page.getByTestId("theme-done").click();

  await page.evaluate(() => (window as any).__designer.getState().select(["heading"]));
  await page.getByTestId("properties").getByRole("tab", { name: "Style" }).click();
  await page.getByTestId("text-style").selectOption("title");
  const heading = page.getByTestId("canvas").getByText("Quarterly results");
  await expect(heading).toHaveCSS("color", "rgb(185, 28, 28)");
  expect(Number(await heading.evaluate((el) => getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(600);

  // Renaming the token keeps every reference working.
  await openTheme(page);
  const brand = page.getByTestId("theme-row-brand");
  await expect(brand).toContainText("1 use");
  await brand.getByLabel("colour name").fill("accent");
  await brand.getByLabel("colour name").press("Enter");
  expect((await doc(page)).theme.textStyles.title.color).toBe("$accent");
  await expect(heading).toHaveCSS("color", "rgb(185, 28, 28)");

  // Deleting a used token asks first, then the dangling reference is reported.
  await page.getByTestId("theme-row-accent").getByRole("button", { name: "Delete accent" }).click();
  await page.getByTestId("theme-row-accent").getByRole("button", { name: "Confirm delete accent" }).click();
  await page.getByTestId("theme-done").click();
  await expect(page.getByTestId("problem-counts")).toContainText("1 error");
  await page.getByTestId("toggle-problems").click();
  await expect(page.getByTestId("problems")).toContainText("$accent is not a colour token in the theme");
});

test("a component's formatting can be saved as a reusable text style", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate(() => {
    const store = (window as any).__designer.getState();
    store.loadDoc({ ...store.doc, id: "save-style", sections: [{ type: "detail", children: [
      { type: "text", id: "note", value: "Big note", style: { fontSize: 14, fontWeight: "bold", background: "#eeeeee" } },
    ] }] });
    store.select(["note"]);
  });
  await page.getByTestId("properties").getByRole("tab", { name: "Style" }).click();
  page.once("dialog", (dialog) => dialog.accept("callout"));
  await page.getByTestId("save-text-style").click();
  const saved = await doc(page);
  expect(saved.theme.textStyles.callout).toEqual({ fontSize: 14, fontWeight: "bold" });
  expect(saved.sections[0].children[0]).toMatchObject({ textStyle: "callout", style: { background: "#eeeeee" } });
  await expect(page.getByTestId("canvas").getByText("Big note")).toHaveCSS("font-size", /px/);
});
