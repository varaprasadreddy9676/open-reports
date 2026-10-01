import { describe, it, expect } from "vitest";
import { parseReportDefinition, type ReportDefinition } from "@reporting/schema";
import { validateReport } from "../src/validator.js";

function parse(doc: unknown): ReportDefinition {
  const result = parseReportDefinition(doc);
  if (!result.valid) throw new Error("fixture expected to be schema-valid: " + JSON.stringify(result.issues));
  return result.report;
}

const base = {
  schemaVersion: "1.0",
  id: "r",
  name: "R",
  datasets: [{ id: "items", source: "inline", query: { data: [] } }],
};

describe("validateReport", () => {
  it("flags a reference to a dataset that does not exist, with a suggestion", () => {
    const report = parse({
      ...base,
      sections: [{ type: "detail", children: [{ type: "table", dataset: "orderss", columns: [] }] }],
    });
    const result = validateReport(report);
    expect(result.valid).toBe(false);
    const issue = result.issues.find((i) => i.code === "UNKNOWN_DATASET");
    expect(issue).toBeTruthy();
  });

  it("flags duplicate component ids", () => {
    const report = parse({
      ...base,
      sections: [
        {
          type: "detail",
          children: [
            { type: "text", id: "title", value: "a" },
            { type: "container", children: [{ type: "text", id: "title", value: "b" }] },
          ],
        },
      ],
    });
    const result = validateReport(report);
    expect(result.issues.some((i) => i.code === "DUPLICATE_ID")).toBe(true);
  });

  it("flags duplicate dataset ids", () => {
    const report = parse({
      ...base,
      datasets: [
        { id: "items", source: "inline", query: {} },
        { id: "items", source: "inline", query: {} },
      ],
      sections: [],
    });
    const result = validateReport(report);
    expect(result.issues.some((i) => i.code === "DUPLICATE_ID")).toBe(true);
  });

  it("flags malformed expressions with a clear message", () => {
    const report = parse({
      ...base,
      sections: [{ type: "detail", children: [{ type: "text", expression: "1 + " }] }],
    });
    const result = validateReport(report);
    expect(result.issues.some((i) => i.code === "INVALID_EXPRESSION")).toBe(true);
  });

  it("detects a circular subreport chain", () => {
    const reportA = parse({ ...base, id: "a", sections: [{ type: "detail", children: [{ type: "subreport", reportId: "b" }] }] });
    const reportB = parse({ ...base, id: "b", sections: [{ type: "detail", children: [{ type: "subreport", reportId: "a" }] }] });

    const registry: Record<string, ReportDefinition> = { a: reportA, b: reportB };
    const result = validateReport(reportA, { resolveReport: (id) => registry[id] });
    expect(result.issues.some((i) => i.code === "CIRCULAR_SUBREPORT")).toBe(true);
  });

  it("warns when a component is unsupported by a target renderer", () => {
    const report = parse({
      ...base,
      sections: [{ type: "detail", children: [{ type: "chart", chartType: "bar", series: [] }] }],
    });
    const result = validateReport(report, { targetRenderers: [{ id: "csv", supports: ["table", "text"] }] });
    const warning = result.issues.find((i) => i.code === "UNSUPPORTED_RENDERER_FEATURE");
    expect(warning).toBeTruthy();
    expect(warning?.severity).toBe("warning");
    expect(result.valid).toBe(true); // warnings alone don't invalidate
  });

  it("accepts a well-formed report with no issues", () => {
    const report = parse({
      ...base,
      sections: [{ type: "detail", children: [{ type: "table", dataset: "items", columns: [{ header: "X", binding: "row.x" }] }] }],
    });
    const result = validateReport(report);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });
});
