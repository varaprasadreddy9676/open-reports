import * as ops from "../model/ops";

export interface GeometryDelta {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

const num = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const diff = (before: unknown, after: unknown): number => {
  const a = num(before);
  const b = num(after);
  return a === undefined || b === undefined ? 0 : Math.round((b - a) * 1000) / 1000;
};

/**
 * How far each element moved or resized between the document the canvas was last laid out from and the
 * current document. The canvas shifts those boxes immediately, so keyboard nudges, panel edits, align and
 * undo show up in the same frame instead of waiting for layout and pagination to finish.
 */
export function geometryDeltas(laidOut: ops.Doc | undefined, current: ops.Doc): Map<string, GeometryDelta> {
  const deltas = new Map<string, GeometryDelta>();
  if (!laidOut || laidOut === current) return deltas;
  const before = new Map<string, Record<string, unknown>>();
  for (const { comp } of ops.walkAll(laidOut)) if (comp.id) before.set(comp.id, comp);
  for (const { comp } of ops.walkAll(current)) {
    const old = comp.id ? before.get(comp.id) : undefined;
    if (!old || old === comp) continue;
    const delta = { dx: diff(old.x, comp.x), dy: diff(old.y, comp.y), dw: diff(old.width, comp.width), dh: diff(old.height, comp.height) };
    if (delta.dx || delta.dy || delta.dw || delta.dh) deltas.set(comp.id, delta);
  }
  return deltas;
}
