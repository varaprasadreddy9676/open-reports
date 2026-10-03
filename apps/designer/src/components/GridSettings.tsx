import { useEffect, useState } from "react";
import { savePref, useStore } from "../store";
import { DEFAULT_SNAP_TARGETS, gridSpacingFromUnit, gridSpacingInUnit, minorStep, SNAP_TARGET_LABELS, SUBDIVISION_CHOICES, type GridSettings, type SnapTargets } from "../lib/grid";

const round = (value: number) => Math.round(value * 1000) / 1000;

/** Grid spacing in the ruler's unit, its subdivisions, and which targets dragging snaps to. */
export function GridSettingsControls() {
  const { grid, snapTargets, rulerUnit, doc, set } = useStore();
  const dpi = doc.print?.dpi ?? 203;
  const shown = round(gridSpacingInUnit(grid.major, rulerUnit, dpi));
  const [draft, setDraft] = useState(String(shown));
  useEffect(() => setDraft(String(shown)), [shown]);

  const saveGrid = (next: GridSettings) => {
    savePref("grid", JSON.stringify(next));
    set({ grid: next });
  };
  const commitSpacing = (text: string) => {
    const value = Number(text);
    if (!Number.isFinite(value) || value <= 0) return setDraft(String(shown));
    saveGrid({ ...grid, major: Math.min(1000, Math.max(1, gridSpacingFromUnit(value, rulerUnit, dpi))) });
  };
  const toggleTarget = (key: keyof SnapTargets, on: boolean) => {
    const next = { ...snapTargets, [key]: on };
    savePref("snapTargets", JSON.stringify(next));
    set({ snapTargets: next });
  };

  return (
    <>
      <label>
        Grid spacing{" "}
        <input
          data-testid="grid-spacing" type="number" min={0} step="any" inputMode="decimal" aria-label={`Grid spacing in ${rulerUnit}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commitSpacing(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commitSpacing(e.currentTarget.value); }}
        />{" "}{rulerUnit}
      </label>
      <label>
        Subdivisions{" "}
        <select data-testid="grid-subdivisions" value={grid.subdivisions} onChange={(e) => saveGrid({ ...grid, subdivisions: Number(e.target.value) })}>
          {SUBDIVISION_CHOICES.map((n) => <option key={n} value={n}>{n === 1 ? "None" : n}</option>)}
        </select>
      </label>
      <div className="canvas-unit-hint" data-testid="grid-step">Snaps every {round(gridSpacingInUnit(minorStep(grid), rulerUnit, dpi))} {rulerUnit}</div>
      <fieldset className="snap-targets" data-testid="snap-targets">
        <legend>Snap to</legend>
        {(Object.keys(DEFAULT_SNAP_TARGETS) as (keyof SnapTargets)[]).map((key) => (
          <label key={key} className="snap-target">
            <input type="checkbox" data-testid={`snap-${key}`} checked={snapTargets[key]} onChange={(e) => toggleTarget(key, e.target.checked)} />
            {SNAP_TARGET_LABELS[key]}
          </label>
        ))}
        <div className="canvas-unit-hint">Hold Alt/Option while dragging to ignore snapping.</div>
      </fieldset>
    </>
  );
}
