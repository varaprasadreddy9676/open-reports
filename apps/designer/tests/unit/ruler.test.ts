import { describe, expect, it } from "vitest";
import { pointsPerRulerUnit, rulerTicks, tickSteps } from "../../src/lib/ruler";

describe("printer-dot rulers", () => {
  it("converts printer dots using the report's DPI", () => {
    expect(pointsPerRulerUnit("dots", 203)).toBeCloseTo(72 / 203);
    expect(pointsPerRulerUnit("dots", 300)).toBeCloseTo(72 / 300);
    expect(pointsPerRulerUnit("mm", 300)).toBeCloseTo(72 / 25.4);
  });

  it("places the same dot at different physical positions for 203 and 300 DPI", () => {
    const at203 = rulerTicks(300, 1, "dots", 203).find((tick) => tick.value === 200);
    const at300 = rulerTicks(300, 1, "dots", 300).find((tick) => tick.value === 200);
    expect(at203?.position).toBeCloseTo(200 * 72 / 203);
    expect(at300?.position).toBeCloseTo(200 * 72 / 300);
    expect(at300!.position).toBeLessThan(at203!.position);
    expect(tickSteps("dots", 1, 203).major).toBe(200);
  });

  it("moves zero to the printable margin without shifting physical ruler positions", () => {
    const marginPt = 2 * 72 / 25.4;
    const ticks = rulerTicks(300, 1, "dots", 203, marginPt);
    expect(ticks.find((tick) => tick.value === 0)?.position).toBeCloseTo(marginPt);
    expect(rulerTicks(300, 1, "dots", 203, 20 * 72 / 25.4).some((tick) => tick.value < 0)).toBe(true);
  });
});
