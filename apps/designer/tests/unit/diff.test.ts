import { describe, it, expect } from "vitest";
import { diffDocs, summarize } from "../../src/lib/diff";

const doc = (children: any[]) => ({ schemaVersion: "1.0", id: "r", name: "R", sections: [{ type: "detail", children }] });

describe("diffDocs", () => {
  it("detects added, removed and changed components by id", () => {
    const a = doc([{ id: "t", type: "text", value: "Hi" }, { id: "q", type: "qrcode", value: "x" }]);
    const b = doc([{ id: "t", type: "text", value: "Hello", style: { fontSize: 12 } }, { id: "n", type: "line" }]);
    const changes = diffDocs(a, b);
    expect(changes.find((c) => c.id === "n")?.kind).toBe("added");
    expect(changes.find((c) => c.id === "q")?.kind).toBe("removed");
    const changed = changes.find((c) => c.id === "t")!;
    expect(changed.kind).toBe("changed");
    expect(changed.detail).toContain("value Hi → Hello");
    expect(changed.detail).toContain("style changed");
  });

  it("detects moves between positions", () => {
    const a = doc([{ id: "a", type: "text", value: "1" }, { id: "b", type: "text", value: "2" }]);
    const b = doc([{ id: "b", type: "text", value: "2" }, { id: "a", type: "text", value: "1" }]);
    expect(diffDocs(a, b).some((c) => c.kind === "moved")).toBe(true);
  });

  it("summarizes", () => {
    expect(summarize([])).toBe("Edited");
    expect(summarize([{ kind: "added", id: "x", type: "text", detail: "Added Title" }])).toBe("Added Title");
    expect(summarize([{ kind: "added", id: "x", type: "text", detail: "" }, { kind: "removed", id: "y", type: "text", detail: "" }])).toBe("Added 1, removed 1");
  });
});

import { parseCalc, buildCalc, conditionToExpression, expressionToCondition } from "../../src/lib/lowcode";
import * as ops from "../../src/model/ops";

describe("calculated value builder", () => {
  it("round-trips simple arithmetic and rejects anything else", () => {
    expect(parseCalc("row.quantity * row.rate")).toEqual([{ operand: "row.quantity" }, { op: "*", operand: "row.rate" }]);
    expect(buildCalc(parseCalc("row.a + row.b - 2")!)).toBe("row.a + row.b - 2");
    expect(parseCalc("upper(row.name)")).toBeUndefined();
    expect(parseCalc("")).toBeUndefined();
  });
});

describe("conditions", () => {
  it("round-trips builder conditions", () => {
    const c = { field: "row.status", operator: "eq" as const, value: "Pending" };
    expect(conditionToExpression(c)).toBe('row.status == "Pending"');
    expect(expressionToCondition('row.status == "Pending"')).toEqual(c);
    expect(expressionToCondition("a && b")).toBeUndefined();
  });
});

describe("group / ungroup / masters", () => {
  const base = () => ops.ensureIds({ schemaVersion: "1.0", id: "r", name: "R", sections: [{ type: "detail", children: [{ type: "text", value: "a" }, { type: "text", value: "b" }, { type: "line" }] }] });

  it("groups siblings into a container and ungroups them back", () => {
    const d = base();
    const ids = d.sections[0].children.slice(0, 2).map((c: any) => c.id);
    const g = ops.group(d, ids);
    expect(g.doc.sections[0].children.map((c: any) => c.type)).toEqual(["container", "line"]);
    expect(g.doc.sections[0].children[0].children).toHaveLength(2);
    const u = ops.ungroup(g.doc, g.id!);
    expect(u.doc.sections[0].children.map((c: any) => c.type)).toEqual(["text", "text", "line"]);
  });

  it("adds a first-page header master that copies the standard one, before the body", () => {
    const d = ops.addMaster({ ...base(), sections: [{ type: "pageHeader", children: [{ id: "h", type: "text", value: "H" }] }, ...base().sections] }, "pageHeader", "first");
    expect(d.sections.map((s: any) => `${s.type}:${s.appliesTo ?? ""}`)).toEqual(["pageHeader:", "pageHeader:first", "detail:"]);
    expect(d.sections[1].children[0].id).not.toBe("h");
  });

  it("copies background geometry and children independently for a first-page variant", () => {
    const standard = { id: "background", type: "background", layout: "absolute", style: { background: "#f4f7ff" }, appliesTo: "standard", children: [{ id: "mark", type: "text", value: "NORMAL" }] };
    const source = { ...base(), sections: [standard, ...base().sections] } as any;
    const next = ops.addMaster(source, "background", "first");
    const first = next.sections.find((section: any) => section.type === "background" && section.appliesTo === "first");
    expect(first).toMatchObject({ layout: "absolute", style: { background: "#f4f7ff" }, children: [{ value: "NORMAL" }] });
    expect(first.id).not.toBe("background");
    expect(first.children[0].id).not.toBe("mark");
    expect(next.sections.find((section: any) => section.appliesTo === "standard").children[0].id).toBe("mark");
    expect(ops.addMaster(next, "background", "first")).toBe(next);
  });

  it("locks and hides", () => {
    const d = base();
    const id = d.sections[0].children[0].id;
    expect(ops.find(ops.setHidden(d, [id], true), id)!.comp.hidden).toBe(true);
    expect(ops.find(ops.setLocked(d, [id], true), id)!.comp.locked).toBe(true);
  });
});
