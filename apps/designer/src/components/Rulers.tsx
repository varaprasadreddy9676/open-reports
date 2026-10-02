import { useRef } from "react";
import { useStore, type RulerUnit } from "../store";
import * as ops from "../model/ops";
import type { StructureBand } from "@reporting/layout";
import { pointsPerRulerUnit, rulerTicks } from "../lib/ruler";

function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

interface Props {
  width: number;
  height: number;
  k: number;
  margin: { top: number; right: number; bottom: number; left: number };
  bands?: StructureBand[];
}

function Axis({ vertical, length, k, unit, dpi, originPt }: { vertical: boolean; length: number; k: number; unit: RulerUnit; dpi: number; originPt: number }) {
  return <>{rulerTicks(length, k, unit, dpi, originPt).map(({ value, position, major }) =>
      <div key={value} className={major ? "tick major" : "tick"} style={vertical ? { top: position } : { left: position }}>
        {major && <span>{fmt(value)}</span>}
      </div>
    )}</>;
}

/**
 * Horizontal and vertical rulers. Click a ruler to drop a guide, drag the margin markers to change the page margins, and (in the
 * structure view) drag a band's bottom edge on the vertical ruler to resize it (double-click = fit to content).
 */
export function Rulers({ width, height, k, margin, bands }: Props) {
  const unit = useStore((s) => s.rulerUnit);
  const origin = useStore((s) => s.rulerOrigin);
  const doc = useStore((s) => s.doc);
  const dpi = doc.print?.dpi ?? 203;
  const dragRef = useRef<null | { edge: "top" | "right" | "bottom" | "left"; start: number; orig: number }>(null);
  const bandDrag = useRef<null | { index: number; start: number; orig: number; moved: boolean }>(null);

  const setMargin = (edge: "top" | "right" | "bottom" | "left", pt: number) => {
    const st = useStore.getState();
    const next = structuredClone(st.doc);
    const pageUnit = (next.page?.unit ?? "mm") as "mm" | "cm" | "in" | "pt" | "px";
    const precision = unit === "dots" ? 1000 : 10;
    const val = Math.max(0, Math.round((pt / pointsPerRulerUnit(pageUnit)) * precision) / precision);
    next.page = { ...(next.page ?? {}), margin: { ...(next.page?.margin ?? {}), [edge]: val } };
    st.setDoc(next, { coalesce: `margin-${edge}`, keepSelection: true });
  };

  function markerDown(e: React.PointerEvent, edge: "top" | "right" | "bottom" | "left") {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { edge, start: edge === "top" || edge === "bottom" ? e.clientY : e.clientX, orig: margin[edge] };
  }
  function markerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const horizontal = d.edge === "left" || d.edge === "right";
    const delta = ((horizontal ? e.clientX : e.clientY) - d.start) / k;
    const sign = d.edge === "left" || d.edge === "top" ? 1 : -1;
    const step = unit === "dots" ? 1 : 0.5;
    const unitPt = pointsPerRulerUnit(unit, dpi);
    const snapped = Math.round((d.orig + sign * delta) / (unitPt * step)) * unitPt * step;
    setMargin(d.edge, Math.max(0, snapped));
  }
  function markerUp() {
    dragRef.current = null;
  }

  function rulerClick(e: React.MouseEvent, vertical: boolean) {
    if ((e.target as HTMLElement).closest("[data-marker],[data-band-edge]")) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pt = ((vertical ? e.clientY - r.top : e.clientX - r.left) / k);
    const st = useStore.getState();
    // The top ruler measures x and produces a vertical line; the left ruler measures y.
    st.setDoc(ops.addGuide(st.doc, vertical ? "y" : "x", pt).doc, { keepSelection: true });
  }

  function edgeDown(e: React.PointerEvent, b: StructureBand) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    bandDrag.current = { index: b.sectionIndex, start: e.clientY, orig: b.height, moved: false };
  }
  function edgeMove(e: React.PointerEvent) {
    const d = bandDrag.current;
    if (!d) return;
    d.moved = true;
    const h = Math.max(8, Math.round(d.orig + (e.clientY - d.start) / k));
    const st = useStore.getState();
    st.setDoc(ops.updateBand(st.doc, d.index, { height: h }), { coalesce: `band-h-${d.index}`, keepSelection: true });
  }
  function edgeUp() {
    bandDrag.current = null;
  }
  function edgeDouble(b: StructureBand) {
    const st = useStore.getState();
    st.setDoc(ops.updateBand(st.doc, b.sectionIndex, { height: undefined }), { keepSelection: true });
  }

  return (
    <>
      <div className="ruler h" style={{ width }} data-testid="ruler-h" onClick={(e) => rulerClick(e, false)} title="Click to add a vertical guide">
        <Axis vertical={false} length={width} k={k} unit={unit} dpi={dpi} originPt={origin === "printable" ? margin.left : 0} />
        {(["left", "right"] as const).map((edge) => (
          <div
            key={edge}
            className={`margin-marker h ${edge}`}
            data-marker={edge}
            data-testid={`margin-marker-${edge}`}
            title={`${edge} margin - drag`}
            style={{ left: (edge === "left" ? margin.left : (width / k - margin.right)) * k }}
            onPointerDown={(e) => markerDown(e, edge)}
            onPointerMove={markerMove}
            onPointerUp={markerUp}
          />
        ))}
      </div>
      <div className="ruler v" style={{ height }} data-testid="ruler-v" onClick={(e) => rulerClick(e, true)} title="Click to add a horizontal guide">
        <Axis vertical length={height} k={k} unit={unit} dpi={dpi} originPt={origin === "printable" ? margin.top : 0} />
        {(bands ? (["top"] as const) : (["top", "bottom"] as const)).map((edge) => (
          <div
            key={edge}
            className={`margin-marker v ${edge}`}
            data-marker={edge}
            data-testid={`margin-marker-${edge}`}
            title={`${edge} margin - drag`}
            style={{ top: (edge === "top" ? margin.top : height / k - margin.bottom) * k }}
            onPointerDown={(e) => markerDown(e, edge)}
            onPointerMove={markerMove}
            onPointerUp={markerUp}
          />
        ))}
        {bands?.map((b, i) =>
          b.collapsed || b.zone === "background" || doc.sections?.[b.sectionIndex]?.locked ? null : (
            <div
              key={i}
              className="band-edge"
              data-band-edge={b.sectionIndex}
              data-testid={`band-edge-${b.sectionIndex}`}
              title={`Drag to resize ${b.name} - double-click to fit content`}
              style={{ top: (b.y + b.height) * k - 3 }}
              onPointerDown={(e) => edgeDown(e, b)}
              onPointerMove={edgeMove}
              onPointerUp={edgeUp}
              onDoubleClick={() => edgeDouble(b)}
            />
          )
        )}
      </div>
    </>
  );
}
