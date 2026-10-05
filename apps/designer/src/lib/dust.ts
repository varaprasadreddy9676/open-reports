/**
 * The delete effect: a removed element crumbles into shards that drift up and away, sweeping left to right
 * like dust in a breeze. Shards are clipped copies of the element's own DOM, so nothing is rasterised and
 * the effect costs nothing until it plays. Skipped entirely when the viewer prefers reduced motion.
 */
/** Target grain size in screen pixels: small enough to read as dust, not broken glass. */
const GRAIN = 12;
const MAX_SHARDS = 160;
const DURATION = 760;
const SWEEP = 360;
/** Shards are cloned DOM, so very large elements (long tables) break into a few big pieces instead. */
const MAX_SHARD_AREA = 600_000;
const MAX_CLONED_NODES = 60;

/** Columns and rows for an element: about one grain per 12 px, capped so the effect stays cheap. */
export function grainGrid(width: number, height: number): { columns: number; rows: number } {
  if (width * height > MAX_SHARD_AREA) return { columns: 4, rows: 2 };
  let columns = Math.max(3, Math.round(width / GRAIN));
  let rows = Math.max(2, Math.round(height / GRAIN));
  const scale = Math.sqrt(Math.min(1, MAX_SHARDS / (columns * rows)));
  columns = Math.max(3, Math.floor(columns * scale));
  rows = Math.max(2, Math.floor(rows * scale));
  return { columns, rows };
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A deterministic pseudo-random sequence, so the same element always breaks the same way. */
function random(seed: number): () => number {
  let value = seed % 2147483647 || 1;
  return () => (value = (value * 16807) % 2147483647) / 2147483647;
}

/** A jittered grid of polygons covering the box, in percentages, so neighbouring shards share edges. */
export function shardPolygons(columns: number, rows: number, seed = 1): { polygon: string; column: number; row: number }[] {
  const next = random(seed);
  const jitter = (index: number, count: number) => (index === 0 || index === count ? 0 : (next() - 0.5) * (60 / count));
  const xs = Array.from({ length: rows + 1 }, () => Array.from({ length: columns + 1 }, (_, c) => (c / columns) * 100 + jitter(c, columns)));
  const ys = Array.from({ length: rows + 1 }, (_, r) => Array.from({ length: columns + 1 }, () => (r / rows) * 100 + jitter(r, rows)));
  const point = (r: number, c: number) => `${xs[r]![c]!.toFixed(2)}% ${ys[r]![c]!.toFixed(2)}%`;
  const shards: { polygon: string; column: number; row: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      shards.push({ column: c, row: r, polygon: `polygon(${point(r, c)}, ${point(r, c + 1)}, ${point(r + 1, c + 1)}, ${point(r + 1, c)})` });
    }
  }
  return shards;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function crumble(element: HTMLElement, rect: Rect, seed: number): void {
  const layer = document.createElement("div");
  layer.className = "dust-layer";
  layer.setAttribute("aria-hidden", "true");
  // Shards live outside the page, so carry over the inherited text styles they would otherwise lose.
  const computed = getComputedStyle(element);
  Object.assign(layer.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, fontFamily: computed.fontFamily, color: computed.color });
  // Shards clone the element's DOM, so busy elements (tables, containers) break into a few big pieces.
  const grid = element.querySelectorAll("*").length > MAX_CLONED_NODES ? { columns: 4, rows: 2 } : grainGrid(rect.width, rect.height);
  const shards = shardPolygons(grid.columns, grid.rows, seed);
  const next = random(seed * 31);
  const animations: Animation[] = [];
  for (const shard of shards) {
    const piece = document.createElement("div");
    piece.className = "dust-shard";
    piece.style.clipPath = shard.polygon;
    const copy = element.cloneNode(true) as HTMLElement;
    // Copies must not duplicate ids, test ids or labelled-by targets of the live page.
    for (const node of [copy, ...copy.querySelectorAll<HTMLElement>("*")]) for (const attr of ["id", "data-cid", "data-testid", "aria-labelledby", "aria-describedby"]) node.removeAttribute(attr);
    Object.assign(copy.style, { position: "absolute", left: "0px", top: "0px", width: `${rect.width}px`, height: `${rect.height}px`, margin: "0" });
    piece.appendChild(copy);
    layer.appendChild(piece);
    // Grains lift and blow to the right, shrinking and fading like ash.
    const drift = 40 + next() * 70;
    const lift = 15 + next() * 45;
    const keyframes: Keyframe[] = [
      { transform: "translate(0, 0) rotate(0deg) scale(1)", opacity: 1, filter: "blur(0)" },
      { transform: `translate(${drift * 0.3}px, ${-lift * 0.3}px) rotate(${(next() - 0.5) * 30}deg) scale(0.9)`, opacity: 0.8, filter: "blur(0.5px)", offset: 0.35 },
      { transform: `translate(${drift}px, ${-lift}px) rotate(${(next() - 0.5) * 90}deg) scale(0.4)`, opacity: 0, filter: "blur(1.5px)" },
    ];
    const delay = (shard.column / Math.max(1, shards.at(-1)!.column)) * SWEEP + next() * 80;
    animations.push(piece.animate(keyframes, { duration: DURATION, delay, easing: "cubic-bezier(0.2, 0.6, 0.35, 1)", fill: "forwards" }));
  }
  document.body.appendChild(layer);
  Promise.all(animations.map((animation) => animation.finished)).catch(() => undefined).finally(() => layer.remove());
}

/** Plays the effect over each element; call before the elements leave the DOM. */
export function disintegrate(ids: string[]): void {
  if (typeof Element === "undefined" || typeof Element.prototype.animate !== "function" || prefersReducedMotion()) return;
  ids.forEach((id, index) => {
    const element = document.querySelector<HTMLElement>(`.canvas-scroll [data-cid="${CSS.escape(id)}"]`);
    if (!element) return;
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    let seed = 7 + index;
    for (const char of id) seed = (seed * 31 + char.charCodeAt(0)) % 2147483647;
    crumble(element, rect, seed);
  });
}
