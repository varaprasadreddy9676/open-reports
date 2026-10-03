import { describe, expect, it } from "vitest";
import { canvasTiles } from "../../src/lib/pdf-canvas";

describe("PDF canvas tiling", () => {
  it("uses one canvas for an ordinary page", () => {
    expect(canvasTiles(794, 1123, 2)).toEqual([{ x: 0, y: 0, width: 794, height: 1123 }]);
  });

  it("bounds each tile on a long receipt and covers the full page", () => {
    const tiles = canvasTiles(300, 20_000, 2);
    expect(tiles.length).toBeGreaterThan(1);
    expect(tiles[0]).toEqual({ x: 0, y: 0, width: 300, height: 1024 });
    expect(tiles.at(-1)!.y + tiles.at(-1)!.height).toBe(20_000);
    expect(tiles.every((tile) => Math.ceil(tile.width * 2) <= 2048 && Math.ceil(tile.height * 2) <= 2048)).toBe(true);
  });

  it("tiles wide pages horizontally as well", () => {
    const tiles = canvasTiles(9000, 500, 2);
    expect(tiles.map((tile) => tile.x)).toEqual([0, 1024, 2048, 3072, 4096, 5120, 6144, 7168, 8192]);
    expect(tiles.at(-1)!.x + tiles.at(-1)!.width).toBe(9000);
  });

  it("does not plan invalid surfaces", () => {
    expect(canvasTiles(0, 100, 2)).toEqual([]);
    expect(canvasTiles(Number.POSITIVE_INFINITY, 100, 2)).toEqual([]);
  });
});
