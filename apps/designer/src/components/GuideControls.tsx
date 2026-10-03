import { useEffect, useState } from "react";
import type { Guide } from "@reporting/schema";
import { useStore } from "../store";
import { pointsPerRulerUnit } from "../lib/ruler";
import * as ops from "../model/ops";
import { Icon } from "./Icon";
import { rulerAnchor } from "../lib/ruler-origin";

function GuideRow({ guide, unitPt, unit, origin, limit }: { guide: Guide; unitPt: number; unit: string; origin: number; limit: number }) {
  const shown = () => {
    const precision = unit === "dots" ? 1 : 100;
    return String(Math.round(((guide.pos - origin) / unitPt) * precision) / precision);
  };
  const [name, setName] = useState(guide.name ?? "");
  const [position, setPosition] = useState(shown);
  useEffect(() => setName(guide.name ?? ""), [guide.name]);
  useEffect(() => setPosition(shown()), [guide.pos, origin, unitPt, unit]);
  const update = (patch: Partial<Guide>, coalesce?: string) => {
    const st = useStore.getState();
    st.setDoc(ops.updateGuide(st.doc, guide.id, patch), { keepSelection: true, coalesce });
  };
  const commitPosition = () => {
    const value = Number(position);
    if (position.trim() && Number.isFinite(value)) {
      const point = Math.max(0, Math.min(limit, origin + value * unitPt));
      update({ pos: Math.round(point * 10) / 10 }, `guide-${guide.id}`);
    } else setPosition(shown());
  };
  const commitName = () => {
    if (name !== (guide.name ?? "")) update({ name: name.trim() || undefined }, `guide-name-${guide.id}`);
  };
  return <div className="guide-control-row" data-testid={`guide-control-${guide.id}`}>
    <span className="guide-axis" title={guide.axis === "x" ? "Vertical guide" : "Horizontal guide"}>{guide.axis === "x" ? "V" : "H"}</span>
    <input aria-label="Guide name" placeholder={guide.axis === "x" ? "Vertical guide" : "Horizontal guide"} value={name} onChange={(event) => setName(event.target.value)} onBlur={commitName} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
    <input className="guide-position" type="number" step={unit === "dots" ? 1 : 0.1} aria-label="Guide position" title={`Position in ${unit} from ruler zero`} disabled={!!guide.locked} value={position} onChange={(event) => setPosition(event.target.value)} onBlur={commitPosition} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
    <button type="button" aria-label={guide.locked ? "Unlock guide" : "Lock guide"} aria-pressed={!!guide.locked} title={guide.locked ? "Unlock guide" : "Lock guide"} onClick={() => update({ locked: !guide.locked })}><Icon name={guide.locked ? "lock" : "unlock"} small /></button>
    <button type="button" className="danger" aria-label="Delete guide" title={guide.locked ? "Unlock to delete" : "Delete guide"} disabled={!!guide.locked} onClick={() => {
      const st = useStore.getState();
      st.setDoc(ops.removeGuide(st.doc, guide.id), { keepSelection: true });
    }}>×</button>
  </div>;
}

export function GuideControls() {
  const { doc, engine, canvasView, rulerUnit, rulerOrigin, selection, selectedBand } = useStore();
  const page = canvasView === "structure" ? engine.structure ?? engine.paginated : engine.paginated;
  const anchor = rulerAnchor(rulerOrigin, { doc, engine, canvasView, selection, selectedBand });
  const dpi = doc.print?.dpi ?? 203;
  const unitPt = pointsPerRulerUnit(rulerUnit, dpi);
  const guides: Guide[] = doc.guides ?? [];
  const add = (axis: "x" | "y") => {
    if (!page) return;
    const size = axis === "x" ? page.pageSize.width : page.pageSize.height;
    const start = axis === "x" ? page.margin.left : page.margin.top;
    const end = axis === "x" ? page.margin.right : page.margin.bottom;
    const st = useStore.getState();
    st.setDoc(ops.addGuide(st.doc, axis, start + (size - start - end) / 2).doc, { keepSelection: true });
  };

  return <div className="guide-controls" data-testid="guide-controls">
    <div className="guide-controls-head"><strong>Guides</strong><span>{guides.length}</span></div>
    {guides.length > 0 && <div className="guide-controls-list">
      {guides.map((guide) => <GuideRow key={guide.id} guide={guide} unitPt={unitPt} unit={rulerUnit} origin={guide.axis === "x" ? anchor.x : anchor.y} limit={guide.axis === "x" ? page?.pageSize.width ?? Infinity : page?.pageSize.height ?? Infinity} />)}
    </div>}
    {guides.length === 0 && <p className="guide-controls-empty">Add a guide here or click a ruler.</p>}
    <div className="guide-add-actions">
      <button type="button" disabled={!page} onClick={() => add("x")}>+ Vertical</button>
      <button type="button" disabled={!page} onClick={() => add("y")}>+ Horizontal</button>
    </div>
    <span className="guide-unit-note">Positions use {rulerUnit} from {anchor.available ? anchor.label.toLowerCase() : "the page edge"}.</span>
  </div>;
}
