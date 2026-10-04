import { describe, expect, it } from "vitest";
import { comparePages, describeDiff, diffRaster, type RasterPage } from "../../src/lib/visual-diff";

function page(width: number, height: number, paint?: (x: number, y: number) => [number, number, number] | undefined): RasterPage {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const colour = paint?.(x, y);
    if (colour) data.set([...colour, 255], (y * width + x) * 4);
  }
  return { width, height, data };
}

describe("visual page comparison", () => {
  it("finds the changed region and ignores anti-aliasing noise", () => {
    const before = page(20, 10, (x, y) => (x < 5 && y < 5 ? [0, 0, 0] : undefined));
    const after = page(20, 10, (x, y) => (x < 5 && y < 5 ? [10, 10, 10] : x >= 10 && x < 14 && y >= 2 && y < 4 ? [0, 0, 255] : undefined));
    const diff = diffRaster(before, after);
    expect(diff.changedPixels).toBe(8);
    expect(diff.bounds).toEqual({ x: 10, y: 2, width: 4, height: 2 });
    expect(diff.ratio).toBeCloseTo(8 / 200, 6);
    expect([...diff.overlay!.data.slice((2 * 20 + 10) * 4, (2 * 20 + 10) * 4 + 4)]).toEqual([220, 38, 38, 255]);
  });

  it("compares documents page by page, including added and removed pages and different page sizes", () => {
    const blank = page(10, 10);
    const marked = page(10, 10, (x, y) => (x === 3 && y === 3 ? [0, 0, 0] : undefined));
    const taller = page(10, 12);
    const diffs = comparePages([blank, blank, blank], [blank, marked]);
    expect(diffs.map((d) => [d.page, d.status, d.changedPixels])).toEqual([[1, "same", 0], [2, "changed", 1], [3, "removed", 100]]);
    expect(comparePages([blank], [taller])[0]).toMatchObject({ status: "same", totalPixels: 120 });
    expect(comparePages([page(10, 10, () => [0, 0, 0])], [taller])[0]!.status).toBe("changed");
    expect(describeDiff(diffs)).toBe("2 of 3 pages differ: page 2 (1.0% changed), page 3 removed.");
    expect(describeDiff([diffs[0]!])).toBe("No visual differences across 1 page.");
  });
});
