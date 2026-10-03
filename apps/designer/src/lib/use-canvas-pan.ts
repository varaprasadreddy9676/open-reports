import { useEffect, type RefObject } from "react";

/** Keys and pointer presses aimed at these keep their normal behaviour (typing, activating a control). */
const INTERACTIVE = "input, textarea, select, button, a[href], [contenteditable=''], [contenteditable='true'], [role='button'], [role='menuitem'], [role='tab'], [role='checkbox'], [role='switch']";

function isInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(INTERACTIVE);
}

/**
 * Hand-tool panning for a scrollable canvas: hold Space and drag, or drag with the middle mouse button.
 * Listeners sit on the document in the capture phase, so a pan never also starts a selection, marquee or
 * component drag underneath it. `enabled` is false while a dialog is open or outside design mode.
 */
export function useCanvasPan(scroller: RefObject<HTMLElement>, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let spaceHeld = false;
    let pan: { pointerId: number; x: number; y: number; element: HTMLElement } | null = null;

    const setClass = (name: string, on: boolean) => scroller.current?.classList.toggle(name, on);
    const endPan = () => {
      if (pan?.element.hasPointerCapture(pan.pointerId)) pan.element.releasePointerCapture(pan.pointerId);
      pan = null;
      setClass("panning", false);
    };
    const reset = () => {
      spaceHeld = false;
      endPan();
      setClass("pan-ready", false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.ctrlKey || event.metaKey || event.altKey || isInteractive(event.target)) return;
      if (!scroller.current?.isConnected) return;
      event.preventDefault(); // otherwise Space scrolls the page
      if (spaceHeld) return;
      spaceHeld = true;
      setClass("pan-ready", true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space" || !spaceHeld) return;
      spaceHeld = false;
      setClass("pan-ready", false);
      endPan();
    };

    const onPointerDown = (event: PointerEvent) => {
      const element = scroller.current;
      if (!element || !(event.target instanceof Node) || !element.contains(event.target)) return;
      const middle = event.button === 1;
      if (!middle && !(spaceHeld && event.button === 0)) return;
      event.preventDefault();
      event.stopPropagation();
      pan = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, element };
      element.setPointerCapture(event.pointerId);
      setClass("panning", true);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!pan || event.pointerId !== pan.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      pan.element.scrollLeft -= event.clientX - pan.x;
      pan.element.scrollTop -= event.clientY - pan.y;
      pan.x = event.clientX;
      pan.y = event.clientY;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!pan || event.pointerId !== pan.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      endPan();
    };
    // Middle-button press would otherwise start the browser's autoscroll on some platforms.
    const onAuxClick = (event: MouseEvent) => {
      if (event.button === 1 && scroller.current?.contains(event.target as Node)) event.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", reset);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerUp, true);
    document.addEventListener("auxclick", onAuxClick, true);
    return () => {
      reset();
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", reset);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerUp, true);
      document.removeEventListener("auxclick", onAuxClick, true);
    };
  }, [scroller, enabled]);
}
