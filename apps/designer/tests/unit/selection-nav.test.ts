import { describe, it, expect } from "vitest";
import { childSelection, levelSelection, parentSelection, reorder, siblingSelection } from "../../src/lib/selection-nav";
import * as ops from "../../src/model/ops";

const doc = {
  schemaVersion: "1.0",
  id: "r",
  name: "r",
  page: { size: "A4" },
  datasets: [],
  sections: [
    { type: "pageHeader", children: [{ id: "logo", type: "image" }] },
    {
      type: "detail",
      children: [
        { id: "box", type: "container", children: [{ id: "a", type: "text", text: "A" }, { id: "b", type: "text", text: "B" }, { id: "c", type: "text", text: "C" }] },
        { id: "total", type: "text", text: "Total" },
      ],
    },
  ],
} as unknown as ops.Doc;

const order = (d: ops.Doc, parent: string) => (ops.find(d, parent)!.comp.children as { id: string }[]).map((c) => c.id);

describe("selection navigation", () => {
  it("selects the parent container, and nothing above a band's top level", () => {
    expect(parentSelection(doc, ["a", "b"])).toEqual(["box"]);
    expect(parentSelection(doc, ["box"])).toEqual([]);
  });

  it("selects a container's children", () => {
    expect(childSelection(doc, ["box"])).toEqual(["a", "b", "c"]);
    expect(childSelection(doc, ["a"])).toEqual([]);
  });

  it("moves to the next or previous sibling and stops at the ends, so Tab can leave the canvas", () => {
    expect(siblingSelection(doc, "a", 1)).toBe("b");
    expect(siblingSelection(doc, "b", -1)).toBe("a");
    expect(siblingSelection(doc, "c", 1)).toBeUndefined();
    expect(siblingSelection(doc, "a", -1)).toBeUndefined();
  });

  it("select-all picks the siblings of the selection, or every band's top level", () => {
    expect(levelSelection(doc, ["b"])).toEqual(["a", "b", "c"]);
    expect(levelSelection(doc, [])).toEqual(["logo", "box", "total"]);
  });
});

describe("reorder", () => {
  it("brings forward and sends backward by one", () => {
    expect(order(reorder(doc, ["a"], "forward"), "box")).toEqual(["b", "a", "c"]);
    expect(order(reorder(doc, ["c"], "backward"), "box")).toEqual(["a", "c", "b"]);
  });

  it("brings to the front and sends to the back, keeping the relative order of several elements", () => {
    expect(order(reorder(doc, ["a", "b"], "front"), "box")).toEqual(["c", "a", "b"]);
    expect(order(reorder(doc, ["b", "c"], "back"), "box")).toEqual(["b", "c", "a"]);
  });

  it("moves several elements forward without them leapfrogging each other", () => {
    expect(order(reorder(doc, ["a", "b"], "forward"), "box")).toEqual(["c", "a", "b"]);
  });

  it("does not change the document object when nothing moves", () => {
    expect(reorder(doc, ["c"], "forward")).toBe(doc);
  });
});
