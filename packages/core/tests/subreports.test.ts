import { describe, expect, it } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, InlineDataSource, resolveReport, validateReport } from "../src/index.js";

const registry = new DataSourceRegistry();
registry.register(new InlineDataSource());

function parsed(value: unknown) {
  const result = parseReportDefinition(value);
  if (!result.valid) throw new Error(JSON.stringify(result.issues));
  return result.report;
}

const child = parsed({
  schemaVersion: "1.0", id: "receipt-lines", name: "Receipt lines",
  parameters: [{ id: "prefix", type: "string", required: true }],
  datasets: [{ id: "main", source: "inline", query: { data: [] } }],
  variables: [{ id: "total", scope: "row", expression: "(vars.total ?? 0) + row.amount" }],
  sections: [
    { type: "pageHeader", children: [{ type: "text", value: "Lines" }] },
    { type: "detail", dataset: "main", children: [{ type: "text", expression: "params.prefix + row.item" }] },
    { type: "reportFooter", children: [{ type: "text", expression: "vars.total" }] },
  ],
});

const parent = parsed({
  schemaVersion: "1.0", id: "receipt", name: "Receipt",
  datasets: [{ id: "orders", source: "inline", query: { data: [
    { prefix: "A-", lines: [{ item: "one", amount: 2 }, { item: "two", amount: 3 }] },
    { prefix: "B-", lines: [{ item: "three", amount: 4 }] },
  ] } }],
  sections: [{ type: "detail", dataset: "orders", children: [{
    type: "subreport", id: "lines", reportId: "receipt-lines", dataset: "row.lines",
    parameters: { prefix: { expression: "row.prefix" } },
  }] }],
});

const texts = (components: any[]): string[] => components.flatMap((component) =>
  component.type === "text" ? [component.text] : texts(component.children ?? []));

describe("nested report rendering", () => {
  it("binds each parent row to the child dataset and parameters", async () => {
    const output = await resolveReport(parent, { registry, subreports: { "receipt-lines": { report: child } } });
    const body = output.resolved.sections.find((section) => section.type === "body")!;
    expect(texts(body.children)).toEqual(["Lines", "A-one", "A-two", "5", "Lines", "B-three", "4"]);
    expect(output.resolved.warnings.map((warning) => warning.code)).not.toContain("SUBREPORT_PAGINATION_APPROXIMATE");
    expect(output.resolved.warnings.map((warning) => warning.code)).not.toContain("SUBREPORT_NOT_RENDERED");
  });

  it("resolves child page footers and backgrounds without approximation warnings", async () => {
    const withPageFooter = parsed({
      ...child,
      sections: child.sections.map((section) => section.type === "pageHeader" ? { ...section, type: "pageFooter" } : section),
    });
    const output = await resolveReport(parent, { registry, subreports: { "receipt-lines": { report: withPageFooter } } });
    expect(output.resolved.warnings.map((warning) => warning.code)).not.toContain("SUBREPORT_PAGINATION_APPROXIMATE");
    expect(output.resolved.warnings.map((warning) => warning.code)).not.toContain("SUBREPORT_BACKGROUND_UNSUPPORTED");
  });

  it("keeps missing child data visible and reports it", async () => {
    const withoutBinding = parsed({ ...parent, sections: [{ type: "detail", dataset: "orders", children: [{ type: "subreport", reportId: "receipt-lines" }] }] });
    const output = await resolveReport(withoutBinding, { registry, subreports: { "receipt-lines": { report: child } } });
    const body = output.resolved.sections.find((section) => section.type === "body")!;
    expect(texts(body.children)).toContain("[Subreport receipt-lines: child dataset \"main\" has no supplied data]");
    expect(output.resolved.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "SUBREPORT_NOT_RENDERED" })]));
  });

  it("detects a nested report cycle at runtime", async () => {
    const cyclic = parsed({ ...child, sections: [{ type: "reportHeader", children: [{ type: "subreport", reportId: "receipt-lines" }] }] });
    const output = await resolveReport(parent, { registry, subreports: { "receipt-lines": { report: cyclic, data: { main: [] } } } });
    expect(output.resolved.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "SUBREPORT_NOT_RENDERED", message: expect.stringContaining("cycle") })]));
  });

  it("accepts a subreport dataset bound to a parent parameter array", () => {
    const withParameterData = parsed({ ...parent, sections: [{ type: "reportHeader", children: [
      { type: "subreport", reportId: "receipt-lines", dataset: "params.lines" },
    ] }] });
    expect(validateReport(withParameterData).valid).toBe(true);
  });
});
