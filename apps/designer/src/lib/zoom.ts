import { useStore } from "../store";

/** Fit the physical page inside the available canvas, including its ruler and band chrome. */
export function fitZoom(pageWidthPt?: number): number {
  const canvas = document.querySelector(".canvas-scroll") as HTMLElement | null;
  const width = pageWidthPt ?? useStore.getState().engine.paginated?.pageSize.width;
  if (!canvas || !width) return 1;
  const style = getComputedStyle(canvas);
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  return Math.max(0.25, Math.min(3, +((canvas.clientWidth - padding) / (width * (4 / 3))).toFixed(2)));
}

export function zoomToSelection(): void {
  const s = useStore.getState();
  const id = s.selection[0];
  const el = id ? document.querySelector<HTMLElement>(`[data-cid="${id}"]`) : null;
  const scroller = document.querySelector<HTMLElement>(".canvas-scroll");
  if (!el || !scroller) {
    s.set({ zoom: fitZoom(), fitToWidth: true });
    return;
  }
  const bounds = el.getBoundingClientRect();
  const factor = Math.min((scroller.clientWidth - 120) / bounds.width, (scroller.clientHeight - 120) / bounds.height, 4);
  s.set({ zoom: Math.max(0.25, Math.min(3, +(s.zoom * factor).toFixed(2))), fitToWidth: false });
  requestAnimationFrame(() => document.querySelector(`[data-cid="${id}"]`)?.scrollIntoView({ block: "center", inline: "center" }));
}
