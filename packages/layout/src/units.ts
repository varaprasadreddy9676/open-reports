import type { PageConfig, Unit } from "@reporting/schema";

/** Everything in the layout engine is normalized to points (1/72 inch) --
 * the same unit PDF uses natively, which avoids a conversion step in the
 * PDF renderer and is precise enough for on-screen HTML (1pt ~= 1.333px). */
const POINTS_PER_UNIT: Record<Unit, number> = {
  px: 0.75, // assumes 96 CSS px per inch, matching the HTML renderer's CSS
  pt: 1,
  mm: 72 / 25.4,
  cm: 72 / 2.54,
  in: 72,
};

export function toPoints(value: number, unit: Unit): number {
  return value * POINTS_PER_UNIT[unit]!;
}

/** Resolves a schema Dimension (number | "10mm" | "50%" | "*" | "auto") to an
 * absolute point value against the available space. "*" and "auto" resolve
 * to `undefined`, signaling "let the caller decide" (flex share / intrinsic
 * size) rather than a concrete number. */
export function resolveDimension(
  dim: number | string | undefined,
  available: number,
  defaultUnit: Unit
): number | undefined {
  if (dim === undefined) return undefined;
  if (typeof dim === "number") return toPoints(dim, defaultUnit);
  if (dim === "*" || dim === "auto") return undefined;
  const percentMatch = /^(-?\d+(\.\d+)?)%$/.exec(dim);
  if (percentMatch) return (Number(percentMatch[1]) / 100) * available;
  const unitMatch = /^(-?\d+(\.\d+)?)(px|pt|mm|cm|in)$/.exec(dim);
  if (unitMatch) return toPoints(Number(unitMatch[1]), unitMatch[3] as Unit);
  const bare = Number(dim);
  return Number.isNaN(bare) ? undefined : toPoints(bare, defaultUnit);
}

const PAGE_SIZES_MM: Record<string, { width: number; height: number }> = {
  A3: { width: 297, height: 420 },
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
};

export interface PageGeometry {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  contentWidth: number;
  contentHeight: number;
}

export function resolvePageGeometry(page: PageConfig): PageGeometry {
  let widthMm: number;
  let heightMm: number;

  if (page.size === "custom" && page.width && page.height) {
    const unit = page.unit;
    widthMm = toPoints(page.width, unit) / (72 / 25.4);
    heightMm = toPoints(page.height, unit) / (72 / 25.4);
  } else {
    const dims = PAGE_SIZES_MM[page.size] ?? PAGE_SIZES_MM.A4!;
    widthMm = dims.width;
    heightMm = dims.height;
  }

  let width = toPoints(widthMm, "mm");
  let height = toPoints(heightMm, "mm");
  // Orientation normalizes the shape: landscape is always wider than tall, portrait taller than wide,
  // whichever way round the custom width/height were written.
  if ((page.orientation === "landscape" && width < height) || (page.orientation === "portrait" && width > height)) {
    [width, height] = [height, width];
  }

  const margin = {
    top: toPoints(page.margin.top, page.unit),
    right: toPoints(page.margin.right, page.unit),
    bottom: toPoints(page.margin.bottom, page.unit),
    left: toPoints(page.margin.left, page.unit),
  };

  return {
    width,
    height,
    margin,
    contentWidth: width - margin.left - margin.right,
    contentHeight: height - margin.top - margin.bottom,
  };
}
