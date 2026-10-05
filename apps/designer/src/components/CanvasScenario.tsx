import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { CANVAS_SCENARIOS, scenarioList, type CanvasScenario } from "../lib/canvas-scenario";

/**
 * "What if the data were different?" — switch the canvas between the real sample and edge cases
 * (no rows, one row, 100 rows, long text…) and watch pagination react. Canvas only: saves, Preview and
 * exports keep using the report's own sample data.
 */
export function CanvasScenarioSwitch() {
  const doc = useStore((s) => s.doc);
  const sample = useStore((s) => s.sample);
  const scenario = useStore((s) => s.canvasScenario);
  const pages = useStore((s) => s.engine.paginated?.pages.length);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  if (!scenarioList(doc, sample)) return null;

  const choose = (next: CanvasScenario | null) => {
    const store = useStore.getState();
    store.set({ canvasScenario: next });
    void store.refresh();
    setOpen(false);
    root.current?.querySelector<HTMLButtonElement>(".scenario-trigger")?.focus();
  };
  const options: (CanvasScenario | null)[] = [null, ...CANVAS_SCENARIOS];

  return (
    <div ref={root} className={`canvas-scenario ${scenario ? "active" : ""}`} data-testid="canvas-scenario">
      <button
        type="button"
        className="scenario-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Try the layout with different data. Canvas only: Preview and exports use your sample data."
        onClick={() => setOpen(!open)}
      >
        <span className="scenario-dot" aria-hidden="true" />
        <span>Data: {scenario?.label ?? "Sample data"}</span>
        {pages !== undefined && <span className="scenario-pages">· {pages} {pages === 1 ? "page" : "pages"}</span>}
      </button>
      {scenario && (
        <button type="button" className="scenario-reset" aria-label="Back to sample data" title="Back to sample data" onClick={() => choose(null)}>
          ×
        </button>
      )}
      {open && (
        <div
          className="scenario-menu"
          role="menu"
          aria-label="Canvas data"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setOpen(false);
            }
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]")];
            const at = items.indexOf(document.activeElement as HTMLButtonElement);
            items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
          }}
        >
          <p className="scenario-note">Canvas only. Preview and exports use your sample data.</p>
          {options.map((option) => {
            const checked = (option?.id ?? null) === (scenario?.id ?? null);
            return (
              <button
                key={option?.id ?? "sample"}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                autoFocus={checked}
                data-testid={`scenario-${option?.id ?? "sample"}`}
                onClick={() => choose(option)}
              >
                {option?.label ?? "Sample data"}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
