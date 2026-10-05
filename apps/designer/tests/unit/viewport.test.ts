import { describe, it, expect } from "vitest";
import { MAX_ZOOM, MIN_ZOOM, clampZoom, nextZoomStep, wheelZoom, anchoredScroll } from "../../src/lib/viewport";

describe("zoom steps", () => {
  it("steps to the next preset in either direction", () => {
    expect(nextZoomStep(1, 1)).toBe(1.25);
    expect(nextZoomStep(1, -1)).toBe(0.75);
  });

  it("snaps an in-between zoom to the nearest preset in the direction of travel", () => {
    expect(nextZoomStep(0.83, 1)).toBe(1);
    expect(nextZoomStep(0.83, -1)).toBe(0.75);
  });

  it("stops at the limits", () => {
    expect(nextZoomStep(MAX_ZOOM, 1)).toBe(MAX_ZOOM);
    expect(nextZoomStep(MIN_ZOOM, -1)).toBe(MIN_ZOOM);
  });

  it("clamps any zoom into the supported range", () => {
    expect(clampZoom(100)).toBe(MAX_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(1);
  });
});

describe("wheel zoom", () => {
  it("zooms in when scrolling up and out when scrolling down", () => {
    expect(wheelZoom(1, -10)).toBeGreaterThan(1);
    expect(wheelZoom(1, 10)).toBeLessThan(1);
  });

  it("is symmetric, so pinching out and back returns to the start", () => {
    expect(wheelZoom(wheelZoom(1, -12), 12)).toBeCloseTo(1, 6);
  });

  it("limits a single mouse-wheel notch to a comfortable step", () => {
    const notch = wheelZoom(1, -100);
    expect(notch).toBeGreaterThan(1.1);
    expect(notch).toBeLessThanOrEqual(1.5);
  });
});

describe("anchored scroll", () => {
  it("keeps the page point under the cursor still when zoom changes", () => {
    // Page point 100pt sits 300px from the page's left edge at k=3; after zooming to k=6 it would sit at 600px.
    const next = anchoredScroll({ scroll: 50, pageOffset: 20, point: 100, k: 6, client: 320 });
    // The page's left edge is at pageOffset - scroll in client space; point lands at client when scroll is adjusted.
    expect(20 - next + 100 * 6).toBe(320);
  });
});
