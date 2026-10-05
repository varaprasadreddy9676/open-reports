/** Canvas zoom limits and the presets that ⌘+ / ⌘− and the zoom buttons step through. */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
export const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8] as const;

const EPSILON = 0.001;
/** A mouse-wheel notch reports about 100; trackpad pinches report small deltas. Capping keeps one notch near 1.5×. */
const MAX_WHEEL_DELTA = 50;
const WHEEL_SENSITIVITY = 0.008;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(zoom * 1000) / 1000));
}

/** The next preset above (direction 1) or below (direction -1) the current zoom. */
export function nextZoomStep(zoom: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((step) => step > zoom + EPSILON) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find((step) => step < zoom - EPSILON) ?? MIN_ZOOM;
}

/** Continuous zoom for wheel and pinch input; exponential so zooming in and back out is symmetric. */
export function wheelZoom(zoom: number, deltaY: number): number {
  const delta = Math.max(-MAX_WHEEL_DELTA, Math.min(MAX_WHEEL_DELTA, deltaY));
  return clampZoom(zoom * Math.exp(-delta * WHEEL_SENSITIVITY));
}

export interface ScrollAnchor {
  /** Current scroll offset on this axis. */
  scroll: number;
  /** Page edge position in client space plus the current scroll offset, measured after the zoom re-rendered. */
  pageOffset: number;
  /** The anchored point in page coordinates (points). */
  point: number;
  /** Pixels per point at the new zoom. */
  k: number;
  /** Where the point must stay, in client space. */
  client: number;
}

/** The scroll offset that puts `point` back under `client` after a zoom change. */
export function anchoredScroll({ pageOffset, point, k, client }: ScrollAnchor): number {
  return pageOffset + point * k - client;
}
