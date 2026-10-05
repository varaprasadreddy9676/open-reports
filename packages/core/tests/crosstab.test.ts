import { describe, it, expect } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { pivotCrosstab } from "../src/crosstab.js";
import { DataSourceRegistry, InlineDataSource, resolveReport } from "../src/index.js";

const sales = [
  { region: "North", month: "Jan", product: "Lenses", amount: 100 },
  { region: "North", month: "Feb", product: "Lenses", amount: 150 },
  { region: "South", month: "Jan", product: "Frames", amount: 80 },
  { region: "North", month: "Jan", product: "Frames", amount: 20 },
  { region: "South", month: "Mar", product: "Lenses", amount: 60 },
];
const read = (expression: string, row: unknown) => (row as Record<string, unknown>)[expression.replace(/^row\./, "")];

describe("pivotCrosstab", () => {
  const crosstab = {
    type: "crosstab",
    dataset: "sales",
    rows: [{ binding: "row.region", header: "Region" }],
    columns: [{ binding: "row.month" }],
    measures: [{ binding: "row.amount", aggregate: "sum", format: "number:0" }],
    totalColumn: true,
    totalRow: true,
    totalLabel: "Total",
  } as const;

  it("puts one row per row value and one column per column value, summing the cells", () => {
    const { table, rows } = pivotCrosstab(crosstab, sales, read);
    expect(table.columns.map((column) => column.header)).toEqual(["Region", "Feb", "Jan", "Mar", "Total"]);
    expect(rows).toEqual([
      { r0: "North", c0m0: 150, c1m0: 120, c2m0: null, t0: 270 },
      { r0: "South", c0m0: null, c1m0: 80, c2m0: 60, t0: 140 },
    ]);
  });

  it("totals each column in the footer, with the grand total in the corner", () => {
    const { table } = pivotCrosstab(crosstab, sales, read);
    expect(table.showFooter).toBe(true);
    expect(table.columns[0]!.footer).toEqual({ label: "Total" });
    expect(table.columns.slice(1).map((column) => column.footer?.expression)).toEqual(["150", "200", "60", "410"]);
  });

  it("sorts column values in the declared order, and numbers numerically", () => {
    const months = [{ m: 10 }, { m: 9 }, { m: 100 }].map((row) => ({ ...row, region: "A", amount: 1 }));
    const { table } = pivotCrosstab({ ...crosstab, columns: [{ binding: "row.m", sort: "desc" }] }, months, read);
    expect(table.columns.map((column) => column.header)).toEqual(["Region", "100", "10", "9", "Total"]);
  });

  it("supports count, average, minimum and maximum", () => {
    const pick = (aggregate: "count" | "avg" | "min" | "max") => pivotCrosstab({ ...crosstab, totalColumn: false, measures: [{ binding: "row.amount", aggregate }] }, sales, read).rows[0];
    expect(pick("count")).toMatchObject({ c1m0: 2 });
    expect(pick("avg")).toMatchObject({ c1m0: 60 });
    expect(pick("min")).toMatchObject({ c1m0: 20 });
    expect(pick("max")).toMatchObject({ c1m0: 100 });
  });

  it("totals averages from the raw values, not by averaging averages", () => {
    const { table } = pivotCrosstab({ ...crosstab, measures: [{ binding: "row.amount", aggregate: "avg" }] }, sales, read);
    expect(table.columns.at(-1)!.footer?.expression).toBe(String(410 / 5));
  });

  it("nests row groups, merging repeated outer values", () => {
    const { table, rows } = pivotCrosstab({ ...crosstab, rows: [{ binding: "row.region" }, { binding: "row.product" }] }, sales, read);
    expect(rows.map((row) => [row.r0, row.r1])).toEqual([["North", "Frames"], ["North", "Lenses"], ["South", "Frames"], ["South", "Lenses"]]);
    expect(table.columns[0]!.mergeRepeated).toBe(true);
    expect(table.columns[1]!.mergeRepeated).toBeFalsy();
  });

  it("builds a two-level header when there are several measures", () => {
    const { table } = pivotCrosstab({ ...crosstab, measures: [{ binding: "row.amount", aggregate: "sum", header: "Sales" }, { binding: "row.amount", aggregate: "count", header: "Orders" }] }, sales, read);
    expect(table.headerRows).toHaveLength(2);
    expect(table.headerRows![0]!.map((cell) => [cell.text, cell.colSpan ?? 1, cell.rowSpan ?? 1])).toEqual([["Region", 1, 2], ["Feb", 2, 1], ["Jan", 2, 1], ["Mar", 2, 1], ["Total", 2, 1]]);
    expect(table.headerRows![1]!.map((cell) => cell.text)).toEqual(["Sales", "Orders", "Sales", "Orders", "Sales", "Orders", "Sales", "Orders"]);
  });

  it("caps runaway column counts and says so", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ region: "A", month: `M${String(i).padStart(2, "0")}`, amount: 1 }));
    const result = pivotCrosstab({ ...crosstab, maxColumns: 10 }, many, read);
    expect(result.table.columns).toHaveLength(1 + 10 + 1);
    expect(result.truncatedColumns).toBe(20);
  });
});

describe("crosstab in a report", () => {
  it("resolves to a table that every renderer already understands", async () => {
    const parsed = parseReportDefinition({
      schemaVersion: "1.0",
      id: "pivot",
      name: "Pivot",
      datasets: [{ id: "sales", source: "inline", query: { data: sales } }],
      sections: [{ type: "detail", children: [{ id: "x", type: "crosstab", dataset: "sales", rows: [{ binding: "row.region", header: "Region" }], columns: [{ binding: "row.month" }], measures: [{ binding: "row.amount" }] }] }],
    });
    expect(parsed.valid, JSON.stringify(!parsed.valid && parsed.issues)).toBe(true);
    if (!parsed.valid) return;
    const registry = new DataSourceRegistry();
    registry.register(new InlineDataSource());
    const { resolved } = await resolveReport(parsed.report, { registry });
    const find = (nodes: any[]): any => nodes.flatMap((node) => [node, ...find(node.children ?? [])]);
    const table = find((resolved.sections as any[]).flatMap((section) => section.children ?? [])).find((node: any) => node.id === "x");
    expect(table).toMatchObject({ type: "table", id: "x" });
    expect(table.columns.map((column: any) => column.header)).toEqual(["Region", "Feb", "Jan", "Mar", "Total"]);
    expect(table.rows).toHaveLength(2);
  });
});

describe("crosstab headings", () => {
  it("turns field names into readable headings when none are given", () => {
    const { table } = pivotCrosstab({ dataset: "s", rows: [{ binding: "row.unit_price" }, { binding: "row.customerName" }], measures: [{ binding: "row.amount" }, { binding: "row.amount", aggregate: "avg" }], totalColumn: false, totalRow: false }, [{ unit_price: 1, customerName: "A", amount: 2 }], (b, r) => (r as any)[b.slice(4)]);
    expect(table.columns.map((column) => column.header)).toEqual(["Unit price", "Customer name", "Total amount", "Average amount"]);
  });
});
