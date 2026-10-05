import type { Distance } from "./snap";

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MM = 25.4 / 72;
const span = (axis: "x" | "y", from: number, to: number, at: number): Distance => ({ axis, from, to, at, mm: (to - from) * MM });

function contains(outer: Box, inner: Box): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}

/**
 * Redlines from the selection to the element under the cursor while Alt is held: the gaps between
 * neighbours, or the four insets when one element sits inside the other. Coordinates are page points.
 */
export function measureBetween(selected: Box, other: Box): Distance[] {
  const [inner, outer] = contains(other, selected) ? [selected, other] : contains(selected, other) ? [other, selected] : [null, null];
  if (inner && outer) {
    const midY = inner.y + inner.height / 2;
    const midX = inner.x + inner.width / 2;
    return [
      span("x", outer.x, inner.x, midY),
      span("x", inner.x + inner.width, outer.x + outer.width, midY),
      span("y", outer.y, inner.y, midX),
      span("y", inner.y + inner.height, outer.y + outer.height, midX),
    ];
  }
  const distances: Distance[] = [];
  const right = selected.x + selected.width;
  const bottom = selected.y + selected.height;
  const midY = selected.y + selected.height / 2;
  const midX = selected.x + selected.width / 2;
  if (other.x >= right) distances.push(span("x", right, other.x, midY));
  else if (other.x + other.width <= selected.x) distances.push(span("x", other.x + other.width, selected.x, midY));
  if (other.y >= bottom) distances.push(span("y", bottom, other.y, midX));
  else if (other.y + other.height <= selected.y) distances.push(span("y", other.y + other.height, selected.y, midX));
  return distances;
}
