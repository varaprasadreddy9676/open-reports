import { describe, it, expect } from "vitest";
import { measureBetween } from "../../src/lib/measure";

const MM = 72 / 25.4;
const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe("Alt-hover measuring", () => {
  it("measures the horizontal gap between side-by-side elements", () => {
    const [gap] = measureBetween(box(0, 0, 10, 10), box(10 + 5 * MM, 0, 10, 10));
    expect(gap).toMatchObject({ axis: "x", from: 10, to: 10 + 5 * MM, at: 5 });
    expect(gap!.mm).toBeCloseTo(5, 5);
  });

  it("measures the vertical gap between stacked elements", () => {
    const [gap, ...rest] = measureBetween(box(0, 0, 10, 10), box(0, 30, 10, 10));
    expect(rest).toEqual([]);
    expect(gap).toMatchObject({ axis: "y", from: 10, to: 30, at: 5 });
    expect(gap!.mm).toBeCloseTo(20 / MM, 6);
  });

  it("measures both gaps for diagonal neighbours", () => {
    expect(measureBetween(box(0, 0, 10, 10), box(20, 40, 10, 10)).map((d) => d.axis)).toEqual(["x", "y"]);
  });

  it("measures all four insets when one element sits inside the other", () => {
    const insets = measureBetween(box(10, 20, 30, 40), box(0, 0, 100, 100));
    expect(insets.map((d) => Math.round(d.to - d.from))).toEqual([10, 60, 20, 40]);
  });

  it("returns nothing for overlapping elements that do not contain each other", () => {
    expect(measureBetween(box(0, 0, 20, 20), box(10, 10, 20, 20))).toEqual([]);
  });
});
