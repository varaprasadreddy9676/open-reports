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
});
