import { describe, it, expect } from "vitest";
import { geometryDeltas } from "../../src/lib/optimistic-geometry";

const doc = (children: unknown[]) => ({ schemaVersion: "1.0", id: "r", name: "r", page: { size: "A4" }, datasets: [], sections: [{ type: "detail", children }] }) as any;

describe("optimistic geometry", () => {
  it("reports how far a free-positioned element moved since the last layout", () => {
    const laid = doc([{ id: "a", type: "text", text: "A", x: 10, y: 20 }]);
    const current = doc([{ id: "a", type: "text", text: "A", x: 15, y: 18 }]);
    expect(geometryDeltas(laid, current).get("a")).toEqual({ dx: 5, dy: -2, dw: 0, dh: 0 });
  });

  it("reports size changes for numeric widths and heights", () => {
    const laid = doc([{ id: "a", type: "rectangle", x: 0, y: 0, width: 40, height: 10 }]);
    const current = doc([{ id: "a", type: "rectangle", x: 0, y: 0, width: 50, height: 12 }]);
    expect(geometryDeltas(laid, current).get("a")).toEqual({ dx: 0, dy: 0, dw: 10, dh: 2 });
  });

  it("finds nested elements", () => {
    const laid = doc([{ id: "box", type: "container", children: [{ id: "a", type: "text", text: "A", x: 1, y: 1 }] }]);
    const current = doc([{ id: "box", type: "container", children: [{ id: "a", type: "text", text: "A", x: 4, y: 1 }] }]);
    expect(geometryDeltas(laid, current).get("a")?.dx).toBe(3);
  });

  it("ignores unchanged elements and flow elements without coordinates", () => {
    const laid = doc([{ id: "a", type: "text", text: "A", x: 1, y: 1 }, { id: "b", type: "text", text: "B" }]);
    const current = doc([{ id: "a", type: "text", text: "A", x: 1, y: 1 }, { id: "b", type: "text", text: "B2" }]);
    expect(geometryDeltas(laid, current).size).toBe(0);
  });

  it("returns nothing when there is no previous layout or the documents are the same object", () => {
    const current = doc([{ id: "a", type: "text", text: "A", x: 1, y: 1 }]);
    expect(geometryDeltas(undefined, current).size).toBe(0);
    expect(geometryDeltas(current, current).size).toBe(0);
  });
});
