import { describe, it, expect } from "vitest";
import * as ops from "../../src/model/ops";

const base = (): any => ({ schemaVersion: "1.0", id: "r", name: "r", datasets: [{ id: "d", source: "inline", query: { data: [] } }], groups: [], guides: [], sections: [{ type: "detail", dataset: "d", children: [] }] });
const types = (d: any) => d.sections.map((s: any) => s.type + (s.groupId ? `:${s.groupId}` : ""));

describe("band insertion keeps the report in reading order", () => {
  it("adds headers/footers around the detail band", () => {
    let d = base();
    d = ops.addBand(d, "reportFooter").doc;
    d = ops.addBand(d, "reportHeader").doc;
    d = ops.addBand(d, "dataHeader").doc;
    d = ops.addBand(d, "dataFooter").doc;
    d = ops.addBand(d, "pageFooter").doc;
    d = ops.addBand(d, "pageHeader").doc;
    expect(types(d)).toEqual(["reportHeader", "pageHeader", "dataHeader", "detail", "dataFooter", "reportFooter", "pageFooter"]);
  });

  it("addGroup creates nested groups: outer header first, inner footer before outer footer", () => {
    let d = base();
    d = ops.addGroup(d, { dataset: "d", by: "row.dept", name: "Department" }).doc;
    d = ops.addGroup(d, { dataset: "d", by: "row.doctor", name: "Doctor" }).doc;
    expect(types(d)).toEqual(["groupHeader:department", "groupHeader:doctor", "detail", "groupFooter:doctor", "groupFooter:department"]);
    expect(d.groups.map((g: any) => g.id)).toEqual(["department", "doctor"]);
  });

  it("addGroup on a report without a detail band also creates the detail band; ids stay unique", () => {
    let d = base();
    d.sections = [];
    const a = ops.addGroup(d, { dataset: "d", by: "row.x", name: "X" });
    const b = ops.addGroup(a.doc, { dataset: "d", by: "row.x", name: "X" });
    expect(a.doc.sections.some((s: any) => s.type === "detail")).toBe(true);
    expect(new Set(b.doc.groups.map((g: any) => g.id)).size).toBe(2);
  });

  it("child bands go right after their parent", () => {
    let d = base();
    d.sections[0].id = "row";
    d = ops.addBand(d, "detail", { dataset: "d" }).doc;
    d = ops.addBand(d, "child", { parent: "row" }).doc;
    expect(types(d)).toEqual(["detail", "child", "detail"]);
  });
});

describe("moving bands", () => {
  const grouped = () => ops.addGroup(ops.addGroup(base(), { dataset: "d", by: "row.a", name: "A" }).doc, { dataset: "d", by: "row.b", name: "B" }).doc;
  it("blocks invalid moves and allows valid ones", () => {
    const d = grouped(); // GH:a GH:b D GF:b GF:a
    expect(ops.canMoveBand(d, 2, 0)).toBe(false); // detail above group headers
    expect(ops.canMoveBand(d, 0, 4)).toBe(false); // outer header below the footers
    expect(ops.canMoveBand(d, 0, 1)).toBe(false); // would invert the nesting of the groups
    expect(ops.canMoveBand(d, 3, 4)).toBe(false); // inner footer must stay before the outer footer
  });
  it("page bands may go anywhere; an invalid move returns undefined and leaves the document alone", () => {
    let d = ops.addBand(grouped(), "pageFooter").doc;
    const idx = d.sections.length - 1;
    expect(ops.canMoveBand(d, idx, 0)).toBe(true);
    const before = JSON.stringify(d);
    expect(ops.moveBand(d, 2, 0)).toBeUndefined();
    expect(JSON.stringify(d)).toBe(before);
  });
  it("moves two same-type bands while preserving their children", () => {
    let d = base();
    d = ops.addBand(d, "reportHeader", { name: "A", children: [{ type: "text", id: "a", value: "A" }] }).doc;
    d = ops.addBand(d, "reportHeader", { name: "B", children: [{ type: "text", id: "b", value: "B" }] }).doc;
    const moved = ops.moveBand(d, 0, 1)!;
    expect(moved.sections.slice(0, 2).map((s: any) => s.name)).toEqual(["B", "A"]);
    expect(moved.sections[1].children[0].id).toBe("a");
  });
});

describe("band and guide edits", () => {
  it("updateBand sets and clears properties; duplicateBand re-ids children", () => {
    let d = base();
    d.sections[0].children = [{ type: "text", id: "t", value: "x" }];
    d = ops.updateBand(d, 0, { height: 40, keepTogether: true });
    expect(d.sections[0]).toMatchObject({ height: 40, keepTogether: true });
    d = ops.updateBand(d, 0, { height: undefined, keepTogether: false });
    expect(d.sections[0].height).toBeUndefined();
    expect(d.sections[0].keepTogether).toBeUndefined();
    const dup = ops.duplicateBand(d, 0).doc;
    expect(dup.sections).toHaveLength(2);
    expect(dup.sections[1].children[0].id).not.toBe("t");
  });
  it("preserves an explicit no-split choice while clearing ordinary unchecked flags", () => {
    let d = ops.updateBand(base(), 0, { allowSplit: false, repeatEveryPage: false, newPageBefore: false });
    expect(d.sections[0].allowSplit).toBe(false);
    expect(d.sections[0].repeatEveryPage).toBe(false);
    expect(d.sections[0].newPageBefore).toBeUndefined();
    d = ops.updateBand(d, 0, { allowSplit: undefined });
    expect(d.sections[0].allowSplit).toBeUndefined();
  });
  it("guides: add, move, remove", () => {
    let d = base();
    const a = ops.addGuide(d, "x", 123.456);
    expect(a.doc.guides[0]).toMatchObject({ axis: "x", pos: 123.5 });
    const moved = ops.updateGuide(a.doc, a.id, { pos: 50 });
    expect(moved.guides[0].pos).toBe(50);
    expect(ops.removeGuide(moved, a.id).guides).toHaveLength(0);
  });
  it("removeGroup drops the group and its bands but keeps detail", () => {
    const d = ops.addGroup(base(), { dataset: "d", by: "row.a", name: "A" });
    const r = ops.removeGroup(d.doc, d.groupId);
    expect(types(r)).toEqual(["detail"]);
    expect(r.groups).toHaveLength(0);
  });
});
