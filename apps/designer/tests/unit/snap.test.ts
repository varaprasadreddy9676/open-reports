import { describe, it, expect } from "vitest";
import { snapBox, rectsIntersect } from "../../src/lib/snap";

const bounds = { x: 40, y: 40, width: 500, height: 700 };

describe("snapBox", () => {
  it("snaps left edges to a neighbour and reports a guide", () => {
    const r = snapBox({ x: 102, y: 300, width: 50, height: 20 }, [{ x: 100, y: 100, width: 80, height: 20 }], bounds, true);
    expect(r.x).toBe(100);
    expect(r.guides.some((g) => g.axis === "x" && g.pos === 100)).toBe(true);
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
  it("rectsIntersect", () => {
    expect(rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
    expect(rectsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 11, y: 0, width: 10, height: 10 })).toBe(false);
  });
});
