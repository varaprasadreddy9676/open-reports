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
