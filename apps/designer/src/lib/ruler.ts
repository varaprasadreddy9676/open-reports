import type { RulerUnit } from "../store";

const POINTS_PER_UNIT = { mm: 72 / 25.4, cm: 72 / 2.54, in: 72, pt: 1, px: 0.75 } as const;
const NICE = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];

export function pointsPerRulerUnit(unit: RulerUnit, dpi = 203): number {
  return unit === "dots" ? 72 / dpi : POINTS_PER_UNIT[unit];
}

/** Label spacing stays legible while dot positions remain tied to the selected printer DPI. */
export function tickSteps(unit: RulerUnit, k: number, dpi = 203): { major: number; minor: number } {
  const pxPerUnit = pointsPerRulerUnit(unit, dpi) * k;
  const fractions = unit === "in" ? [0.125, 0.25, 0.5, 1, 2, 5, 10] : unit === "cm" ? [0.1, 0.5, 1, 2, 5, 10] : NICE;
  const major = fractions.find((step) => step * pxPerUnit >= 48) ?? fractions[fractions.length - 1]!;
  const minor = major / (major === 1 || major === 10 || major === 100 ? 10 : major === 2 || major === 20 ? 4 : 5);
  return { major, minor: Math.max(minor, 6 / pxPerUnit) };
}

export function rulerTicks(lengthPx: number, k: number, unit: RulerUnit, dpi = 203, originPt = 0): { value: number; position: number; major: boolean }[] {
  const { major, minor } = tickSteps(unit, k, dpi);
  const pxPerUnit = pointsPerRulerUnit(unit, dpi) * k;
  const originPx = originPt * k;
  const first = Math.ceil(-originPx / (minor * pxPerUnit));
  const last = Math.floor((lengthPx - originPx) / (minor * pxPerUnit));
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => {
    const value = (first + index) * minor;
    return {
      value,
      position: originPx + value * pxPerUnit,
      major: Math.abs(value / major - Math.round(value / major)) < 1e-6,
    };
  });
}
