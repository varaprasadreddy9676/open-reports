import { describe, expect, it } from "vitest";
import * as ops from "../../src/model/ops";

const absolute = (): any => ({
  sections: [{ type: "detail", children: [{ id: "layout", type: "container", layout: "absolute", children: [
    { id: "a", type: "rectangle", x: 10, y: 20, width: 80, height: 30 },
    { id: "b", type: "rectangle", x: 140, y: 70, width: 40, height: 50 },
    { id: "c", type: "rectangle", x: 210, y: 120, width: 20, height: 20 },
  ] }] }],
});

describe("free-positioned arrangement", () => {
  it("recognizes a band as the parent of its direct children", () => {
    const doc = { sections: [{ type: "detail", layout: "absolute", children: [{ id: "text", type: "text" }] }] };
    expect(ops.parentLayout(doc, "text")).toBe("absolute");
    expect(ops.parentLayout(absolute(), "a")).toBe("absolute");
  });

  it("aligns and distributes only elements in one absolute parent", () => {
    const doc = absolute();
    expect(ops.canArrange(doc, ["a", "b", "c"])).toBe(true);
    const aligned = ops.align(doc, ["a", "b"], "left");
    expect(ops.find(aligned, "b")?.comp.x).toBe(10);
    expect(ops.find(doc, "b")?.comp.x).toBe(140);
    const distributed = ops.distribute(doc, ["a", "b", "c"], "horizontal");
    expect(ops.find(distributed, "a")?.comp.x).toBe(10);
    expect(ops.find(distributed, "b")?.comp.x).toBe(130);
    expect(ops.find(distributed, "c")?.comp.x).toBe(210);
    const a = ops.find(distributed, "a")!.comp;
    const b = ops.find(distributed, "b")!.comp;
    const c = ops.find(distributed, "c")!.comp;
    expect(b.x - a.x - a.width).toBe(c.x - b.x - b.width);
  });

  it("matches width, height, or both to the first selected element", () => {
    const doc = absolute();
    expect(ops.find(ops.matchSize(doc, ["a", "b"], "width"), "b")?.comp).toMatchObject({ x: 140, y: 70, width: 80, height: 50 });
    expect(ops.find(ops.matchSize(doc, ["a", "b"], "height"), "b")?.comp).toMatchObject({ width: 40, height: 30 });
    expect(ops.find(ops.matchSize(doc, ["a", "b"], "both"), "b")?.comp).toMatchObject({ width: 80, height: 30 });
  });

  it("does not rewrite flow content, locked elements, or children of different parents", () => {
    const flow = absolute();
    flow.sections[0].children[0].layout = "flow";
    expect(ops.canArrange(flow, ["a", "b"])).toBe(false);
    expect(ops.align(flow, ["a", "b"], "left")).toBe(flow);
    expect(ops.matchSize(flow, ["a", "b"], "both")).toBe(flow);

    const locked = absolute();
    ops.find(locked, "b")!.comp.locked = true;
    expect(ops.distribute(locked, ["a", "b", "c"], "horizontal")).toBe(locked);

    const separate = absolute();
    separate.sections[0].children.push({ id: "other", type: "rectangle", x: 2, y: 2, width: 10, height: 10 });
    expect(ops.canArrange(separate, ["a", "other"])).toBe(false);
  });

  it("requires explicit dimensions for edge and middle alignment", () => {
    const doc = absolute();
    delete ops.find(doc, "b")!.comp.height;
    expect(ops.canArrange(doc, ["a", "b"], ["height"])).toBe(false);
    expect(ops.align(doc, ["a", "b"], "bottom")).toBe(doc);
    expect(ops.align(doc, ["a", "b"], "top")).not.toBe(doc);
  });

  it("aligns measured first-line text baselines without changing other geometry", () => {
    const doc = absolute();
    const a = ops.find(doc, "a")!.comp;
    const b = ops.find(doc, "b")!.comp;
    a.type = "text";
    b.type = "text";
    const aligned = ops.alignTextBaseline(doc, ["a", "b"], { a: 12, b: 7 });
    expect(ops.find(aligned, "b")?.comp).toMatchObject({ x: 140, y: 25, width: 40, height: 50 });
    expect(ops.find(doc, "b")?.comp.y).toBe(70);
    expect(ops.alignTextBaseline(doc, ["a", "b"], { a: 12 })).toBe(doc);
    b.type = "rectangle";
    expect(ops.alignTextBaseline(doc, ["a", "b"], { a: 12, b: 7 })).toBe(doc);
  });

  it("tidies rendered boxes into reading-order rows with consistent gaps", () => {
    const doc = absolute();
    const sizes = { a: { width: 80, height: 30 }, b: { width: 40, height: 50 }, c: { width: 20, height: 20 } };
    const tidy = ops.tidyUp(doc, ["c", "b", "a"], sizes, 8);
    expect(ops.find(tidy, "a")?.comp).toMatchObject({ x: 10, y: 20 });
    expect(ops.find(tidy, "b")?.comp).toMatchObject({ x: 10, y: 58 });
    expect(ops.find(tidy, "c")?.comp).toMatchObject({ x: 10, y: 116 });

    const sameRow = absolute();
    ops.find(sameRow, "b")!.comp.y = 22;
    const grid = ops.tidyUp(sameRow, ["a", "b", "c"], sizes, 8);
    expect(ops.find(grid, "b")?.comp).toMatchObject({ x: 98, y: 20 });
    expect(ops.find(grid, "c")?.comp).toMatchObject({ x: 10, y: 78 });
    expect(ops.tidyUp(doc, ["a", "b"], { a: sizes.a }, 8)).toBe(doc);

    const occupied = absolute();
    ops.find(occupied, "a")!.list.push({ id: "other", type: "text", x: 10, y: 60, width: 90, height: 30 });
    expect(ops.tidyUp(occupied, ["a", "b", "c"], { ...sizes, other: { width: 90, height: 30 } }, 8)).toBe(occupied);

    const decorated = absolute();
    ops.find(decorated, "a")!.list.push({ id: "background", type: "rectangle", x: 0, y: 0, width: 300, height: 200 });
    expect(ops.tidyUp(decorated, ["a", "b", "c"], { ...sizes, background: { width: 300, height: 200 } }, 8)).not.toBe(decorated);
  });
});

describe("inserting a component tree", () => {
  it("gives every nested component a unique id", async () => {
    const { insert, walkAll } = await import("../../src/model/ops");
    const doc = { schemaVersion: "1.0", id: "d", name: "d", sections: [{ type: "detail", children: [{ id: "table-1", type: "table", dataset: "x", columns: [] }] }] } as any;
    const next = insert(doc, { type: "repeater", dataset: "orders", children: [{ type: "table", dataset: "row.lines", columns: [] }, { type: "container", children: [{ type: "text", value: "a" }, { type: "text", value: "b" }] }] }, undefined, "after", 0);
    const ids = [...walkAll(next)].map((l: any) => l.comp.id);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("table-1");
  });
});
