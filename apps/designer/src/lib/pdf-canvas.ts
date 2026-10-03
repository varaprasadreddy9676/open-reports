export interface CanvasTile {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MAX_CANVAS_PIXELS = 16_000_000;
const MAX_CANVAS_SIDE = 16_384;
const TILE_PIXELS = 2_048;

/** Keep every backing canvas within practical browser GPU and memory limits. */
export function canvasTiles(width: number, height: number, pixelRatio: number): CanvasTile[] {
  if (![width, height, pixelRatio].every(Number.isFinite) || !(width > 0 && height > 0 && pixelRatio > 0)) return [];
  const backingWidth = Math.ceil(width * pixelRatio);
  const backingHeight = Math.ceil(height * pixelRatio);
  if (backingWidth <= MAX_CANVAS_SIDE && backingHeight <= MAX_CANVAS_SIDE && backingWidth * backingHeight <= MAX_CANVAS_PIXELS) {
    return [{ x: 0, y: 0, width, height }];
  }
  const tileSize = TILE_PIXELS / pixelRatio;
  const tiles: CanvasTile[] = [];
  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      tiles.push({ x, y, width: Math.min(tileSize, width - x), height: Math.min(tileSize, height - y) });
    }
  }
  return tiles;
}
