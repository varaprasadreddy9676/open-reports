import { describe, it, expect } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { applyViewerState, DataSourceRegistry, InlineDataSource, resolveReport } from "../src/index.js";

const definition = (drillDown?: "expanded" | "collapsed") => ({
  schemaVersion: "1.0", id: "d", name: "d",
  datasets: [{ id: "visits", source: "inline", query: { data: [{ region: "North", patient: "Ann" }, { region: "North", patient: "Bob" }, { region: "South", patient: "Cid" }] } }],
  sections: [{ type: "detail", children: [{
    id: "byRegion", type: "group", dataset: "visits", groupBy: "row.region", ...(drillDown ? { drillDown } : {}),
    header: [{ type: "text", expression: "row.region" }],
    children: [{ type: "text", expression: "row.patient" }],
    footer: [{ type: "text", value: "subtotal" }],
  }] }],
});

async function groups(doc: unknown, state?: Parameters<typeof applyViewerState>[1]) {
  const parsed = parseReportDefinition(doc);
  if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
  const registry = new DataSourceRegistry();
  registry.register(new InlineDataSource());
  const { resolved } = await resolveReport(applyViewerState(parsed.report, state), { registry });
  const all = (nodes: any[]): any[] => nodes.flatMap((node) => [node, ...all(node.children ?? [])]);
  return all((resolved.sections as any[]).flatMap((section) => section.children ?? [])).find((node) => node.type === "group").groups as any[];
}

describe("drill-down groups", () => {
  it("leaves groups untouched when drill-down is off", async () => {
    const result = await groups(definition());
    expect(result.map((group) => group.children.length)).toEqual([2, 1]);
    expect(result[0].header[0].drillToggle).toBeUndefined();
  });

  it("starts collapsed, keeping each group's header and footer, and marks the header as a toggle", async () => {
    const result = await groups(definition("collapsed"));
    expect(result.map((group) => group.children.length)).toEqual([0, 0]);
    expect(result.map((group) => group.footer.length)).toEqual([1, 1]);
    expect(result[0].header[0].drillToggle).toEqual({ component: "byRegion", key: "North", collapsed: true });
  });

  it("expands just the groups the viewer toggled", async () => {
    const result = await groups(definition("collapsed"), { toggle: [{ component: "byRegion", keys: ["South"] }] });
    expect(result.map((group) => [group.key, group.children.length])).toEqual([["North", 0], ["South", 1]]);
    expect(result[1].header[0].drillToggle.collapsed).toBe(false);
  });
});
