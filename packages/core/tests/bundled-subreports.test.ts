import { describe, expect, it } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, InlineDataSource, resolveReport } from "../src/index.js";

const registry = new DataSourceRegistry();
registry.register(new InlineDataSource());
const report = (id: string, children: unknown[], subreports?: Record<string, unknown>) => {
  const parsed = parseReportDefinition({ schemaVersion: "1.0", id, name: id, datasets: [], sections: [{ type: "detail", children }], subreports });
  if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
  return parsed.report;
};
const text = (value: string) => ({ type: "text", value });

describe("bundled subreports", () => {
  it("renders nested definitions saved in one exported JSON file", async () => {
    const seal = report("seal", [text("Client seal")]);
    const header = report("header", [text("Shared client header"), { type: "subreport", reportId: "seal" }], { seal });
    const parent = report("invoice", [{ type: "subreport", reportId: "header" }, text("Invoice body")], { header });
    const result = await resolveReport(parent, { registry });
    expect(JSON.stringify(result.resolved.sections)).toContain("Shared client header");
    expect(JSON.stringify(result.resolved.sections)).toContain("Client seal");
    expect(result.resolved.warnings).toEqual([]);
  });
  it("lets explicit request resources override bundled definitions", async () => {
    const parent = report("invoice", [{ type: "subreport", reportId: "header" }], { header: report("header", [text("Bundled")]) });
    const result = await resolveReport(parent, { registry, subreports: { header: { report: report("header", [text("Tenant override")]) } } });
    expect(JSON.stringify(result.resolved.sections)).toContain("Tenant override");
    expect(JSON.stringify(result.resolved.sections)).not.toContain('"text":"Bundled"');
  });
  it("rejects an invalid bundled definition with the resource name", async () => {
    const parent = report("invoice", [], { broken: { id: "broken" } });
    await expect(resolveReport(parent, { registry })).rejects.toThrow('Bundled subreport "broken" is invalid');
  });
});
