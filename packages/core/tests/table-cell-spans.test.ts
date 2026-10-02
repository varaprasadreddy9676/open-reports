import { describe, expect, it } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, InlineDataSource, resolveReport, tableCellSpanErrors, tableCellSpanGrid, validateReport } from "../src/index.js";

const registry = new DataSourceRegistry();
registry.register(new InlineDataSource());
const doc = (cellSpans: unknown[], data: unknown[] = [{ a: "A", b: "B" }, { a: "A", b: "C" }]) => ({
  schemaVersion: "1.0", id: "r", name: "r",
  datasets: [{ id: "d", source: "inline", query: { data } }],
  sections: [{ type: "detail", children: [{ type: "table", id: "t", dataset: "d", columns: [{ id: "a", header: "A", binding: "row.a" }, { id: "b", header: "B", binding: "row.b" }], cellSpans }] }],
});

describe("table body cell spans", () => {
  it("rejects overlapping and out-of-bounds positional merges", () => {
    const spans = [{ row: 0, column: 0, colSpan: 2 }, { row: 0, column: 1, rowSpan: 2 }, { row: 0, column: 2 }];
    const errors = tableCellSpanErrors(2, spans);
    expect(errors.some((message) => message.includes("overlap"))).toBe(true);
    expect(errors.some((message) => message.includes("outside"))).toBe(true);
    const parsed = parseReportDefinition(doc(spans));
    expect(parsed.valid).toBe(true);
    if (parsed.valid) expect(validateReport(parsed.report).issues.some((issue) => issue.code === "INVALID_TABLE_SPAN")).toBe(true);
  });

  it("indexes covered cells and warns when a merge hides different data", async () => {
    const span = { row: 0, column: 0, colSpan: 2, rowSpan: 2 };
    const grid = tableCellSpanGrid([span]);
    expect(grid.get(0)?.get(0)?.anchor).toBe(true);
    expect(grid.get(1)?.get(1)?.anchor).toBe(false);
    const parsed = parseReportDefinition(doc([span]));
    if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
    const result = await resolveReport(parsed.report, { registry });
    expect(result.resolved.warnings.some((warning) => warning.code === "TABLE_MERGE_HIDES_DATA")).toBe(true);
  });

  it("warns and skips a span beyond the current row count", async () => {
    const parsed = parseReportDefinition(doc([{ row: 1, column: 0, rowSpan: 2 }], [{ a: "A", b: "B" }]));
    if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
    const result = await resolveReport(parsed.report, { registry });
    expect(result.resolved.warnings.some((warning) => warning.code === "TABLE_SPAN_OUT_OF_RANGE")).toBe(true);
  });
});
