import { describe, expect, it } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { tableHeaderGridErrors, tableHeaderRows, validateReport } from "../src/index.js";

describe("table header grid", () => {
  const columns = [{ id: "item", header: "Item" }, { id: "qty", header: "Qty" }, { id: "amount", header: "Amount" }];

  it("uses the legacy one-row column headers when no grid is set", () => {
    expect(tableHeaderRows({ columns })).toEqual([[{ column: 0, text: "Item", align: undefined }, { column: 1, text: "Qty", align: undefined }, { column: 2, text: "Amount", align: undefined }]]);
  });

  it("accepts a complete grid with horizontal and vertical spans", () => {
    const rows = [
      [{ column: 0, text: "Product", rowSpan: 2 }, { column: 1, text: "Sale", colSpan: 2 }],
      [{ column: 1, text: "Qty" }, { column: 2, text: "Amount" }],
    ];
    expect(tableHeaderGridErrors(3, rows)).toEqual([]);
    const parsed = parseReportDefinition({ schemaVersion: "1.0", id: "r", name: "r", datasets: [{ id: "items", source: "inline", query: { data: [] } }], sections: [{ type: "detail", children: [{ type: "table", dataset: "items", columns, headerRows: rows }] }] });
    expect(parsed.valid).toBe(true);
    if (parsed.valid) expect(validateReport(parsed.report).valid).toBe(true);
  });

  it("rejects overlapping, out-of-bounds, and missing header cells", () => {
    const rows = [
      [{ column: 0, text: "A", colSpan: 2 }, { column: 1, text: "B" }],
      [{ column: 0, text: "C", rowSpan: 2 }],
    ];
    const errors = tableHeaderGridErrors(3, rows);
    expect(errors.some((message) => message.includes("overlap"))).toBe(true);
    expect(errors.some((message) => message.includes("outside"))).toBe(true);
    expect(errors.some((message) => message.includes("no cell"))).toBe(true);
    const parsed = parseReportDefinition({ schemaVersion: "1.0", id: "r", name: "r", datasets: [{ id: "items", source: "inline", query: { data: [] } }], sections: [{ type: "detail", children: [{ type: "table", id: "t", dataset: "items", columns, headerRows: rows }] }] });
    expect(parsed.valid).toBe(true);
    if (parsed.valid) {
      const result = validateReport(parsed.report);
      expect(result.valid).toBe(false);
      expect(result.issues.some((issue) => issue.code === "INVALID_TABLE_HEADER" && issue.componentId === "t")).toBe(true);
    }
  });
});
