import { useEffect, type RefObject } from "react";

export const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Landing-page motion: reveals `[data-reveal]` elements as they scroll into view, feeds the pointer position
 * to CSS (`--mx`/`--my`) for spotlights, and lets `.magnetic` buttons lean toward the cursor.
 * Content stays visible without JavaScript or with reduced motion; the hidden state only applies under `.motion-ready`.
 */
export function useLandingMotion(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = root.current;
    if (!element || prefersReducedMotion() || !("IntersectionObserver" in window)) return;
    element.classList.add("motion-ready");
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      }
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.12 });
    element.querySelectorAll("[data-reveal]").forEach((target) => observer.observe(target));

    let frame = 0;
    const move = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target = event.target instanceof Element ? event.target : null;
        const spot = target?.closest<HTMLElement>("[data-spotlight]");
        if (spot) {
          const box = spot.getBoundingClientRect();
          spot.style.setProperty("--mx", `${event.clientX - box.left}px`);
          spot.style.setProperty("--my", `${event.clientY - box.top}px`);
        }
        const magnet = target?.closest<HTMLElement>(".magnetic");
        element.querySelectorAll<HTMLElement>(".magnetic.is-pulled").forEach((other) => {
          if (other !== magnet) { other.classList.remove("is-pulled"); other.style.translate = ""; }
        });
        if (magnet) {
          const box = magnet.getBoundingClientRect();
          magnet.classList.add("is-pulled");
          magnet.style.translate = `${(event.clientX - box.left - box.width / 2) * 0.18}px ${(event.clientY - box.top - box.height / 2) * 0.28}px`;
        }
      });
    };
    element.addEventListener("pointermove", move, { passive: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      element.removeEventListener("pointermove", move);
      element.classList.remove("motion-ready");
    };
  }, [root]);
}
