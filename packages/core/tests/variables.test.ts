import { describe, expect, it } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, InlineDataSource, resolveReport, validateReport } from "../src/index.js";
import { sectionChildren } from "./helpers.js";

const registry = new DataSourceRegistry();
registry.register(new InlineDataSource());
const data = [
  { region: "East", amount: 10 }, { region: "East", amount: 5 },
  { region: "West", amount: 7 }, { region: "West", amount: 1 }, { region: "West", amount: 2 },
];

function report(variables: unknown[], sections: unknown[]) {
  const parsed = parseReportDefinition({
    schemaVersion: "1.0", id: "vars", name: "Variables",
    datasets: [{ id: "sales", source: "inline", query: { data } }],
    groups: [{ id: "byRegion", dataset: "sales", by: "row.region" }],
    variables, sections,
  });
  if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
  return parsed.report;
}
const running = (resetOn?: string) => ({ id: "running", scope: "row", expression: "(vars.running ?? 0) + row.amount", ...(resetOn ? { resetOn } : {}) });
const detail = { type: "detail", dataset: "sales", children: [{ type: "text", expression: "row.region + \" \" + vars.running" }] };

describe("row variables", () => {
  it("accumulate across band detail records", async () => {
    const out = await resolveReport(report([running()], [detail]), { registry });
    expect(sectionChildren(out.resolved, 0).map((n) => n.text)).toEqual(["East 10", "East 15", "West 22", "West 23", "West 25"]);
  });

  it("restart at each instance of the group named by resetOn", async () => {
    const out = await resolveReport(report([running("byRegion")], [
      { type: "groupHeader", groupId: "byRegion", children: [{ type: "text", expression: "group.key" }] },
      detail,
    ]), { registry });
    expect(sectionChildren(out.resolved, 1).map((n) => n.text)).toEqual(["East 10", "East 15", "West 7", "West 8", "West 10"]);
  });

  it("restart per group inside a grouped table too", async () => {
    const out = await resolveReport(report([running("byRegion")], [
      { type: "groupHeader", groupId: "byRegion", children: [{ type: "text", expression: "group.key" }] },
      { type: "detail", dataset: "sales", children: [{ type: "table", dataset: "sales", columns: [{ id: "r", header: "Running", expression: "vars.running" }] }] },
    ]), { registry });
    const tables = sectionChildren(out.resolved, 1);
    expect(tables.map((t) => t.rows.map((r: any) => r.raw.r))).toEqual([[10, 15], [7, 8, 10]]);
  });

  it("validates resetOn", () => {
    const unknown = validateReport(report([running("byCity")], [detail])).issues;
    expect(unknown).toEqual(expect.arrayContaining([expect.objectContaining({ code: "UNKNOWN_RESET_GROUP", path: "variables[0].resetOn" })]));
    const wrongScope = validateReport(report([{ id: "t", scope: "report", expression: "1", resetOn: "byRegion" }], [detail])).issues;
    expect(wrongScope).toEqual(expect.arrayContaining([expect.objectContaining({ code: "RESET_ON_NOT_ROW", path: "variables[0].resetOn" })]));
  });
});
