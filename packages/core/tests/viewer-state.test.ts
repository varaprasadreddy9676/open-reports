import { describe, it, expect } from "vitest";
import { applyViewerState } from "../src/viewer-state.js";

const report = {
  schemaVersion: "1.0", id: "r", name: "r",
  sections: [{ type: "detail", children: [
    { type: "container", children: [
      { id: "orders", type: "table", dataset: "o", sortBy: [{ binding: "row.date", direction: "asc" }], columns: [{ id: "customer", binding: "row.customer" }, { binding: "row.amount" }, { header: "Margin", expression: "row.amount - row.cost" }] },
    ] },
    { id: "pivot", type: "crosstab", dataset: "s", rows: [{ binding: "row.region" }], measures: [{ binding: "row.amount" }] },
  ] }],
} as any;
const find = (doc: any, id: string): any => JSON.parse(JSON.stringify(doc)).sections[0].children.flatMap((c: any) => [c, ...(c.children ?? [])]).find((c: any) => c.id === id);

describe("viewer state", () => {
  it("sorts a table by the clicked column, replacing its own sort", () => {
    const next = applyViewerState(report, { sort: [{ component: "orders", column: "customer", direction: "desc" }] });
    expect(find(next, "orders").sortBy).toEqual([{ binding: "row.customer", direction: "desc" }]);
    expect(find(report, "orders").sortBy).toEqual([{ binding: "row.date", direction: "asc" }]);
  });

  it("finds columns without an id the way the engine names them, including computed columns", () => {
    expect(find(applyViewerState(report, { sort: [{ component: "orders", column: "row.amount", direction: "asc" }] }), "orders").sortBy).toEqual([{ binding: "row.amount", direction: "asc" }]);
    expect(find(applyViewerState(report, { sort: [{ component: "orders", column: "Margin", direction: "asc" }] }), "orders").sortBy).toEqual([{ binding: "row.amount - row.cost", direction: "asc" }]);
  });

  it("sorts a crosstab by one of its generated columns", () => {
    expect(find(applyViewerState(report, { sort: [{ component: "pivot", column: "c2m0", direction: "desc" }] }), "pivot").sortBy).toEqual([{ binding: "row.c2m0", direction: "desc" }]);
  });

  it("ignores unknown components, unknown columns and malformed crosstab columns", () => {
    expect(applyViewerState(report, { sort: [{ component: "missing", column: "x", direction: "asc" }] })).toEqual(report);
    expect(find(applyViewerState(report, { sort: [{ component: "orders", column: "nope", direction: "asc" }] }), "orders").sortBy).toEqual([{ binding: "row.date", direction: "asc" }]);
    expect(find(applyViewerState(report, { sort: [{ component: "pivot", column: "row.region; drop", direction: "asc" }] }), "pivot").sortBy).toBeUndefined();
  });
});

describe("drill-down groups", () => {
  it("records which group keys the viewer toggled", () => {
    const doc = { sections: [{ type: "detail", children: [{ id: "byRegion", type: "group", groupBy: "row.region", drillDown: "collapsed", children: [] }] }] };
    const next: any = applyViewerState(doc, { toggle: [{ component: "byRegion", keys: ["North"] }] });
    expect(next.sections[0].children[0].drillToggled).toEqual(["North"]);
  });
});
