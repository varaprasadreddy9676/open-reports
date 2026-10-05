import { expect, test } from "@playwright/test";

test("the canvas data switcher shows how pagination reacts to different data, without touching the report", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-account-statement").click();
  const switcher = page.getByTestId("canvas-scenario");
  await expect(switcher).toContainText("Data: Sample data");
  await expect(switcher).toContainText(/pages/);
  const sampleBefore = await page.evaluate(() => JSON.stringify((window as any).__designer.getState().sample));
  const samplePages = await page.evaluate(() => (window as any).__designer.getState().engine.paginated.pages.length);

  await switcher.getByRole("button", { name: /Data:/ }).click();
  await page.getByTestId("scenario-empty").click();
  await expect(switcher).toContainText("Data: No rows");
  await expect(switcher).toContainText("· 1 page");

  await switcher.getByRole("button", { name: /Data:/ }).click();
  await page.getByTestId("scenario-many").click();
  await expect.poll(async () => page.evaluate(() => (window as any).__designer.getState().engine.paginated?.pages.length)).toBeGreaterThan(samplePages);

  // The scenario never leaks into the report's own sample data.
  expect(await page.evaluate(() => JSON.stringify((window as any).__designer.getState().sample))).toBe(sampleBefore);
  await switcher.getByRole("button", { name: "Back to sample data" }).click();
  await expect(switcher).toContainText("Data: Sample data");
});

test("page starts and their reasons are on the canvas without opening the pagination panel", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-account-statement").click();
  const marker = page.getByTestId("page-break-2");
  await expect(marker).toBeVisible();
  await marker.getByRole("button", { name: /Why/ }).click();
  await expect(page.getByTestId("page-break-details")).toBeVisible();
});

test("arrow keys inside the data menu move through the menu, not the selected element", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-account-statement").click();
  await expect(page.getByTestId("canvas-scenario")).toBeVisible();
  const id = await page.evaluate(() => {
    const s = (window as any).__designer.getState();
    const first = s.doc.sections.flatMap((section: any) => section.children ?? [])[0];
    s.select([first.id]);
    return first.id;
  });
  const before = await page.evaluate(() => JSON.stringify((window as any).__designer.getState().doc));
  await page.getByTestId("canvas-scenario").getByRole("button", { name: /Data:/ }).click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByTestId("scenario-one")).toBeFocused();
  expect(await page.evaluate(() => JSON.stringify((window as any).__designer.getState().doc))).toBe(before);
  expect(await page.evaluate(() => (window as any).__designer.getState().selection)).toEqual([id]);
});
