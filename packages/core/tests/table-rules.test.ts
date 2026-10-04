import { describe, expect, it } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, InlineDataSource, resolveReport, validateReport } from "../src/index.js";
import { sectionChildren } from "./helpers.js";

const registry = new DataSourceRegistry();
registry.register(new InlineDataSource());
const data = [
  { item: "Rent", amount: 1200, status: "paid" },
  { item: "Refund", amount: -80, status: "open" },
  { item: "Fees", amount: 15, status: "void" },
];

function report(table: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const parsed = parseReportDefinition({
    schemaVersion: "1.0", id: "rules", name: "Table rules",
    datasets: [{ id: "lines", source: "inline", query: { data } }],
    sections: [{ type: "detail", children: [{ type: "table", id: "t", dataset: "lines", ...table }] }],
    ...extra,
  });
  if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
  return parsed.report;
}
const columns = [
  { id: "item", header: "Item", binding: "row.item" },
  { id: "amount", header: "Amount", binding: "row.amount", format: "number:2" },
];
const resolve = async (table: Record<string, unknown>, parameters: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  sectionChildren((await resolveReport(report(table, extra), { registry, parameters })).resolved, 0)[0];

describe("table row rules", () => {
  it("style whole rows and hide rows, with case rules and an else", async () => {
    const t = await resolve({ columns, rowRules: [
      { when: "row.status == \"void\"", set: { visible: false } },
      { cases: [{ when: { field: "row.amount", op: "<", value: 0 }, set: { "style.color": "#b91c1c", "style.fontWeight": "bold" } }], else: { "style.color": "#111827" } },
    ] });
    expect(t.rows.map((r: any) => r.raw.item)).toEqual(["Rent", "Refund"]);
    expect(t.rows[0].style).toEqual({ color: "#111827" });
    expect(t.rows[1].style).toEqual({ color: "#b91c1c", fontWeight: "bold" });
  });

  it("apply after the legacy rowStyleWhen, so a rule wins", async () => {
    const t = await resolve({ columns, rowStyleWhen: [{ when: "true", style: { color: "#000000", italic: true } }], rowRules: [{ when: "row.amount > 1000", set: { "style.color": "#1d4ed8" } }] });
    expect(t.rows[0].style).toEqual({ color: "#1d4ed8", italic: true });
  });

  it("leave hidden rows out of footer totals", async () => {
    const t = await resolve({ showFooter: true, columns: [columns[0], { ...columns[1], footer: { aggregate: "sum" } }], rowRules: [{ when: "row.amount < 0", set: { visible: false } }] });
    expect(t.columns[1].footer.raw).toBe(1215);
  });
});

describe("table column rules", () => {
  it("style single cells and replace their text, reading the cell as value", async () => {
    const t = await resolve({ columns: [columns[0], { ...columns[1], rules: [
      { when: "value < 0", set: { "style.color": "#b91c1c", text: { expr: "\"(\" + formatNumber(-value, 2) + \")\"" } } },
      { when: "row.status == \"void\"", set: { text: "—" } },
    ] }] });
    expect(t.rows[1].cellStyles).toEqual({ amount: { color: "#b91c1c" } });
    expect(t.rows[1].formatted.amount).toBe("(80.00)");
    expect(t.rows[1].raw.amount).toBe(-80);
    expect(t.rows[2].formatted.amount).toBe("—");
    expect(t.rows[0].cellStyles).toBeUndefined();
  });

  it("hide a whole column from a parameter, keeping header groups and merges aligned", async () => {
    const table = {
      columns: [columns[0], { id: "status", header: "Status", binding: "row.status", rules: [{ when: "!params.showStatus", set: { visible: false } }] }, columns[1]],
      headerRows: [[{ column: 0, text: "Line", colSpan: 2 }, { column: 2, text: "Money" }]],
      cellSpans: [{ row: 0, column: 1, colSpan: 2, rowSpan: 2 }],
    };
    const hidden = await resolve(table, { showStatus: false }, { parameters: [{ id: "showStatus", type: "boolean" }] });
    expect(hidden.columns.map((c: any) => c.id)).toEqual(["item", "amount"]);
    expect(hidden.headerRows).toEqual([[{ column: 0, text: "Line", colSpan: 1, rowSpan: 1 }, { column: 1, text: "Money", colSpan: 1, rowSpan: 1 }]]);
    expect(hidden.cellSpans).toEqual([expect.objectContaining({ row: 0, column: 1, colSpan: 1, rowSpan: 2 })]);
    expect(hidden.rows[0].formatted).toEqual({ item: "Rent", amount: "1,200.00" });
    const shown = await resolve(table, { showStatus: true }, { parameters: [{ id: "showStatus", type: "boolean" }] });
    expect(shown.columns.map((c: any) => c.id)).toEqual(["item", "status", "amount"]);
  });
});

describe("table rule validation", () => {
  const issuesOf = (table: Record<string, unknown>) => validateReport(report(table)).issues;
  it("accepts style, visible and text targets", () => {
    expect(issuesOf({ columns: [{ ...columns[1], rules: [{ when: "value < 0", set: { "style.color": "#ff0000", text: "x" } }] }], rowRules: [{ when: "true", set: { "style.background": "#eeeeee", visible: true } }] })).toEqual([]);
  });
  it("rejects unknown targets and invalid style values", () => {
    const issues = issuesOf({ columns: [{ ...columns[1], rules: [{ when: "true", set: { width: 40 } }] }], rowRules: [{ when: "true", set: { "style.fontWeight": "heavy", height: 20 } }] });
    expect(issues.map((i) => [i.code, i.path])).toEqual(expect.arrayContaining([
      ["RULE_UNKNOWN_TARGET", "sections[0].children[0].columns[0].rules[0].set.width"],
      ["RULE_INVALID_VALUE", "sections[0].children[0].rowRules[0].set.style.fontWeight"],
      ["RULE_UNKNOWN_TARGET", "sections[0].children[0].rowRules[0].set.height"],
    ]));
  });
  it("rejects hiding a column per row", () => {
    const issues = issuesOf({ columns: [{ ...columns[1], rules: [{ when: "value < 0", set: { visible: false } }] }] });
    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "COLUMN_VISIBILITY_PER_ROW", path: "sections[0].children[0].columns[0].rules[0]" })]));
  });
});
