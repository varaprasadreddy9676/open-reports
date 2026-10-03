import { describe, it, expect } from "vitest";
import { DEFAULT_GRID, DEFAULT_SNAP_TARGETS, minorStep, parseGrid, parseSnapTargets, snapToGrid, gridSpacingInUnit, gridSpacingFromUnit } from "../../src/lib/grid";
import { snapBox, snapResizeBox } from "../../src/lib/snap";

const MM = 72 / 25.4;

describe("grid settings", () => {
  it("keeps the historical 5 pt snap step by default", () => {
    expect(minorStep(DEFAULT_GRID)).toBe(5);
  });

  it("snaps to the minor step from an origin", () => {
    const grid = { major: 10 * MM, subdivisions: 2 };
    expect(snapToGrid(7.4 * MM, grid)).toBeCloseTo(5 * MM, 2);
    expect(snapToGrid(7.6 * MM, grid)).toBeCloseTo(10 * MM, 2);
    expect(snapToGrid(12 * MM, grid, 3 * MM)).toBeCloseTo(13 * MM, 2);
    expect(snapToGrid(-1, grid)).toBeCloseTo(0, 6);
  });

  it("converts spacing to and from every ruler unit, including printer dots at the report DPI", () => {
    expect(gridSpacingInUnit(10 * MM, "mm", 203)).toBeCloseTo(10, 6);
    expect(gridSpacingInUnit(72, "in", 203)).toBeCloseTo(1, 6);
    expect(gridSpacingInUnit(72, "dots", 300)).toBeCloseTo(300, 6);
    expect(gridSpacingFromUnit(8, "dots", 203)).toBeCloseTo((8 / 203) * 72, 6);
    expect(gridSpacingFromUnit(1, "cm", 203)).toBeCloseTo(10 * MM, 6);
    expect(gridSpacingFromUnit(12, "px", 203)).toBeCloseTo(9, 6);
  });

  it("rejects corrupt or out-of-range saved settings", () => {
    expect(parseGrid(null)).toEqual(DEFAULT_GRID);
    expect(parseGrid("not json")).toEqual(DEFAULT_GRID);
    expect(parseGrid(JSON.stringify({ major: -4, subdivisions: 5 }))).toEqual(DEFAULT_GRID);
    expect(parseGrid(JSON.stringify({ major: 20, subdivisions: 7 }))).toEqual({ major: 20, subdivisions: DEFAULT_GRID.subdivisions });
    expect(parseGrid(JSON.stringify({ major: 5000, subdivisions: 4 }))).toEqual({ major: 1000, subdivisions: 4 });
    expect(parseGrid(JSON.stringify({ major: 0.1, subdivisions: 1 }))).toEqual({ major: 1, subdivisions: 1 });
    expect(parseSnapTargets(JSON.stringify({ grid: false, objects: "yes", extra: true }))).toEqual({ ...DEFAULT_SNAP_TARGETS, grid: false });
    expect(parseSnapTargets("{")).toEqual(DEFAULT_SNAP_TARGETS);
  });
});

describe("snap target switches", () => {
  const bounds = { x: 40, y: 40, width: 500, height: 700 };
  it("can ignore the container edges and centre", () => {
    expect(snapBox({ x: 42, y: 300, width: 50, height: 20 }, [], bounds, true).x).toBe(40);
    expect(snapBox({ x: 42, y: 300, width: 50, height: 20 }, [], bounds, true, { x: [], y: [] }, { bounds: false }).x).toBe(42);
    expect(snapResizeBox({ x: 100, y: 100, width: 438, height: 20 }, "e", [], bounds, true, { x: [], y: [] }, { bounds: false }).box.width).toBe(438);
    expect(snapResizeBox({ x: 100, y: 100, width: 438, height: 20 }, "e", [], bounds, true).box.width).toBe(440);
  });
  it("can ignore equal spacing between neighbours", () => {
    const others = [{ x: 100, y: 100, width: 30, height: 20 }, { x: 200, y: 100, width: 30, height: 20 }];
    expect(snapBox({ x: 152, y: 100, width: 30, height: 20 }, others, bounds, true).x).toBe(150);
    expect(snapBox({ x: 152, y: 100, width: 30, height: 20 }, others, bounds, true, { x: [], y: [] }, { spacing: false }).x).toBe(152);
  });
});
