import { describe, expect, it } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, InlineDataSource, resolveReport, validateReport } from "../src/index.js";

const orders = [
  { number: "SO-1", customer: "Acme", lines: [{ sku: "A", qty: 2 }, { sku: "B", qty: 1 }] },
  { number: "SO-2", customer: "Globex", lines: [{ sku: "C", qty: 5 }] },
  { number: "SO-3", customer: "Initech", lines: [] },
];

function report(sections: unknown[]) {
  const parsed = parseReportDefinition({ schemaVersion: "1.0", id: "nested", name: "Nested", datasets: [{ id: "orders", source: "inline", query: { data: orders } }], sections });
  if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
  return parsed.report;
}
const registry = new DataSourceRegistry();
registry.register(new InlineDataSource());
const walk = (nodes: any[]): any[] => nodes.flatMap((node) => [node, ...walk(node.children ?? [])]);
const tables = (resolved: any) => walk(resolved.sections.flatMap((s: any) => s.children)).filter((n) => n.type === "table");

const linesTable = { type: "table", dataset: "row.lines", columns: [
  { id: "sku", header: "SKU", binding: "row.sku" },
  { id: "qty", header: "Qty", binding: "row.qty" },
  { id: "order", header: "Order", binding: "parent.number" },
], emptyState: "message", emptyMessage: "No lines" };

describe("nested lists (master-detail)", () => {
  it("prints each record's own list in a detail band, with access to the parent record", async () => {
    const out = await resolveReport(report([{ type: "detail", dataset: "orders", children: [{ type: "text", binding: "row.number" }, linesTable] }]), { registry });
    const printed = tables(out.resolved).map((t) => t.rows.map((r: any) => [r.formatted.sku, r.formatted.qty, r.formatted.order]));
    expect(printed).toEqual([[["A", "2", "SO-1"], ["B", "1", "SO-1"]], [["C", "5", "SO-2"]]]);
    const empty = walk(out.resolved.sections.flatMap((s: any) => s.children)).filter((n) => n.type === "text" && n.text === "No lines");
    expect(empty).toHaveLength(1);
  });

  it("works inside a repeater and supports nested repeaters", async () => {
    const out = await resolveReport(report([{ type: "detail", children: [{ type: "repeater", dataset: "orders", children: [
      { type: "repeater", dataset: "row.lines", children: [{ type: "text", binding: "parent.customer + ': ' + row.sku" }] },
    ] }] }]), { registry });
    const texts = walk(out.resolved.sections.flatMap((s: any) => s.children)).filter((n) => n.type === "text").map((n) => n.text);
    expect(texts).toEqual(["Acme: A", "Acme: B", "Globex: C"]);
  });

  it("validates row-relative sources as expressions instead of dataset names", () => {
    const issues = (dataset: string) => validateReport(report([{ type: "detail", dataset: "orders", children: [{ ...linesTable, dataset }] }])).issues.map((i) => i.code);
    expect(issues("row.lines")).toEqual([]);
    expect(issues("row.(")).toContain("INVALID_EXPRESSION");
    expect(issues("unknownDataset")).toContain("UNKNOWN_DATASET");
  });
});
