import { describe, expect, it } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, InlineDataSource, resolveReport, validateReport } from "../src/index.js";
import { sectionChildren } from "./helpers.js";

const registry = new DataSourceRegistry();
registry.register(new InlineDataSource());

const sales = [
  { region: "East", country: "India", city: "Pune", id: 1, total: 10 },
  { region: "East", country: "India", city: "Delhi", id: 2, total: 20 },
  { region: "East", country: "Japan", city: "Osaka", id: 3, total: 30 },
  { region: "West", country: "Japan", city: "Kyoto", id: 4, total: 40 },
  { region: "West", country: "Peru", city: "", id: 5, total: 50 },
  { region: "West", country: "Peru", city: "", id: 6, total: 60 },
];

function report(table: Record<string, unknown>, data: unknown[] = sales) {
  const parsed = parseReportDefinition({
    schemaVersion: "1.0", id: "merges", name: "Merges",
    datasets: [{ id: "sales", source: "inline", query: { data } }],
    sections: [{ type: "detail", children: [{
      type: "table", id: "t", dataset: "sales",
      columns: [
        { id: "region", header: "Region", binding: "row.region" },
        { id: "country", header: "Country", binding: "row.country" },
        { id: "city", header: "City", binding: "row.city" },
        { id: "total", header: "Total", binding: "row.total" },
      ],
      ...table,
    }] }],
  });
  if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
  return parsed.report;
}

const resolveTable = async (table: Record<string, unknown>, data?: unknown[]) => {
  const out = await resolveReport(report(table, data), { registry });
  return { table: sectionChildren(out.resolved, 0)[0] as any, warnings: out.resolved.warnings };
};

const withMerge = (ids: string[]) => (["region", "country", "city", "total"]).map((id) => ({ id, header: id, binding: `row.${id}`, ...(ids.includes(id) ? { mergeRepeated: true } : {}) }));

describe("merge repeated values", () => {
  it("merges consecutive equal values per column, nested inside merges to the left, and never merges blanks", async () => {
    const { table } = await resolveTable({ columns: withMerge(["region", "country", "city"]) });
    const spans = table.cellSpans.map((s: any) => [s.row, s.column, s.rowSpan, s.splittable]);
    expect(spans).toEqual([
      [0, 0, 3, true],   // East
      [3, 0, 3, true],   // West
      [0, 1, 2, true],   // India
      // Japan rows 2-3 are NOT merged: row 3 starts the West region.
      [4, 1, 2, true],   // Peru
      // Blank cities in rows 4-5 stay separate.
    ]);
  });

  it("follows the data after sorting and filtering", async () => {
    const { table } = await resolveTable({ columns: withMerge(["country"]), sortBy: [{ binding: "row.country", direction: "asc" }], filterWhen: "row.total >= 20" });
    expect(table.rows.map((r: any) => r.formatted.country)).toEqual(["India", "Japan", "Japan", "Peru", "Peru"]);
    expect(table.cellSpans.map((s: any) => [s.row, s.rowSpan])).toEqual([[1, 2], [3, 2]]);
  });
});

describe("record-anchored merges", () => {
  it("stay with their record when the table is re-sorted", async () => {
    const merge = { match: { field: "row.id", value: 3 }, column: 2, colSpan: 2 };
    const ascending = await resolveTable({ cellSpans: [merge] });
    expect(ascending.table.cellSpans).toEqual([{ row: 2, column: 2, colSpan: 2, rowSpan: 1, source: 0 }]);
    const descending = await resolveTable({ cellSpans: [merge], sortBy: [{ binding: "row.id", direction: "desc" }] });
    expect(descending.table.cellSpans).toEqual([{ row: 3, column: 2, colSpan: 2, rowSpan: 1, source: 0 }]);
    expect(descending.table.rows[3].formatted.city).toBe("Osaka");
  });

  it("are skipped with a warning when the record is not in the output", async () => {
    const { table, warnings } = await resolveTable({ cellSpans: [{ match: { field: "row.id", value: 3 }, column: 0, rowSpan: 2 }], filterWhen: "row.id != 3" });
    expect(table.cellSpans).toEqual([]);
    expect(warnings.find((w) => w.code === "TABLE_SPAN_ANCHOR_NOT_FOUND")).toMatchObject({ componentId: "t" });
  });

  it("take precedence over overlapping automatic merges, with a warning", async () => {
    const { table, warnings } = await resolveTable({ columns: withMerge(["region"]), cellSpans: [{ match: { field: "row.id", value: 1 }, column: 0, colSpan: 2 }] });
    expect(table.cellSpans.map((s: any) => [s.row, s.column, s.colSpan ?? 1, s.rowSpan ?? 1, Boolean(s.splittable)])).toEqual([[0, 0, 2, 1, false], [3, 0, 1, 3, true]]);
    expect(warnings.some((w) => w.code === "TABLE_AUTO_MERGE_CONFLICT")).toBe(true);
  });
});

describe("merge validation", () => {
  const issues = (cellSpans: unknown[]) => validateReport(report({ cellSpans })).issues.filter((i) => i.code === "INVALID_TABLE_SPAN").map((i) => i.message);
  it("requires exactly one of a row position or a record match", () => {
    expect(issues([{ row: 0, match: { field: "row.id", value: 1 }, column: 0 }])[0]).toMatch(/either a row position or a record match/);
    expect(issues([{ column: 0 }])[0]).toMatch(/either a row position or a record match/);
    expect(issues([{ match: { field: "row.id", value: 1 }, column: 3, colSpan: 2 }])[0]).toMatch(/outside the table grid/);
    expect(issues([{ match: { field: "row.(", value: 1 }, column: 0 }])[0]).toMatch(/match/i);
    expect(issues([{ match: { field: "row.id", value: 1 }, column: 0, colSpan: 2 }])).toEqual([]);
  });
});
