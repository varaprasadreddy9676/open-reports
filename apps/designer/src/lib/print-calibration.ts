import { resolvePageGeometry } from "@reporting/layout";
import type { PageConfig, PrintCalibration } from "@reporting/schema";

export interface CalibrationPattern {
  zpl: string;
  widthDots: number;
  heightDots: number;
  expectedWidthMm: number;
  expectedHeightMm: number;
}

/** Raw, uncorrected box for measuring the printer's physical X/Y scale. */
export function zplCalibrationPattern(page: PageConfig, dpi: number, safeMarginMm = 0): CalibrationPattern {
  const geometry = resolvePageGeometry(page);
  const dots = (pt: number) => Math.round((pt / 72) * dpi);
  const mmDots = (mm: number) => Math.ceil((mm / 25.4) * dpi);
  const widthDots = dots(geometry.width);
  const heightDots = dots(geometry.height);
  const left = Math.max(dots(geometry.margin.left) + 8, mmDots(safeMarginMm + 1));
  const right = Math.max(dots(geometry.margin.right) + 8, mmDots(safeMarginMm + 1));
  const top = Math.max(dots(geometry.margin.top) + 8, mmDots(safeMarginMm + 1));
  const bottom = Math.max(dots(geometry.margin.bottom) + 8, mmDots(safeMarginMm + 1));
  const boxWidth = Math.min(mmDots(100), widthDots - left - right);
  const boxHeight = Math.min(mmDots(100), heightDots - top - bottom);
  if (boxWidth < mmDots(8) || boxHeight < mmDots(8)) throw new Error("This media has too little printable space for a calibration box. Reduce the page margins or safe margin first.");
  const zpl = ["^XA", `^PW${widthDots}`, `^LL${heightDots}`, "^LH0,0", `^FO${left},${top}^GB${boxWidth},${boxHeight},1^FS`, "^XZ", ""].join("\n");
  return { zpl, widthDots, heightDots, expectedWidthMm: boxWidth * 25.4 / dpi, expectedHeightMm: boxHeight * 25.4 / dpi };
}

/** Expected size divided by the user's measurement corrects printer scaling. */
export function calibrationFromMeasurements(pattern: CalibrationPattern, widthMm: number, heightMm?: number, offsetXmm = 0, offsetYmm = 0): PrintCalibration {
  if (!Number.isFinite(widthMm) || widthMm <= 0 || (heightMm !== undefined && (!Number.isFinite(heightMm) || heightMm <= 0))) throw new Error("Enter a positive measured width and, optionally, height.");
  if (!Number.isFinite(offsetXmm) || !Number.isFinite(offsetYmm) || Math.abs(offsetXmm) > 25 || Math.abs(offsetYmm) > 25) throw new Error("Offsets must be between −25 and 25 mm.");
  const scaleX = pattern.expectedWidthMm / widthMm;
  const scaleY = heightMm === undefined ? 1 : pattern.expectedHeightMm / heightMm;
  if (scaleX < 0.9 || scaleX > 1.1 || scaleY < 0.9 || scaleY > 1.1) throw new Error("The measurement needs more than 10% correction. Check the printer DPI, media size, and print scaling first.");
  return { scaleX, scaleY, offsetXmm, offsetYmm };
}
