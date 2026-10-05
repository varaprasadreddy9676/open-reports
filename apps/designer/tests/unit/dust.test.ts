import { describe, it, expect } from "vitest";
import { grainGrid, shardPolygons } from "../../src/lib/dust";

describe("delete effect shards", () => {
  it("covers the element with one shard per grid cell", () => {
    const shards = shardPolygons(8, 4, 42);
    expect(shards).toHaveLength(32);
    expect(new Set(shards.map((s) => `${s.column}:${s.row}`)).size).toBe(32);
  });

  it("keeps the outer edges straight so the element's outline is intact before it breaks", () => {
    const [first] = shardPolygons(4, 2, 3);
    expect(first!.polygon.startsWith("polygon(0.00% 0.00%")).toBe(true);
  });

  it("breaks the same way every time for the same seed", () => {
    expect(shardPolygons(6, 3, 9)).toEqual(shardPolygons(6, 3, 9));
    expect(shardPolygons(6, 3, 9)).not.toEqual(shardPolygons(6, 3, 10));
  });
});

describe("grain size", () => {
  it("uses fine grains for small elements and caps the shard count", () => {
    expect(grainGrid(120, 60)).toEqual({ columns: 10, rows: 5 });
    const big = grainGrid(500, 300);
    expect(big.columns * big.rows).toBeLessThanOrEqual(160);
  });

  it("breaks very large elements into a few pieces", () => {
    expect(grainGrid(1200, 900)).toEqual({ columns: 4, rows: 2 });
  });
});
