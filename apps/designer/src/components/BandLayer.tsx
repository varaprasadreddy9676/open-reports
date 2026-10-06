import { useRef, useState } from "react";
import type { StructureBand } from "@reporting/layout";
import { savePref, useStore, type RulerOrigin, type RulerUnit } from "../store";
import * as ops from "../model/ops";
import { fitZoom, zoomCanvas, zoomToSelection } from "../lib/zoom";
import { nextZoomStep } from "../lib/viewport";
import { shortcutLabel } from "../lib/commands";
import { GuideControls } from "./GuideControls";
import { GridSettingsControls } from "./GridSettings";
import { rulerAnchor } from "../lib/ruler-origin";

const ADDABLE: { type: string; hint: string }[] = [
  { type: "reportHeader", hint: "Once, at the start" },
  { type: "pageHeader", hint: "Top of every page" },
  { type: "dataHeader", hint: "Before the first record" },
  { type: "groupHeader", hint: "Start of each group" },
  { type: "detail", hint: "Once per record" },
  { type: "child", hint: "Follows its parent band" },
  { type: "groupFooter", hint: "End of each group" },
  { type: "dataFooter", hint: "After the last record" },
  { type: "noData", hint: "When there are no records" },
  { type: "reportFooter", hint: "Once, at the end" },
  { type: "pageFooter", hint: "Bottom of every page" },
  { type: "background", hint: "Behind every page" },
];

/** Compact canvas controls; detailed setup and pagination appear when requested. */
export function BandBar() {
  const { canvasView, previewSplit, showPagination, ghosts, rulerUnit, rulerOrigin, gridMode, showGrid, doc, engine, selection, selectedBand, zoom } = useStore();
  const receipt = doc.print?.printerType === "receipt";
  const rollView = receipt && canvasView === "pages";
  const set = useStore((s) => s.set);
  const originContext = { canvasView, doc, engine, selection, selectedBand };
  const sectionOrigin = rulerAnchor("section", originContext);
  const selectionOrigin = rulerAnchor("selection", originContext);
  const currentOrigin = rulerAnchor(rulerOrigin, originContext);
  return (
    <div className="band-bar" data-testid="band-bar">
      <div className="seg" role="group" aria-label="Canvas view">
        <button className={canvasView === "structure" ? "on" : ""} data-testid="view-structure" onClick={() => (savePref("canvasView", "structure"), set({ canvasView: "structure" }))} title="Sections: each part of the report once (page header, data rows, footers). Arrange the layout here.">
          Sections
        </button>
        <button className={canvasView === "pages" ? "on" : ""} data-testid="view-pages" onClick={() => (savePref("canvasView", "pages"), set({ canvasView: "pages" }))} title={receipt ? "See the continuous ESC/POS roll" : "Pages: the printed result, page by page, with your sample data. You can edit here too."}>
          {receipt ? "Roll" : "Pages"}
        </button>
      </div>
      {(!receipt || canvasView === "structure") && <button className={showPagination ? "on" : ""} data-testid="toggle-structure-pagination" aria-pressed={showPagination} onClick={() => set({ showPagination: !showPagination })} title={receipt ? "Show page starts for PDF output; the ESC/POS roll does not paginate" : "Show page starts and explain pagination decisions"}>
          {receipt ? "PDF pagination" : "Pagination"}
      </button>}
      {canvasView === "structure" && (
        <button className={previewSplit ? "on" : ""} data-testid="toggle-preview-split" aria-pressed={previewSplit} onClick={() => set({ previewSplit: !previewSplit })} title="Show the paginated sample beside the structure">
          {receipt ? "PDF split preview" : "Split preview"}
        </button>
      )}
      {!rollView && <div className="canvas-zoom" role="group" aria-label="Canvas zoom">
        <button type="button" aria-label="Zoom out" title={`Zoom out (${shortcutLabel("zoom-out")})`} onClick={() => zoomCanvas(nextZoomStep(zoom, -1))}>−</button>
        <span className="zoom-label" data-testid="zoom-label">{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="Zoom in" title={`Zoom in (${shortcutLabel("zoom-in")})`} onClick={() => zoomCanvas(nextZoomStep(zoom, 1))}>+</button>
        <button type="button" aria-label="Fit to width" data-testid="canvas-fit" title={`Fit to width (${shortcutLabel("zoom-fit")})`} onClick={() => set({ zoom: fitZoom(), fitToWidth: true })}>Fit</button>
      </div>}
      {!rollView && <details className="canvas-options" data-testid="canvas-options">
        <summary>Canvas settings</summary>
        <div className="canvas-options-panel">
        <div className="canvas-options-actions">
          <button type="button" aria-label="Zoom to selection" title={shortcutLabel("zoom-selection")} onClick={zoomToSelection}>Zoom to selection</button>
          <button type="button" aria-label="Actual size" title={shortcutLabel("zoom-100")} onClick={() => zoomCanvas(1)}>Actual size</button>
        </div>
        {canvasView === "structure" && <label title="Show extra example records in each detail band">
          Examples{" "}
          <select
            data-testid="ghosts"
            value={ghosts}
            onChange={async (e) => {
              set({ ghosts: Number(e.target.value) });
              await useStore.getState().refresh();
            }}
          >
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n === 0 ? "Off" : `+${n}`}
              </option>
            ))}
          </select>
        </label>}
        <label>
        Units{" "}
        <select data-testid="ruler-unit" value={rulerUnit} onChange={(e) => (savePref("rulerUnit", e.target.value), set({ rulerUnit: e.target.value as RulerUnit }))}>
          {["mm", "cm", "in", "pt", "px", "dots"].map((u) => (
            <option key={u} value={u}>{u === "dots" ? "Printer dots" : u}</option>
          ))}
        </select>
        </label>
        {rulerUnit === "dots" && <div className="canvas-unit-hint" data-testid="ruler-dpi">{doc.print?.dpi ?? 203} dpi{doc.print?.dpi ? "" : " default"} · 1 dot = {(25.4 / (doc.print?.dpi ?? 203)).toFixed(3)} mm</div>}
        <label>
        Ruler zero{" "}
        <select data-testid="ruler-origin" value={rulerOrigin} onChange={(e) => (savePref("rulerOrigin", e.target.value), set({ rulerOrigin: e.target.value as RulerOrigin }))}>
          <option value="page">Page edge</option>
          <option value="printable">Inside margins</option>
          <option value="section" disabled={!sectionOrigin.available}>Selected band</option>
          <option value="selection" disabled={!selectionOrigin.available}>Selection bounds</option>
        </select>
        </label>
        {(rulerOrigin === "section" || rulerOrigin === "selection") && <div className="canvas-unit-hint" role="status">{currentOrigin.available ? `Zero at ${currentOrigin.label.toLowerCase()}.` : currentOrigin.label + "."}</div>}
        <label>
        Grid{" "}
        <select data-testid="grid-mode" value={showGrid ? gridMode : "off"} onChange={(e) => (e.target.value === "off" ? set({ showGrid: false }) : set({ showGrid: true, gridMode: e.target.value as "lines" | "dots" }))}>
          <option value="off">Hidden</option>
          <option value="lines">Lines</option>
          <option value="dots">Dots</option>
        </select>
        </label>
        <GridSettingsControls />
        <GuideControls />
        </div>
      </details>}
    </div>
  );
}

/** Allowed band types to add after `band` (what makes sense next to it). */
function InsertMenu({ band, onClose }: { band: StructureBand; onClose(): void }) {
  const st = useStore.getState();
  const add = (type: string) => {
    let doc = st.doc;
    const props: Record<string, any> = {};
    if (type === "child") {
      const section: any = doc.sections[band.sectionIndex];
      const parentSection: any = section.type === "child" ? doc.sections.find((s: any) => s.id === section.parent) : section;
      if (!parentSection) return;
      if (!parentSection.id) {
        const idx = doc.sections.indexOf(parentSection);
        doc = ops.updateBand(doc, idx, { id: `band-${idx + 1}` });
        props.parent = `band-${idx + 1}`;
      } else props.parent = parentSection.id;
    }
    if (type === "groupHeader" || type === "groupFooter") {
      const g = (doc.groups ?? [])[0];
      if (!g) {
        st.set({ dialog: "group", leftTab: "layers", leftOpen: true });
        return;
      }
      props.groupId = g.id;
    }
    const r = ops.addBand(doc, type, props);
    st.setDoc(r.doc, { keepSelection: true });
    st.set({ selectedBand: r.index, selection: [], rightOpen: true });
    onClose();
  };
  return (
    <div className="band-menu" data-testid="band-menu" onPointerDown={(e) => e.stopPropagation()}>
      {ADDABLE.map((a) => (
        <button key={a.type} data-testid={`add-${a.type}`} title={a.hint} onClick={() => add(a.type)}>
          <span style={{ width: 22, fontWeight: 700, opacity: 0.6 }}>{ops.BAND_CODES[a.type]}</span>
          {ops.BAND_TITLES[a.type]}
        </button>
      ))}
    </div>
  );
}

/** Band outlines, tabs (select, collapse, reorder by dragging) and "+" insertion points for the structure view. */
export function BandChrome({ bands, k }: { bands: StructureBand[]; k: number }) {
  const doc = useStore((s) => s.doc);
  const selectedBand = useStore((s) => s.selectedBand);
  const [menu, setMenu] = useState<number | null>(null);
  const [dropOn, setDropOn] = useState<number | null>(null);
  const dragFrom = useRef<number | null>(null);

  return (
    <>
      {bands.map((b, i) => {
        const section: any = doc.sections[b.sectionIndex];
        const selected = selectedBand === b.sectionIndex;
        const ghost = (b.instance ?? 0) > 0;
        return (
          <div
            key={i}
            className={`band-chrome ${selected ? "selected" : ""} ${ghost ? "ghost" : ""} ${b.hiddenByRule ? "hidden-rule" : ""}`}
            data-testid={`band-${b.sectionIndex}`}
            data-band-type={b.type}
            style={{ top: b.y * k, height: b.height * k }}
          >
            <div
              className={`band-tab ${dropOn === b.sectionIndex ? "drop" : ""}`}
              data-testid={`band-tab-${b.sectionIndex}`}
              draggable={!section?.locked}
              onPointerDown={(e) => e.stopPropagation()}
              title={b.name}
              onClick={(e) => {
                e.stopPropagation();
                useStore.getState().set({ selectedBand: b.sectionIndex, selection: [], rightOpen: true });
              }}
              onDragStart={(e) => {
                if (section?.locked) { e.preventDefault(); return; }
                dragFrom.current = b.sectionIndex;
                e.dataTransfer.setData("text/band", String(b.sectionIndex));
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (dragFrom.current === null || dragFrom.current === b.sectionIndex) return;
                if (ops.canMoveBand(doc, dragFrom.current, b.sectionIndex)) {
                  e.preventDefault();
                  setDropOn(b.sectionIndex);
                }
              }}
              onDragLeave={() => setDropOn(null)}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragFrom.current;
                dragFrom.current = null;
                setDropOn(null);
                if (from === null) return;
                const next = ops.moveBand(doc, from, b.sectionIndex);
                if (next) {
                  const st = useStore.getState();
                  st.setDoc(next, { keepSelection: true });
                  st.set({ selectedBand: b.sectionIndex });
                }
              }}
              onDragEnd={() => {
                dragFrom.current = null;
                setDropOn(null);
              }}
            >
              <span
                className="caret"
                data-testid={`band-collapse-${b.sectionIndex}`}
                title={b.collapsed ? "Expand" : "Collapse"}
                onClick={(e) => {
                  e.stopPropagation();
                  const st = useStore.getState();
                  st.setDoc(ops.updateBand(st.doc, b.sectionIndex, { collapsed: (st.doc.sections[b.sectionIndex] as any)?.collapsed ? undefined : true }), { keepSelection: true });
                }}
              >
                {b.collapsed ? "▸" : "▾"}
              </span>
              <span className="code">{ops.BAND_CODES[b.type] ?? ""}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{ops.bandDisplayName(doc, section ?? { type: b.type })}</span>
            </div>
            <button
              className="band-plus"
              data-testid={`band-plus-${b.sectionIndex}`}
              title="Insert a band"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setMenu(menu === b.sectionIndex ? null : b.sectionIndex);
              }}
            >
              +
            </button>
            {menu === b.sectionIndex && (
              <div style={{ position: "absolute", right: 8, bottom: -4, pointerEvents: "auto" }} onPointerDown={(e) => e.stopPropagation()}>
                <InsertMenu band={b} onClose={() => setMenu(null)} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/** Persistent guides: drag to move, drag back onto the ruler or double-click to delete. */
export function GuideLayer({ k, width, height }: { k: number; width: number; height: number }) {
  const guides: any[] = useStore((s) => s.doc.guides) ?? [];
  const drag = useRef<null | { id: string; sx: number; sy: number; orig: number; axis: "x" | "y" }>(null);
  return (
    <>
      {guides.map((g) => {
        if (!Number.isFinite(g.pos) || g.pos < 0 || g.pos * k > (g.axis === "x" ? width : height)) return null;
        const style = g.axis === "x" ? { left: g.pos * k } : { top: g.pos * k };
        return (
          <div key={g.id}>
            <div className={`guide-line ${g.axis} ${g.locked ? "locked" : ""}`} data-testid={`guide-${g.id}`} style={style}>
              {g.name && <span className="guide-name">{g.name}</span>}
            </div>
            {!g.locked && (
              <div
                className={`guide-hit ${g.axis}`}
                style={style}
                title="Drag to move, double-click to delete"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                  drag.current = { id: g.id, sx: e.clientX, sy: e.clientY, orig: g.pos, axis: g.axis };
                }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (!d) return;
                  const pos = d.orig + ((d.axis === "x" ? e.clientX - d.sx : e.clientY - d.sy) / k);
                  const st = useStore.getState();
                  st.setDoc(ops.updateGuide(st.doc, d.id, { pos: Math.round(pos * 10) / 10 }), { coalesce: `guide-${d.id}`, keepSelection: true });
                }}
                onPointerUp={(e) => {
                  const d = drag.current;
                  drag.current = null;
                  if (!d) return;
                  const pos = d.orig + ((d.axis === "x" ? e.clientX - d.sx : e.clientY - d.sy) / k);
                  // dragged outside the page = dropped back onto the ruler
                  if (pos < 0 || pos > (d.axis === "x" ? width : height) / k) {
                    const st = useStore.getState();
                    st.setDoc(ops.removeGuide(st.doc, d.id), { keepSelection: true });
                  }
                }}
                onDoubleClick={() => {
                  const st = useStore.getState();
                  st.setDoc(ops.removeGuide(st.doc, g.id), { keepSelection: true });
                }}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
