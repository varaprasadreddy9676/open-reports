import { test, expect } from "@playwright/test";

const source = `<?xml version="1.0"?>
<jasperReport name="Migration Pilot" pageWidth="595" pageHeight="842" leftMargin="20" rightMargin="20" topMargin="20" bottomMargin="20">
  <field name="patient" class="java.lang.String"/>
  <title><band height="30"><staticText><reportElement x="10" y="0" width="150" height="20"/><text>Pilot heading</text></staticText></band></title>
  <detail><band height="30"><textField><reportElement x="10" y="0" width="150" height="20"/><textFieldExpression><![CDATA[$F{patient}]]></textFieldExpression></textField><subreport><reportElement x="180" y="0" width="120" height="20"/><subreportExpression><![CDATA["header.jasper"]]></subreportExpression></subreport></band></detail>
</jasperReport>`;

test("imports a JRXML draft and keeps navigable migration issues", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("starter-jrxml").click();
  await page.getByTestId("jrxml-file").setInputFiles({ name: "pilot.jrxml", mimeType: "application/xml", buffer: Buffer.from(source) });
  await expect(page.getByTestId("jrxml-review")).toContainText("need review");
  await page.getByTestId("apply-jrxml").click();
  await expect(page.getByTestId("migration-panel")).toBeVisible();
  await expect(page.getByTestId("migration-panel")).toContainText("subreport");
  const state = await page.evaluate(() => {
    const s = (window as any).__designer.getState();
    return { name: s.doc.name, migration: s.doc.migration, sections: s.doc.sections };
  });
  expect(state.name).toBe("Migration Pilot");
  expect(state.sections.map((section: any) => section.type)).toEqual(["reportHeader", "detail"]);
  expect(state.migration.issues).toEqual(expect.arrayContaining([expect.objectContaining({ feature: "subreport", status: "needs-review" })]));
  await page.getByTestId("migration-issue").filter({ hasText: "subreport" }).click();
  const selected = await page.evaluate(() => (window as any).__designer.getState().selection);
  expect(selected).toEqual([state.migration.issues.find((issue: any) => issue.feature === "subreport").targetId]);
  const selectedComponent = await page.evaluate(() => (window as any).__designer.getState().doc.sections[1].children[1]);
  expect(selectedComponent).toMatchObject({ type: "subreport", reportId: "header" });

  await page.getByTestId("btn-save").click();
  await expect(page.getByTestId("save-state")).toContainText("Saved");
  const savedId = await page.evaluate(() => (window as any).__designer.getState().meta.id);
  expect(savedId).toBeTruthy();
  await page.evaluate(async (id) => (window as any).__designer.getState().openTemplate(id), savedId);
  await expect(page.getByTestId("migration-panel")).toContainText("subreport");
  const persisted = await page.evaluate(() => (window as any).__designer.getState().doc.migration);
  expect(persisted.issues).toEqual(expect.arrayContaining([expect.objectContaining({ feature: "subreport", status: "needs-review" })]));
});
