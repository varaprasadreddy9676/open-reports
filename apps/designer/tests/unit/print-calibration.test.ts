import { expect, it } from "vitest";
import { calibrationFromMeasurements, zplCalibrationPattern } from "../../src/lib/print-calibration";

const page = { size: "custom" as const, width: 40, height: 25, unit: "mm" as const, orientation: "landscape" as const, margin: { top: 1.5, right: 2, bottom: 1.5, left: 2 } };

it("builds an uncorrected, measurable ZPL box inside 40 × 25 mm media", () => {
  const pattern = zplCalibrationPattern(page, 203, 1.5);
  expect(pattern.widthDots).toBe(320);
  expect(pattern.heightDots).toBe(200);
  expect(pattern.zpl).toContain("^PW320\n^LL200\n^LH0,0");
  expect(pattern.zpl).toMatch(/\^FO\d+,\d+\^GB\d+,\d+,1\^FS/);
  expect(pattern.expectedWidthMm).toBeGreaterThan(30);
  expect(pattern.expectedHeightMm).toBeGreaterThan(15);
});

it("derives a bounded correction from physical measurements", () => {
  const pattern = zplCalibrationPattern(page, 203);
  const correction = calibrationFromMeasurements(pattern, pattern.expectedWidthMm * 0.992, pattern.expectedHeightMm * 1.01, 0.5, -0.25);
  expect(correction.scaleX).toBeCloseTo(1 / 0.992, 5);
  expect(correction.scaleY).toBeCloseTo(1 / 1.01, 5);
  expect(correction.offsetXmm).toBe(0.5);
  expect(correction.offsetYmm).toBe(-0.25);
  expect(() => calibrationFromMeasurements(pattern, pattern.expectedWidthMm / 1.2)).toThrow(/more than 10%/);
});
