import type { Box } from "@reporting/layout";

export interface Guide {
  axis: "x" | "y";
  pos: number;
  from: number;
  to: number;
  kind?: "baseline";
}

export interface BaselineSnap {
  movingOffset: number;
  targets: { pos: number; box: Box }[];
}

export interface Distance {
  axis: "x" | "y";
  from: number;
  to: number;
  at: number;
  mm: number;
  equal?: boolean;
}

const MM = 25.4 / 72;
const THRESHOLD = 4;

interface SpacingMatch {
  pos: number;
  gap: number;
  reference: { from: number; to: number; at: number };
}

function measureDistances(box: Box, others: Box[]): Distance[] {
  const distances: Distance[] = [];
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
  return distances;
}

/** Equal gaps between neighbours, or one matching gap immediately outside a pair. */
function spacingMatch(moving: Box, others: Box[], bounds: Box, axis: "x" | "y"): SpacingMatch | undefined {
  const start = (b: Box) => axis === "x" ? b.x : b.y;
  const size = (b: Box) => axis === "x" ? b.width : b.height;
  const end = (b: Box) => start(b) + size(b);
  const orthStart = (b: Box) => axis === "x" ? b.y : b.x;
  const orthEnd = (b: Box) => orthStart(b) + (axis === "x" ? b.height : b.width);
  const aligned = others.filter((b) => orthStart(b) < orthEnd(moving) && orthEnd(b) > orthStart(moving)).sort((a, b) => start(a) - start(b));
  const limit = end(bounds);
  const at = Math.max(orthStart(bounds) + 8, Math.min(orthStart(moving), ...aligned.map(orthStart)) - 16);
  let best: SpacingMatch | undefined;
  for (let i = 0; i < aligned.length - 1; i++) {
    const a = aligned[i]!;
    const b = aligned[i + 1]!;
    const referenceGap = start(b) - end(a);
    if (referenceGap < 0) continue;
    const candidates = [
      { pos: (end(a) + start(b) - size(moving)) / 2, gap: (referenceGap - size(moving)) / 2 },
      { pos: start(a) - referenceGap - size(moving), gap: referenceGap },
      { pos: end(b) + referenceGap, gap: referenceGap },
    ];
    for (const candidate of candidates) {
      if (candidate.gap < 0 || candidate.pos < start(bounds) || candidate.pos + size(moving) > limit) continue;
      if (Math.abs(candidate.pos - start(moving)) > THRESHOLD) continue;
      if (aligned.some((o) => candidate.pos < end(o) && candidate.pos + size(moving) > start(o))) continue;
      if (!best || Math.abs(candidate.pos - start(moving)) < Math.abs(best.pos - start(moving))) {
        best = { ...candidate, reference: { from: end(a), to: start(b), at } };
      }
    }
  }
  return best;
}

/** Snap a moving box to the edges/centres of other boxes and the page margins. Returns the adjusted position plus guide lines to draw. */
export function snapBox(moving: Box, others: Box[], bounds: Box, enabled: boolean, extra: { x: number[]; y: number[]; baseline?: BaselineSnap } = { x: [], y: [] }): { x: number; y: number; guides: Guide[]; distances: Distance[]; snapped: { x: boolean; y: boolean } } {
  let { x, y } = moving;
  const guides: Guide[] = [];
  if (!enabled) return { x, y, guides, distances: [] as Distance[], snapped: { x: false, y: false } };

  const xs = (b: Box) => [b.x, b.x + b.width / 2, b.x + b.width];
  const ys = (b: Box) => [b.y, b.y + b.height / 2, b.y + b.height];
  const targetsX: { pos: number; box?: Box }[] = [
    ...[bounds.x, bounds.x + bounds.width / 2, bounds.x + bounds.width].map((pos) => ({ pos })),
    ...others.flatMap((box) => xs(box).map((pos) => ({ pos, box }))),
    ...extra.x.map((pos) => ({ pos })),
  ];
  const targetsY: { pos: number; box?: Box }[] = [
    ...[bounds.y, bounds.y + bounds.height / 2, bounds.y + bounds.height].map((pos) => ({ pos })),
    ...others.flatMap((box) => ys(box).map((pos) => ({ pos, box }))),
    ...extra.y.map((pos) => ({ pos })),
  ];

  let bestX: { d: number; delta: number; at: number; source?: Box } = { d: THRESHOLD + 1, delta: 0, at: 0 };
  for (const mine of xs({ ...moving, x })) for (const target of targetsX) if (Math.abs(target.pos - mine) < bestX.d) bestX = { d: Math.abs(target.pos - mine), delta: target.pos - mine, at: target.pos, source: target.box };
  const spacingX = spacingMatch(moving, others, bounds, "x");
  const equalX = spacingX && Math.abs(spacingX.pos - x) <= bestX.d ? spacingX : undefined;
  if (equalX) x = equalX.pos;
  else if (bestX.d <= THRESHOLD) x += bestX.delta;

  let bestY: { d: number; delta: number; at: number; source?: Box; kind?: "baseline" } = { d: THRESHOLD + 1, delta: 0, at: 0 };
  for (const mine of ys({ ...moving, y })) for (const target of targetsY) if (Math.abs(target.pos - mine) < bestY.d) bestY = { d: Math.abs(target.pos - mine), delta: target.pos - mine, at: target.pos, source: target.box };
  if (extra.baseline) {
    const mine = y + extra.baseline.movingOffset;
    for (const target of extra.baseline.targets) {
      const d = Math.abs(target.pos - mine);
      if (d <= THRESHOLD && d <= bestY.d) bestY = { d, delta: target.pos - mine, at: target.pos, source: target.box, kind: "baseline" };
    }
  }
  const spacingY = spacingMatch(moving, others, bounds, "y");
  const equalY = spacingY && Math.abs(spacingY.pos - y) <= bestY.d ? spacingY : undefined;
  if (equalY) y = equalY.pos;
  else if (bestY.d <= THRESHOLD) y += bestY.delta;

  const box = { ...moving, x, y };
  if (!equalX && bestX.d <= THRESHOLD) guides.push({ axis: "x", pos: bestX.at, from: Math.min(box.y, bestX.source?.y ?? bounds.y), to: Math.max(box.y + box.height, bestX.source ? bestX.source.y + bestX.source.height : bounds.y + bounds.height) });
  if (!equalY && bestY.d <= THRESHOLD) guides.push({ axis: "y", pos: bestY.at, from: Math.min(box.x, bestY.source?.x ?? bounds.x), to: Math.max(box.x + box.width, bestY.source ? bestY.source.x + bestY.source.width : bounds.x + bounds.width), ...(bestY.kind ? { kind: bestY.kind } : {}) });

  const distances = measureDistances(box, others);
  for (const [axis, equal] of [["x", equalX], ["y", equalY]] as const) {
    if (!equal) continue;
    for (const distance of distances) if (distance.axis === axis && Math.abs(distance.mm / MM - equal.gap) < 0.1) { distance.equal = true; distance.at = equal.reference.at; }
    if (distances.filter((d) => d.axis === axis && d.equal).length < 2) {
      distances.push({ axis, ...equal.reference, mm: (equal.reference.to - equal.reference.from) * MM, equal: true });
    }
  }
  return { x, y, guides, distances, snapped: { x: Boolean(equalX || bestX.d <= THRESHOLD), y: Boolean(equalY || bestY.d <= THRESHOLD) } };
}

/** Snap only the edge under a resize handle; the opposite edge stays fixed. */
export function snapResizeBox(proposed: Box, handle: string, others: Box[], bounds: Box, enabled: boolean, extra: { x: number[]; y: number[] } = { x: [], y: [] }): { box: Box; guides: Guide[]; distances: Distance[]; snapped: { x: boolean; y: boolean } } {
  const box = { ...proposed };
  const guides: Guide[] = [];
  const snapped = { x: false, y: false };
  if (!enabled) return { box, guides, distances: [], snapped };

  for (const axis of ["x", "y"] as const) {
    const fromStart = axis === "x" ? handle.includes("w") : handle.includes("n");
    const fromEnd = axis === "x" ? handle.includes("e") : handle.includes("s");
    if (!fromStart && !fromEnd) continue;
    const start = axis === "x" ? box.x : box.y;
    const size = axis === "x" ? box.width : box.height;
    const active = fromStart ? start : start + size;
    const edge = axis === "x" ? bounds.x : bounds.y;
    const extent = axis === "x" ? bounds.width : bounds.height;
    const targets: { pos: number; source?: Box }[] = [
      ...[edge, edge + extent / 2, edge + extent, ...extra[axis]].map((pos) => ({ pos })),
      ...others.flatMap((source) => {
        const origin = axis === "x" ? source.x : source.y;
        const length = axis === "x" ? source.width : source.height;
        return [origin, origin + length / 2, origin + length].map((pos) => ({ pos, source }));
      }),
    ];
    const target = targets.reduce<{ pos: number; source?: Box; delta: number } | undefined>((best, candidate) => {
      const delta = Math.abs(candidate.pos - active);
      return delta <= THRESHOLD && (!best || delta < best.delta) ? { ...candidate, delta } : best;
    }, undefined);
    if (!target) continue;
    const opposite = fromStart ? start + size : start;
    const nextSize = fromStart ? opposite - target.pos : target.pos - opposite;
    if (nextSize < (axis === "x" ? 8 : 4)) continue;
    if (axis === "x") {
      if (fromStart) box.x = target.pos;
      box.width = nextSize;
      guides.push({ axis, pos: target.pos, from: Math.min(box.y, target.source?.y ?? bounds.y), to: Math.max(box.y + box.height, target.source ? target.source.y + target.source.height : bounds.y + bounds.height) });
    } else {
      if (fromStart) box.y = target.pos;
      box.height = nextSize;
      guides.push({ axis, pos: target.pos, from: Math.min(box.x, target.source?.x ?? bounds.x), to: Math.max(box.x + box.width, target.source ? target.source.x + target.source.width : bounds.x + bounds.width) });
    }
    snapped[axis] = true;
  }
  return { box, guides, distances: measureDistances(box, others), snapped };
}

export function rectsIntersect(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
