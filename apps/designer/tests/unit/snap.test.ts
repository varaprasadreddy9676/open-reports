import { describe, it, expect } from "vitest";
import { snapBox, snapResizeBox, rectsIntersect } from "../../src/lib/snap";

const bounds = { x: 40, y: 40, width: 500, height: 700 };

describe("snapBox", () => {
  it("snaps left edges to a neighbour and reports a guide", () => {
    const r = snapBox({ x: 102, y: 300, width: 50, height: 20 }, [{ x: 100, y: 100, width: 80, height: 20 }], bounds, true);
    expect(r.x).toBe(100);
    expect(r.guides).toContainEqual({ axis: "x", pos: 100, from: 100, to: 320 });
  });
  it("leaves the position alone when snapping is off or far away", () => {
    expect(snapBox({ x: 111, y: 300, width: 50, height: 20 }, [{ x: 100, y: 100, width: 80, height: 20 }], bounds, false).x).toBe(111);
    expect(snapBox({ x: 111, y: 301, width: 50, height: 20 }, [{ x: 200, y: 100, width: 80, height: 20 }], bounds, true).x).toBe(111);
  });
  it("measures the gap to the neighbour above in mm", () => {
    const r = snapBox({ x: 100, y: 150, width: 50, height: 20 }, [{ x: 100, y: 100, width: 80, height: 20 }], bounds, true);
    const d = r.distances.find((x) => x.axis === "y")!;
    expect(d.mm).toBeCloseTo((150 - 120) * (25.4 / 72), 1);
  });
  it("snaps between neighbours when both gaps become equal", () => {
    const r = snapBox({ x: 152, y: 100, width: 30, height: 20 }, [
      { x: 100, y: 100, width: 30, height: 20 },
      { x: 200, y: 100, width: 30, height: 20 },
    ], bounds, true);
    expect(r.x).toBe(150);
    expect(r.snapped.x).toBe(true);
    expect(r.distances.filter((d) => d.axis === "x" && d.equal).map((d) => d.mm / (25.4 / 72))).toEqual([20, 20]);
  });
  it("extends a matching gap after a pair and marks the reference", () => {
    const r = snapBox({ x: 202, y: 100, width: 30, height: 20 }, [
      { x: 100, y: 100, width: 30, height: 20 },
      { x: 150, y: 100, width: 30, height: 20 },
    ], bounds, true);
    expect(r.x).toBe(200);
    expect(r.distances.filter((d) => d.axis === "x" && d.equal)).toHaveLength(2);
    expect(snapBox({ x: 202, y: 100, width: 30, height: 20 }, [
      { x: 100, y: 100, width: 30, height: 20 },
      { x: 150, y: 100, width: 30, height: 20 },
    ], bounds, false)).toMatchObject({ x: 202, distances: [], snapped: { x: false } });
  });
  it("snaps vertical spacing only for neighbours in the same column", () => {
    const r = snapBox({ x: 100, y: 202, width: 30, height: 20 }, [
      { x: 100, y: 100, width: 30, height: 20 },
      { x: 100, y: 150, width: 30, height: 20 },
    ], bounds, true);
    expect(r.y).toBe(200);
    expect(r.distances.filter((d) => d.axis === "y" && d.equal)).toHaveLength(2);
  });
  it("snaps a dragged text baseline to a sibling text baseline", () => {
    const other = { x: 100, y: 116, width: 50, height: 20 };
    const moving = { x: 200, y: 130, width: 50, height: 20 };
    const extra = { x: [], y: [], baseline: { movingOffset: 10, targets: [{ pos: 138, box: other }] } };
    const result = snapBox(moving, [other], bounds, true, extra);
    expect(result.y).toBe(128);
    expect(result.guides).toContainEqual({ axis: "y", pos: 138, from: 100, to: 250, kind: "baseline" });
    expect(result.snapped.y).toBe(true);
    expect(snapBox(moving, [other], bounds, false, extra).y).toBe(130);
  });
  it("prefers a sibling's baseline over a nearer box edge when both are in range", () => {
    // Text baselines depend on font metrics, so an edge can land a point closer than the baseline the author aims for.
    const other = { x: 100, y: 100, width: 50, height: 40 };
    const moving = { x: 200, y: 117, width: 50, height: 24 };
    const extra = { x: [], y: [], baseline: { movingOffset: 10, targets: [{ pos: 124, box: other }] } };
    const result = snapBox(moving, [other], bounds, true, extra);
    // The moving bottom (141) is 1pt from the sibling's bottom edge (140); its baseline (127) is 3pt from 124.
    expect(result.y).toBe(114);
    expect(result.guides).toContainEqual(expect.objectContaining({ axis: "y", pos: 124, kind: "baseline" }));
  });
  it("snaps only active resize edges to sibling geometry", () => {
    const other = { x: 200, y: 200, width: 40, height: 30 };
    const east = snapResizeBox({ x: 100, y: 200, width: 98, height: 30 }, "e", [other], bounds, true);
    expect(east.box).toEqual({ x: 100, y: 200, width: 100, height: 30 });
    expect(east.guides).toContainEqual({ axis: "x", pos: 200, from: 200, to: 230 });
    expect(east.distances.some((d) => d.axis === "x" && d.mm === 0)).toBe(true);
    expect(east.snapped).toEqual({ x: true, y: false });

    const west = snapResizeBox({ x: 202, y: 200, width: 98, height: 30 }, "w", [other], bounds, true);
    expect(west.box).toEqual({ x: 200, y: 200, width: 100, height: 30 });
    const south = snapResizeBox({ x: 200, y: 100, width: 40, height: 98 }, "s", [other], bounds, true);
    expect(south.box).toEqual({ x: 200, y: 100, width: 40, height: 100 });
    const north = snapResizeBox({ x: 200, y: 202, width: 40, height: 98 }, "n", [other], bounds, true);
    expect(north.box).toEqual({ x: 200, y: 200, width: 40, height: 100 });
    expect(snapResizeBox({ x: 100, y: 200, width: 98, height: 30 }, "e", [other], bounds, false)).toMatchObject({ box: { width: 98 }, guides: [], distances: [] });
  });
  it("rectsIntersect", () => {
    expect(rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 11, y: 0, width: 10, height: 10 })).toBe(false);
  });
});
