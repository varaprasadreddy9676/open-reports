import { describe, expect, it } from "vitest";
import { rulerAnchor } from "../../src/lib/ruler-origin";

const layout = {
  margin: { left: 42, top: 50, right: 42, bottom: 50 },
  pages: [{ header: [], content: [{
    component: { id: "parent" }, box: { x: 42, y: 80, width: 180, height: 90 },
    children: [
      { component: { id: "a" }, box: { x: 60, y: 100, width: 30, height: 10 } },
      { component: { id: "b" }, box: { x: 120, y: 130, width: 20, height: 10 } },
    ],
  }], footer: [] }],
};
const context = () => ({
  doc: { sections: [{ type: "detail", children: [{ id: "parent", type: "container", children: [{ id: "a", type: "text" }, { id: "b", type: "text" }] }] }] },
  engine: { paginated: layout, structure: { ...layout, bands: [{ sectionIndex: 0, y: 70, height: 110 }] }, problems: [] },
  canvasView: "structure" as const,
  selection: [] as string[],
  selectedBand: null as number | null,
});

describe("ruler origins", () => {
  it("uses page and printable origins without changing report coordinates", () => {
    expect(rulerAnchor("page", context() as any)).toMatchObject({ x: 0, y: 0, available: true });
    expect(rulerAnchor("printable", context() as any)).toMatchObject({ x: 42, y: 50, available: true });
  });

  it("uses the selected structure band top and printable left edge", () => {
    expect(rulerAnchor("section", { ...context(), selectedBand: 0 } as any)).toMatchObject({ x: 42, y: 70, available: true });
    expect(rulerAnchor("section", { ...context(), selection: ["a"] } as any)).toMatchObject({ x: 42, y: 70, available: true });
    expect(rulerAnchor("section", { ...context(), canvasView: "pages", selectedBand: 0 } as any)).toMatchObject({ x: 0, y: 0, available: false });
  });

  it("uses rendered selection bounds and falls back when selection is absent", () => {
    expect(rulerAnchor("selection", { ...context(), selection: ["a"] } as any)).toMatchObject({ x: 60, y: 100, available: true });
    expect(rulerAnchor("selection", { ...context(), selection: ["a", "b"] } as any)).toMatchObject({ x: 60, y: 100, available: true });
    expect(rulerAnchor("selection", { ...context(), selection: ["missing"] } as any)).toMatchObject({ x: 0, y: 0, available: false });
    expect(rulerAnchor("selection", context() as any)).toMatchObject({ x: 0, y: 0, available: false });
  });
});
