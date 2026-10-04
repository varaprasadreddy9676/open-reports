/** An RGBA raster of one rendered page. */
export interface RasterPage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface PageDiff {
  page: number;
  status: "same" | "changed" | "added" | "removed";
  changedPixels: number;
  totalPixels: number;
  /** Changed share of the page, 0..1. */
  ratio: number;
  /** Smallest rectangle containing every changed pixel. */
  bounds?: { x: number; y: number; width: number; height: number };
  /** The new page faded, with changed pixels in red. */
  overlay?: RasterPage;
}

/** Per-channel difference treated as anti-aliasing noise rather than a change. */
export const DEFAULT_TOLERANCE = 32;

const pixel = (page: RasterPage | undefined, x: number, y: number): [number, number, number, number] => {
  if (!page || x >= page.width || y >= page.height) return [255, 255, 255, 255];
  const i = (y * page.width + x) * 4;
  return [page.data[i]!, page.data[i + 1]!, page.data[i + 2]!, page.data[i + 3]!];
};

/** Compares two rasters pixel by pixel; differently sized pages are compared on white beyond their edges. */
export function diffRaster(before: RasterPage, after: RasterPage, tolerance = DEFAULT_TOLERANCE): Omit<PageDiff, "page" | "status"> {
  const width = Math.max(before.width, after.width);
  const height = Math.max(before.height, after.height);
  const overlay = new Uint8ClampedArray(width * height * 4);
  let changed = 0;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = pixel(before, x, y);
      const b = pixel(after, x, y);
      const o = (y * width + x) * 4;
      const different = Math.abs(a[0] - b[0]) > tolerance || Math.abs(a[1] - b[1]) > tolerance || Math.abs(a[2] - b[2]) > tolerance || Math.abs(a[3] - b[3]) > tolerance;
      if (different) {
        changed++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        overlay.set([220, 38, 38, 255], o);
      } else {
        // Faded greyscale of the new page for context.
        const grey = Math.round(0.299 * b[0] + 0.587 * b[1] + 0.114 * b[2]);
        const faded = Math.round(255 - (255 - grey) * 0.35);
        overlay.set([faded, faded, faded, 255], o);
      }
    }
  }
  const total = width * height;
  return {
    changedPixels: changed,
    totalPixels: total,
    ratio: total ? changed / total : 0,
    ...(changed ? { bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } } : {}),
    overlay: { width, height, data: overlay },
  };
}

/** Compares two documents page by page; pages present in only one are added or removed. */
export function comparePages(before: RasterPage[], after: RasterPage[], tolerance = DEFAULT_TOLERANCE): PageDiff[] {
  const pages = Math.max(before.length, after.length);
  return Array.from({ length: pages }, (_, index) => {
    const a = before[index];
    const b = after[index];
    if (!a || !b) {
      const only = (a ?? b)!;
      const total = only.width * only.height;
      return { page: index + 1, status: a ? "removed" : "added", changedPixels: total, totalPixels: total, ratio: 1 } as PageDiff;
    }
    const diff = diffRaster(a, b, tolerance);
    return { page: index + 1, status: diff.changedPixels ? "changed" : "same", ...diff };
  });
}

export function describeDiff(diffs: PageDiff[]): string {
  if (!diffs.length) return "Neither version has pages.";
  const changed = diffs.filter((d) => d.status !== "same");
  if (!changed.length) return `No visual differences across ${diffs.length} page${diffs.length === 1 ? "" : "s"}.`;
  const parts = changed.map((d) => d.status === "changed" ? `page ${d.page} (${(d.ratio * 100).toFixed(d.ratio < 0.01 ? 2 : 1)}% changed)` : `page ${d.page} ${d.status}`);
  return `${changed.length} of ${diffs.length} page${diffs.length === 1 ? "" : "s"} differ: ${parts.join(", ")}.`;
}
