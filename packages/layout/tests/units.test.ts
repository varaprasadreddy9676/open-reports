import { describe, it, expect } from "vitest";
import { resolvePageGeometry, resolveDimension } from "../src/units.js";

describe("resolvePageGeometry", () => {
  it("converts A4 portrait to points with correct aspect ratio", () => {
    const geo = resolvePageGeometry({ size: "A4", unit: "mm", orientation: "portrait", margin: { top: 20, right: 15, bottom: 20, left: 15 } });
    expect(geo.width).toBeCloseTo(595.28, 0);
    expect(geo.height).toBeCloseTo(841.89, 0);
    expect(geo.width).toBeLessThan(geo.height);
  });

  it("swaps width/height for landscape", () => {
    const portrait = resolvePageGeometry({ size: "A4", unit: "mm", orientation: "portrait", margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    const landscape = resolvePageGeometry({ size: "A4", unit: "mm", orientation: "landscape", margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    expect(landscape.width).toBeCloseTo(portrait.height, 0);
    expect(landscape.height).toBeCloseTo(portrait.width, 0);
  });

  it("computes content area as page size minus margins", () => {
    const geo = resolvePageGeometry({ size: "A4", unit: "mm", orientation: "portrait", margin: { top: 20, right: 15, bottom: 20, left: 15 } });
    const marginPt = (20 * 72) / 25.4;
    expect(geo.contentHeight).toBeCloseTo(geo.height - 2 * marginPt, 1);
  });

  it("supports custom page dimensions", () => {
    const geo = resolvePageGeometry({ size: "custom", width: 100, height: 150, unit: "mm", orientation: "portrait", margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    expect(geo.width).toBeCloseTo((100 * 72) / 25.4, 0);
    expect(geo.height).toBeCloseTo((150 * 72) / 25.4, 0);
  });
});

describe("resolveDimension", () => {
  it("treats a bare number as the default unit", () => {
    expect(resolveDimension(10, 1000, "mm")).toBeCloseTo((10 * 72) / 25.4, 3);
  });

  it("parses explicit units", () => {
    expect(resolveDimension("1in", 1000, "pt")).toBeCloseTo(72, 3);
  });

  it("resolves percentages against the available space", () => {
    expect(resolveDimension("50%", 200, "pt")).toBe(100);
  });

  it("returns undefined for flex/auto sentinels", () => {
    expect(resolveDimension("*", 200, "pt")).toBeUndefined();
    expect(resolveDimension("auto", 200, "pt")).toBeUndefined();
    expect(resolveDimension(undefined, 200, "pt")).toBeUndefined();
  });
});
