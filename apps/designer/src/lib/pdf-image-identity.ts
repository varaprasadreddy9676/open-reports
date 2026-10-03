import type { PaginatedReport, PositionedNode } from "@reporting/layout";

export interface ExpectedImage {
  page: number;
  componentId?: string;
  src: string;
}

export interface RasterImage {
  width: number;
  height: number;
  /** PDF.js ImageKind: 2 = RGB, 3 = RGBA. Source images use RGBA. */
  kind: 2 | 3;
  data: Uint8Array | Uint8ClampedArray;
}

function bitmapPixels(image: ImageBitmap): RasterImage | undefined {
  if (image.width * image.height > 2_000_000) return;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  context.drawImage(image, 0, 0);
  return { width: image.width, height: image.height, kind: 3, data: context.getImageData(0, 0, image.width, image.height).data };
}

export function planExpectedImages(paginated: PaginatedReport): ExpectedImage[] {
  const expected: ExpectedImage[] = [];
  const visit = (node: PositionedNode, page: number) => {
    if (node.component.type === "image" && node.component.src) expected.push({ page, componentId: node.component.id, src: node.component.src });
    for (const child of node.children ?? []) visit(child, page);
  };
  for (const page of paginated.pages) {
    for (const zone of [page.background, page.header, page.content, page.footer]) for (const node of zone) visit(node, page.number);
  }
  return expected;
}

/** Decodes the current embedded or linked source through the same server resource endpoint as the canvas. */
export async function decodeSourceImage(src: string, resolveLinked: (src: string) => Promise<string>): Promise<RasterImage | undefined> {
  const dataUrl = src.startsWith("data:") ? src : await resolveLinked(src);
  const image = await createImageBitmap(await (await fetch(dataUrl)).blob());
  try { return bitmapPixels(image); } finally { image.close(); }
}

/** PDF.js provides either raw image data or an ImageBitmap, depending on its runtime. */
export function decodePdfRaster(value: unknown): RasterImage | undefined {
  if (!value || typeof value !== "object") return;
  const raw = value as { width?: number; height?: number; kind?: number; data?: Uint8Array | Uint8ClampedArray; bitmap?: ImageBitmap };
  if (raw.bitmap) return bitmapPixels(raw.bitmap);
  if (!raw.width || !raw.height || !raw.data) return;
  const kind = raw.kind === 2 || raw.kind === 3 ? raw.kind : raw.data.length === raw.width * raw.height * 3 ? 2 : raw.data.length === raw.width * raw.height * 4 ? 3 : undefined;
  return kind ? { width: raw.width, height: raw.height, kind, data: raw.data } : undefined;
}

/** Mean RGB difference on visible, non-white samples. Undefined means identity cannot be checked reliably. */
export function imageDistance(source: RasterImage, actual: RasterImage): number | undefined {
  if (source.kind !== 3) return;
  if (source.width !== actual.width || source.height !== actual.height) return Infinity;
  const channels = actual.kind === 2 ? 3 : 4;
  if (source.data.length < source.width * source.height * 4 || actual.data.length < actual.width * actual.height * channels) return;
  const stepX = Math.max(1, Math.floor(source.width / 64));
  const stepY = Math.max(1, Math.floor(source.height / 64));
  let difference = 0;
  let samples = 0;
  for (let y = 0; y < source.height; y += stepY) for (let x = 0; x < source.width; x += stepX) {
    const pixel = y * source.width + x;
    const from = pixel * 4;
    const to = pixel * channels;
    if (source.data[from + 3]! < 240) continue;
    const red = source.data[from]!;
    const green = source.data[from + 1]!;
    const blue = source.data[from + 2]!;
    if (red > 245 && green > 245 && blue > 245) continue;
    difference += Math.abs(red - actual.data[to]!) + Math.abs(green - actual.data[to + 1]!) + Math.abs(blue - actual.data[to + 2]!);
    samples++;
  }
  return samples < 16 ? undefined : difference / (samples * 3);
}

/** One-to-one match so one PDF logo cannot satisfy two placed image components. */
export function matchImageIdentities(expected: { image: ExpectedImage; raster?: RasterImage }[], actual: RasterImage[]) {
  const pairs: { source: number; target: number; distance: number }[] = [];
  const checked = new Set<number>();
  expected.forEach(({ raster }, source) => {
    if (!raster) return;
    actual.forEach((candidate, target) => {
      const distance = imageDistance(raster, candidate);
      if (distance === undefined) return;
      checked.add(source);
      pairs.push({ source, target, distance });
    });
  });
  pairs.sort((a, b) => a.distance - b.distance);
  const matchedSources = new Set<number>();
  const matchedTargets = new Set<number>();
  for (const pair of pairs) {
    if (pair.distance > 12 || matchedSources.has(pair.source) || matchedTargets.has(pair.target)) continue;
    matchedSources.add(pair.source);
    matchedTargets.add(pair.target);
  }
  return {
    matched: matchedSources.size,
    checked: checked.size,
    missing: [...checked].filter((source) => !matchedSources.has(source)).map((source) => expected[source]!.image),
  };
}
