import { test, expect, type Page } from "@playwright/test";

const state = (page: Page) => page.evaluate(() => (window as any).__designer.getState());
const doc = async (page: Page) => (await state(page)).doc;

async function saveSelectionAsBlock(page: Page, name: string, notes?: string) {
  await page.getByTestId("left-tab-insert").click();
  await page.getByTestId("save-block").click();
  await page.getByTestId("block-name").fill(name);
  if (notes) await page.getByTestId("block-notes").fill(notes);
  await page.getByTestId("block-save").click();
}

const setSource = (page: Page, value: string) => page.evaluate((value) => {
  const store = (window as any).__designer.getState();
  store.patch("source", { value });
  store.select(["source"]);
}, value);

test("a library block is linked, versioned, pinned, updated and detached", async ({ page }) => {
  const name = `Letterhead ${Date.now()}`;
  const blockId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.evaluate(() => {
    const store = (window as any).__designer.getState();
    store.loadDoc({ ...store.doc, id: "blocks", sections: [{ type: "detail", children: [{ type: "text", id: "source", value: "LETTERHEAD V1" }, { type: "text", id: "body", value: "Body" }] }] });
    store.select(["source"]);
  });
  await saveSelectionAsBlock(page, name);
  await expect(page.getByTestId(`block-${blockId}`)).toContainText("v1");

  await page.evaluate(() => (window as any).__designer.getState().select(["body"]));
  await page.getByTestId("block-insert-mode").selectOption("linked");
  await page.getByTestId(`block-${blockId}`).click();
  let current = await doc(page);
  expect(current.fragments).toEqual([expect.objectContaining({ source: { block: blockId, version: 1, mode: "linked" } })]);
  const fragmentComponent = (await state(page)).selection[0];
  await expect(page.getByTestId("canvas")).toContainText("LETTERHEAD V1");

  // A new version reaches the linked copy without any action in this report.
  await setSource(page, "LETTERHEAD V2");
  await page.getByTestId("left-tab-insert").click();
  await page.getByTestId("save-block").click();
  await page.getByTestId("block-name").fill(name);
  await expect(page.getByTestId("block-version-hint")).toContainText("Saves version 2");
  await page.getByTestId("block-notes").fill("New address");
  await page.getByTestId("block-save").click();
  await expect.poll(async () => (await doc(page)).fragments[0].source.version).toBe(2);
  expect((await doc(page)).fragments[0].children[0].value).toBe("LETTERHEAD V2");

  await page.evaluate((id) => (window as any).__designer.getState().select([id]), fragmentComponent);
  await expect(page.getByTestId("fragment-status")).toContainText("linked, version 2");
  await page.getByText("Version history").click();
  await expect(page.getByTestId("fragment-history")).toContainText("v2 (in this report)");
  await expect(page.getByTestId("fragment-history")).toContainText("New address");

  // Pinned copies stay on their version until updated.
  await page.getByTestId("fragment-pin").click();
  await setSource(page, "LETTERHEAD V3");
  await saveSelectionAsBlock(page, name);
  await expect.poll(async () => (await state(page)).blocks.find((b: any) => b.id === blockId)?.version).toBe(3);
  current = await doc(page);
  expect(current.fragments[0]).toMatchObject({ source: { version: 2, mode: "pinned" }, children: [{ value: "LETTERHEAD V2" }] });
  await page.evaluate((id) => (window as any).__designer.getState().select([id]), fragmentComponent);
  await expect(page.getByTestId("fragment-status")).toContainText("version 3 available");
  await page.getByTestId("fragment-update").click();
  expect((await doc(page)).fragments[0]).toMatchObject({ source: { version: 3, mode: "pinned" }, children: [{ value: "LETTERHEAD V3" }] });

  // Detaching makes ordinary components that can be edited in this report only.
  await page.getByTestId("fragment-detach").click();
  current = await doc(page);
  expect(current.fragments).toEqual([]);
  const detachedId = (await state(page)).selection[0];
  expect(current.sections[0].children.find((c: any) => c.id === detachedId)).toMatchObject({ type: "text", value: "LETTERHEAD V3" });
});
