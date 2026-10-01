import type { Box } from "@reporting/layout";

export interface Guide {
  axis: "x" | "y";
  pos: number;
  from: number;
  to: number;
}

export interface Distance {
  axis: "x" | "y";
  from: number;
  to: number;
  at: number;
  mm: number;
}

const MM = 25.4 / 72;
const THRESHOLD = 4;

/** Snap a moving box to the edges/centres of other boxes and the page margins. Returns the adjusted position plus guide lines to draw. */
export function snapBox(moving: Box, others: Box[], bounds: Box, enabled: boolean, extra: { x: number[]; y: number[] } = { x: [], y: [] }): { x: number; y: number; guides: Guide[]; distances: Distance[] } {
  let { x, y } = moving;
  const guides: Guide[] = [];
  const distances: Distance[] = [];
  if (!enabled) return { x, y, guides, distances };

  const xs = (b: Box) => [b.x, b.x + b.width / 2, b.x + b.width];
  const ys = (b: Box) => [b.y, b.y + b.height / 2, b.y + b.height];
  const targetsX = [bounds.x, bounds.x + bounds.width / 2, bounds.x + bounds.width, ...others.flatMap(xs), ...extra.x];
  const targetsY = [bounds.y, bounds.y + bounds.height / 2, bounds.y + bounds.height, ...others.flatMap(ys), ...extra.y];

  let bestX = { d: THRESHOLD + 1, delta: 0, at: 0 };
  for (const mine of xs({ ...moving, x })) for (const t of targetsX) if (Math.abs(t - mine) < bestX.d) bestX = { d: Math.abs(t - mine), delta: t - mine, at: t };
  if (bestX.d <= THRESHOLD) x += bestX.delta;

  let bestY = { d: THRESHOLD + 1, delta: 0, at: 0 };
  for (const mine of ys({ ...moving, y })) for (const t of targetsY) if (Math.abs(t - mine) < bestY.d) bestY = { d: Math.abs(t - mine), delta: t - mine, at: t };
  if (bestY.d <= THRESHOLD) y += bestY.delta;

  const box = { ...moving, x, y };
  if (bestX.d <= THRESHOLD) guides.push({ axis: "x", pos: bestX.at, from: Math.min(box.y, bounds.y), to: Math.max(box.y + box.height, bounds.y + bounds.height) });
  if (bestY.d <= THRESHOLD) guides.push({ axis: "y", pos: bestY.at, from: Math.min(box.x, bounds.x), to: Math.max(box.x + box.width, bounds.x + bounds.width) });

  // distance to the nearest neighbour on each side that overlaps on the other axis
  let left: Box | undefined, right: Box | undefined, above: Box | undefined, below: Box | undefined;
  for (const o of others) {
    const overlapY = o.y < box.y + box.height && o.y + o.height > box.y;
    const overlapX = o.x < box.x + box.width && o.x + o.width > box.x;
    if (overlapY && o.x + o.width <= box.x && (!left || o.x + o.width > left.x + left.width)) left = o;
    if (overlapY && o.x >= box.x + box.width && (!right || o.x < right.x)) right = o;
    if (overlapX && o.y + o.height <= box.y && (!above || o.y + o.height > above.y + above.height)) above = o;
    if (overlapX && o.y >= box.y + box.height && (!below || o.y < below.y)) below = o;
  }
  const midY = box.y + box.height / 2;
  const midX = box.x + box.width / 2;
  if (left) distances.push({ axis: "x", from: left.x + left.width, to: box.x, at: midY, mm: (box.x - left.x - left.width) * MM });
  if (right) distances.push({ axis: "x", from: box.x + box.width, to: right.x, at: midY, mm: (right.x - box.x - box.width) * MM });
  if (above) distances.push({ axis: "y", from: above.y + above.height, to: box.y, at: midX, mm: (box.y - above.y - above.height) * MM });
  if (below) distances.push({ axis: "y", from: box.y + box.height, to: below.y, at: midX, mm: (below.y - box.y - box.height) * MM });
  return { x, y, guides, distances };
}

export function rectsIntersect(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
