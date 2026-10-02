import { useEffect, useRef, type ReactNode } from "react";

export function InspectorActions({ label, children }: { label: string; children: ReactNode }) {
  const menu = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) menu.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  return (
    <details className="inspector-actions" ref={menu} onKeyDown={(event) => {
      if (event.key === "Escape") {
        menu.current?.removeAttribute("open");
        menu.current?.querySelector<HTMLElement>("summary")?.focus();
      }
    }} onClick={(event) => {
      if ((event.target as HTMLElement).closest("button")) menu.current?.removeAttribute("open");
    }}>
      <summary role="button" aria-label={label} title={label}>⋯</summary>
      <div className="inspector-actions-popover">{children}</div>
    </details>
  );
}
