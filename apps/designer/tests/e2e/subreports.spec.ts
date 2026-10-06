import { test, expect } from "@playwright/test";

test("choose a child report file and render it inside the parent report", async ({ page }) => {
  const child = {
    schemaVersion: "1.0",
    id: "shared-letterhead",
    name: "Shared clinic letterhead",
    sections: [{ type: "reportHeader", children: [{ type: "text", value: "NORTHSTAR CLINIC · SHARED HEADER", width: 220, height: 24 }] }],
  };

  await page.goto("/");
  await page.getByTestId("starter-blank").click();
  await page.getByTestId("left-tab-insert").click();
  await page.getByTestId("palette-subreport").click();
  await page.getByTestId("subreport-file").setInputFiles({
    name: "shared-letterhead.report.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(child)),
  });

  await expect(page.getByRole("status")).toContainText("Shared clinic letterhead");
  await expect(page.getByTestId("canvas")).toContainText("NORTHSTAR CLINIC · SHARED HEADER");
  const linked = await page.evaluate(() => {
    const doc = (window as any).__designer.getState().doc;
    const component = doc.sections.flatMap((section: any) => section.children).find((item: any) => item.type === "subreport");
    return { reportId: component?.reportId, attached: doc.subreports?.[component?.reportId]?.name };
  });
  expect(linked).toEqual({ reportId: "shared-letterhead", attached: "Shared clinic letterhead" });

  await page.getByTestId("mode-preview").click();
  await expect(page.getByTestId("pdf-frame")).toBeVisible();
  await expect(page.getByTestId("pdf-info")).toContainText("1 page");
});
