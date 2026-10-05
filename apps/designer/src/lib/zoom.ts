import { useStore } from "../store";
import { anchoredScroll, clampZoom } from "./viewport";

const PT = 4 / 3;

/** Fit the physical page inside the available canvas, including its ruler and band chrome. */
export function fitZoom(pageWidthPt?: number): number {
  const canvas = document.querySelector(".canvas-scroll") as HTMLElement | null;
  const width = pageWidthPt ?? useStore.getState().engine.paginated?.pageSize.width;
  if (!canvas || !width) return 1;
  const style = getComputedStyle(canvas);
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  return clampZoom(+((canvas.clientWidth - padding) / (width * PT)).toFixed(2));
}

interface ZoomAnchor {
  page: number;
  /** Anchored point in page coordinates (points). */
  x: number;
  y: number;
  /** Where that point must stay on screen. */
  clientX: number;
  clientY: number;
}

let pendingAnchor: ZoomAnchor | null = null;
let anchorExpiry: ReturnType<typeof setTimeout> | undefined;
/** An anchor is only meaningful for the very next re-render; drop it if that never happens. */
const ANCHOR_LIFETIME_MS = 250;

function setAnchor(anchor: ZoomAnchor | null): void {
  clearTimeout(anchorExpiry);
  pendingAnchor = anchor;
  if (anchor) anchorExpiry = setTimeout(() => (pendingAnchor = null), ANCHOR_LIFETIME_MS);
}

function pageElements(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".canvas-scroll .page[data-testid^='page-']")];
}

/** The page under (or nearest to) a screen point, and that point in the page's own coordinates. */
function anchorAt(clientX: number, clientY: number): ZoomAnchor | null {
  // Measure the scale actually on screen: the store may already hold a zoom React has not rendered yet.
  const pageWidth = useStore.getState().engine.paginated?.pageSize.width;
  let best: { page: number; rect: DOMRect; distance: number } | null = null;
  pageElements().forEach((element, page) => {
    const rect = element.getBoundingClientRect();
    const distance = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
    if (!best || distance < best.distance) best = { page, rect, distance };
  });
  if (!best) return null;
  const { page, rect } = best as { page: number; rect: DOMRect };
  const k = pageWidth ? rect.width / pageWidth : PT * useStore.getState().zoom;
  return { page, x: (clientX - rect.left) / k, y: (clientY - rect.top) / k, clientX, clientY };
}

/**
 * Change the canvas zoom while keeping one screen point fixed: the cursor for wheel and pinch,
 * the middle of the canvas for keys and buttons.
 */
export function zoomCanvas(zoom: number, clientX?: number, clientY?: number): void {
  const store = useStore.getState();
  const next = clampZoom(zoom);
  if (next === store.zoom) return;
  const scroller = document.querySelector<HTMLElement>(".canvas-scroll");
  if (scroller) {
    const rect = scroller.getBoundingClientRect();
    setAnchor(anchorAt(clientX ?? rect.left + rect.width / 2, clientY ?? rect.top + rect.height / 2));
  }
  store.set({ zoom: next, fitToWidth: false });
}

/** Called by the canvas after it re-renders at a new zoom, to scroll the anchored point back under the cursor. */
export function restoreZoomAnchor(scroller: HTMLElement, k: number): void {
  const anchor = pendingAnchor;
  setAnchor(null);
  const page = anchor ? pageElements()[anchor.page] : undefined;
  if (!anchor || !page) return;
  const rect = page.getBoundingClientRect();
  scroller.scrollLeft = anchoredScroll({ scroll: scroller.scrollLeft, pageOffset: rect.left + scroller.scrollLeft, point: anchor.x, k, client: anchor.clientX });
  scroller.scrollTop = anchoredScroll({ scroll: scroller.scrollTop, pageOffset: rect.top + scroller.scrollTop, point: anchor.y, k, client: anchor.clientY });
}

export function zoomToFit(): void {
  setAnchor(null);
  useStore.getState().set({ zoom: fitZoom(), fitToWidth: true });
}

export function zoomToSelection(): void {
  setAnchor(null);
  const s = useStore.getState();
  const id = s.selection[0];
  const el = id ? document.querySelector<HTMLElement>(`[data-cid="${id}"]`) : null;
  const scroller = document.querySelector<HTMLElement>(".canvas-scroll");
  if (!el || !scroller) {
    zoomToFit();
    return;
  }
  const bounds = el.getBoundingClientRect();
  const factor = Math.min((scroller.clientWidth - 120) / Math.max(1, bounds.width), (scroller.clientHeight - 120) / Math.max(1, bounds.height), 4);
  s.set({ zoom: clampZoom(+(s.zoom * factor).toFixed(2)), fitToWidth: false });
  requestAnimationFrame(() => document.querySelector(`[data-cid="${id}"]`)?.scrollIntoView({ block: "center", inline: "center" }));
}
