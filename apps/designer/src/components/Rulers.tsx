import { useRef } from "react";
import { useStore, type RulerUnit } from "../store";
import * as ops from "../model/ops";
import type { StructureBand } from "@reporting/layout";

export const PT_PER_UNIT: Record<RulerUnit, number> = { mm: 72 / 25.4, cm: 72 / 2.54, in: 72, pt: 1, px: 0.75 };
const NICE = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];

/** Chooses tick spacing (in the ruler's unit) so labelled ticks sit at least ~48px apart. */
export function tickSteps(unit: RulerUnit, k: number): { major: number; minor: number } {
  const pxPerUnit = PT_PER_UNIT[unit] * k;
  const fractions = unit === "in" ? [0.125, 0.25, 0.5, 1, 2, 5, 10] : unit === "cm" ? [0.1, 0.5, 1, 2, 5, 10] : NICE;
  const major = fractions.find((f) => f * pxPerUnit >= 48) ?? fractions[fractions.length - 1]!;
  const minor = major / (major === 1 || major === 10 || major === 100 ? 10 : major === 2 || major === 20 ? 4 : major === 5 ? 5 : 5);
  return { major, minor: Math.max(minor, 1 / pxPerUnit * 6) };
}

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

function Axis({ vertical, length, k, unit }: { vertical: boolean; length: number; k: number; unit: RulerUnit }) {
  const { major, minor } = tickSteps(unit, k);
  const pxPer = PT_PER_UNIT[unit] * k;
  const ticks: JSX.Element[] = [];
  const n = Math.floor(length / (minor * pxPer));
  for (let i = 0; i <= n; i++) {
    const v = i * minor;
    const isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    const pos = v * pxPer;
    ticks.push(
      <div key={i} className={isMajor ? "tick major" : "tick"} style={vertical ? { top: pos } : { left: pos }}>
        {isMajor && <span>{fmt(v)}</span>}
      </div>
    );
  }
  return <>{ticks}</>;
}

/**
 * Horizontal and vertical rulers. Click a ruler to drop a guide, drag the margin markers to change the page margins, and (in the
 * structure view) drag a band's bottom edge on the vertical ruler to resize it (double-click = fit to content).
 */
export function Rulers({ width, height, k, margin, bands }: Props) {
  const unit = useStore((s) => s.rulerUnit);
  const doc = useStore((s) => s.doc);
  const dragRef = useRef<null | { edge: "top" | "right" | "bottom" | "left"; start: number; orig: number }>(null);
  const bandDrag = useRef<null | { index: number; start: number; orig: number; moved: boolean }>(null);

  const setMargin = (edge: "top" | "right" | "bottom" | "left", pt: number) => {
    const st = useStore.getState();
    const next = structuredClone(st.doc);
    const pageUnit = (next.page?.unit ?? "mm") as RulerUnit;
    const val = Math.max(0, Math.round((pt / PT_PER_UNIT[pageUnit]) * 10) / 10);
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
    const snapped = Math.round((d.orig + sign * delta) / (PT_PER_UNIT[unit] * 0.5)) * PT_PER_UNIT[unit] * 0.5;
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
    // the top ruler produces a horizontal line (axis y), the left ruler a vertical one (axis x)
    st.setDoc(ops.addGuide(st.doc, vertical ? "x" : "y", pt).doc, { keepSelection: true });
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
      <div className="ruler h" style={{ width }} data-testid="ruler-h" onClick={(e) => rulerClick(e, false)} title="Click to add a horizontal guide">
        <Axis vertical={false} length={width} k={k} unit={unit} />
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
      <div className="ruler v" style={{ height }} data-testid="ruler-v" onClick={(e) => rulerClick(e, true)} title="Click to add a vertical guide">
        <Axis vertical length={height} k={k} unit={unit} />
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
