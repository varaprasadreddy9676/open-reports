import { describe, expect, it } from "vitest";
import { imageDistance, matchImageIdentities, planExpectedImages, type RasterImage } from "../../src/lib/pdf-image-identity";

const source = (rgb: [number, number, number]): RasterImage => ({
  width: 8, height: 8, kind: 3,
  data: Uint8Array.from(Array.from({ length: 64 }, () => [...rgb, 255]).flat()),
});
const pdf = (rgb: [number, number, number]): RasterImage => ({
  width: 8, height: 8, kind: 2,
  data: Uint8Array.from(Array.from({ length: 64 }, () => rgb).flat()),
});

describe("PDF image identity", () => {
  it("collects image sources and matches decoded pixels one-to-one", () => {
    const layout = { pages: [{ number: 1, background: [], header: [
      { component: { type: "image", id: "left", src: "left.png" }, box: {} },
      { component: { type: "image", id: "right", src: "right.png" }, box: {} },
    ], content: [], footer: [] }] } as any;
    const expected = planExpectedImages(layout);
    expect(expected).toEqual([{ page: 1, componentId: "left", src: "left.png" }, { page: 1, componentId: "right", src: "right.png" }]);
    expect(imageDistance(source([220, 20, 20]), pdf([220, 20, 20]))).toBe(0);
    expect(imageDistance(source([220, 20, 20]), pdf([20, 20, 220]))).toBeGreaterThan(12);
    const result = matchImageIdentities([
      { image: expected[0]!, raster: source([220, 20, 20]) },
      { image: expected[1]!, raster: source([20, 20, 220]) },
    ], [pdf([220, 20, 20]), pdf([220, 20, 20])]);
    expect(result).toEqual({ matched: 1, checked: 2, missing: [expected[1]] });
  });
});
