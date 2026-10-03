import { describe, it, expect } from "vitest";
import { snapBox, rectsIntersect } from "../../src/lib/snap";

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
  it("rectsIntersect", () => {
    expect(rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 11, y: 0, width: 10, height: 10 })).toBe(false);
  });
});
