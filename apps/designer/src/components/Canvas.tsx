import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { defaultTextMeasurer, measureHeaderRowHeights, measureTableRowHeights, resolveColumnWidths, type PositionedNode } from "@reporting/layout";
import { tableCellSpanGrid, tableHeaderRows } from "@reporting/core";
import { renderChartSvg } from "@reporting/renderer-html/chart";
import { useStore } from "../store";
import * as ops from "../model/ops";
import { cssFrom } from "../lib/css";
import { datasetFields, datasetValue, scalarFields } from "../lib/fields";
import { listFor, type ListDisplay } from "../lib/generate";
import { titleCase } from "../lib/lowcode";
import { snapBox, snapResizeBox, rectsIntersect, type Guide, type Distance } from "../lib/snap";
import { ContextMenu, FloatingToolbar, InlineEditor } from "./CanvasTools";
import { Rulers } from "./Rulers";
import { BandBar, BandChrome, GuideLayer } from "./BandLayer";
import { StructureBreakLayer, StructurePageStrip } from "./StructurePagination";
import { PageBreakDetails } from "./PageBreakDetails";
import { EscPosPreview, PdfPreview } from "./Preview";
import { fitZoom } from "../lib/zoom";
import { pointsPerRulerUnit } from "../lib/ruler";
import { api } from "../lib/api";
import { canvasFontStack } from "../lib/fonts";

const PT = 4 / 3;
const CONTAINERS = ["container", "row", "column", "grid", "repeater", "keepTogether", "group"];
const SNAP = 5;

function* flat(nodes: PositionedNode[]): Generator<PositionedNode> {
  for (const n of nodes) {
    yield n;
    if (n.children) yield* flat(n.children);
  }
}

function boxStyle(n: PositionedNode, k: number): React.CSSProperties {
  return { position: "absolute", left: n.box.x * k, top: n.box.y * k, width: n.box.width * k, height: n.box.height * k };
}

function QrView({ value }: { value: string }) {
  const path = useMemo(() => {
    try {
      const qr = QRCode.create(value || " ", { errorCorrectionLevel: "M" });
      const { size, data } = qr.modules;
      let d = "";
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (data[y * size + x]) d += `M${x} ${y}h1v1h-1z`;
      return { d, size };
    } catch {
      return { d: "", size: 1 };
    }
  }, [value]);
  return (
    <svg viewBox={`0 0 ${path.size} ${path.size}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" shapeRendering="crispEdges">
      <path d={path.d} fill="#000" />
    </svg>
  );
}

/** Approximate bars for the canvas; Preview shows the exact encoded barcode. */
function BarcodeView({ value }: { value: string }) {
  const bars: JSX.Element[] = [];
  let x = 0;
  const text = value || "0";
  for (let i = 0; i < text.length * 6 + 8; i++) {
    const c = text.charCodeAt(i % text.length) + i * 7;
    const w = 1 + (c % 3);
    if (i % 2 === 0) bars.push(<rect key={i} x={x} y={0} width={w} height={30} fill="#000" />);
    x += w;
  }
  return (
    <svg viewBox={`0 0 ${x} 30`} width="100%" height="100%" preserveAspectRatio="none">
      {bars}
    </svg>
  );
}

function ImageView({ component, style }: { component: any; style: React.CSSProperties }) {
  const linked = Boolean(component.src && !component.src.startsWith("data:"));
  const [preview, setPreview] = useState<{ source: string; dataUrl?: string; error?: string } | null>(null);
  useEffect(() => {
    if (!linked) return;
    let active = true;
    api.imageSource(component.src).then(
      (dataUrl) => { if (active) setPreview({ source: component.src, dataUrl }); },
      (error) => { if (active) setPreview({ source: component.src, error: error instanceof Error ? error.message : String(error) }); },
    );
    return () => { active = false; };
  }, [component.src, linked]);
  if (!component.src) return <div data-cid={component.id} className="cn cn-placeholder" style={style}><span>Image</span></div>;
  if (linked && preview?.source !== component.src) return <div data-cid={component.id} className="cn cn-placeholder" style={style}><span>Loading image…</span></div>;
  if (linked && preview?.error) return <div data-cid={component.id} className="cn cn-placeholder" style={style} title={preview.error}><span>Image unavailable</span></div>;
  return <img data-cid={component.id} className="cn" src={linked ? preview?.dataUrl : component.src} alt={component.alt ?? ""} style={{ ...style, objectFit: component.fit === "cover" ? "cover" : component.fit === "fill" || component.fit === "stretch" ? "fill" : "contain" }} />;
}

function TextNodeView({ node, k, capabilities }: { node: PositionedNode; k: number; capabilities?: import("../engine").Capabilities }) {
  const c = node.component as any;
  return <div data-cid={c.id} className="cn cn-text" style={{ ...boxStyle(node, k), ...cssFrom(c.style, k, capabilities), lineHeight: node.textMetrics ? `${node.textMetrics.lineHeight * k}px` : undefined, whiteSpace: c.style?.overflow === "ellipsis" ? "nowrap" : "pre-wrap", overflow: "hidden" }}>
    <span className="text-content"><span className="text-baseline-probe" aria-hidden="true" />{node.renderText ?? node.textFragment?.text ?? c.text}</span>
  </div>;
}

function NodeView({ node, k, capabilities }: { node: PositionedNode; k: number; capabilities?: import("../engine").Capabilities }) {
  const c = node.component as any;
  const common = { "data-cid": c.id } as Record<string, any>;
  const st = boxStyle(node, k);

  switch (c.type) {
    case "text":
    case "richText":
    case "field":
      return <TextNodeView node={node} k={k} capabilities={capabilities} />;
    case "image":
      return <ImageView component={c} style={st} />;
    case "line":
      return <div {...common} className="cn" style={{ ...st, ...(c.orientation === "vertical" ? { borderLeft: `${k}px solid #000` } : { borderTop: `${k}px solid #000` }) }} />;
    case "rectangle":
      return <div {...common} className="cn" style={{ ...st, ...(c.style ? cssFrom(c.style, k, capabilities) : { border: `${k}px solid #000` }) }} />;
    case "spacer":
      return <div {...common} className="cn cn-spacer" style={st} />;
    case "pageBreak":
      return <div {...common} className="cn cn-pagebreak" style={{ ...st, height: 14 * k, top: node.box.y * k - 7 * k }}><span>page break</span></div>;
    case "qrcode":
      return (
        <div {...common} className="cn" style={{ ...st, background: "#fff" }}>
          <QrView value={c.value} />
        </div>
      );
    case "barcode":
      return (
        <div {...common} className="cn" style={{ ...st, background: "#fff" }}>
          <BarcodeView value={c.value} />
        </div>
      );
    case "chart":
      return (
        <div {...common} className="cn" style={{ ...st, background: "#fff" }} dangerouslySetInnerHTML={{ __html: renderChartSvg(c, Math.round(node.box.width * k), Math.round(node.box.height * k)) }} />
      );
    case "table":
      return <TableView node={node} k={k} capabilities={capabilities} />;
    default: {
      const own = CONTAINERS.includes(c.type);
      return (
        <>
          {own && <div {...common} className={`cn cn-block cn-${c.type}`} style={{ ...st, ...cssFrom(c.style, k, capabilities) }} />}
          {(node.children ?? []).map((ch, i) => (
            <NodeView key={i} node={ch} k={k} capabilities={capabilities} />
          ))}
        </>
      );
    }
  }
}

function TableView({ node, k, capabilities }: { node: PositionedNode; k: number; capabilities?: import("../engine").Capabilities }) {
  const t = node.component as any;
  const widths = resolveColumnWidths(t, node.box.width);
  const headerHeights = node.tableMetrics?.headerRowHeights ?? measureHeaderRowHeights(t, widths, defaultTextMeasurer);
  const rowHeights = node.tableMetrics?.rowHeights ?? measureTableRowHeights(t, widths, defaultTextMeasurer);
  const spanGrid = tableCellSpanGrid(t.cellSpans ?? []);
  const start = node.rowRange?.start ?? 0;
  const end = node.rowRange?.end ?? t.rows.length;
  const fs = ((t.style?.fontSize as number) ?? 10) * k;
  return (
    <table data-cid={t.id} className="cn cn-table" style={{ ...boxStyle(node, k), borderCollapse: "collapse", fontSize: fs, tableLayout: "fixed", ...cssFrom(t.style, k, capabilities) }}>
      <colgroup>
        {widths.map((w, i) => (
          <col key={i} style={{ width: w.width * k }} />
        ))}
      </colgroup>
      {t.showHeader && (
        <thead>
          {tableHeaderRows(t).map((cells, row) => <tr key={row} style={{ height: headerHeights[row]! * k }}>
            {cells.map((cell) => <th key={cell.column} colSpan={cell.colSpan} rowSpan={cell.rowSpan} style={{ textAlign: cell.align ?? "left", border: t.headerRows ? `${k}px solid #000` : undefined, borderBottom: `${k}px solid #000`, padding: `${2 * k}px ${4 * k}px`, fontWeight: 700 }}>
              {cell.text}
            </th>)}
          </tr>)}
        </thead>
      )}
      <tbody>
        {t.rows.slice(start, end).map((row: any, i: number) => (
          <tr key={start + i} style={{ height: rowHeights[start + i]! * k, background: t.alternateRowStyle && (start + i) % 2 === 1 ? "#f5f5f5" : undefined, ...cssFrom(row.style, k, capabilities) }}>
            {t.columns.map((c: any, column: number) => {
              const slot = spanGrid.get(start + i)?.get(column);
              if (slot && !slot.anchor) return null;
              return <td key={c.id} colSpan={slot?.span.colSpan} rowSpan={slot?.span.rowSpan} style={{ textAlign: c.align ?? "left", padding: `${2 * k}px ${4 * k}px`, overflow: "hidden", whiteSpace: "nowrap", border: slot ? `${k}px solid #000` : undefined }}>
                {row.formatted[c.id]}
              </td>;
            })}
          </tr>
        ))}
        {t.rows.length === 0 && (
          <tr>
            <td colSpan={t.columns.length} style={{ color: "#9ca3af", padding: 4 * k }}>
              No rows to preview
            </td>
          </tr>
        )}
      </tbody>
      {t.showFooter && (
        <tfoot>
          <tr>
            {t.columns.map((c: any) => (
              <td key={c.id} style={{ textAlign: c.align ?? "left", borderTop: `${k}px solid #000`, fontWeight: 700, padding: `${2 * k}px ${4 * k}px` }}>
                {c.footer?.value ?? ""}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}

interface DropTarget {
  id: string;
  position: ops.DropPosition;
  box: { x: number; y: number; width: number; height: number };
  page: number;
}

function Ruler({ width, height, k, vertical }: { width: number; height: number; k: number; vertical?: boolean }) {
  const mm = (72 / 25.4) * k;
  const ticks: JSX.Element[] = [];
  const count = Math.floor((vertical ? height : width) / mm);
  for (let i = 0; i <= count; i++) {
    const major = i % 10 === 0;
    const pos = i * mm;
    ticks.push(
      <div key={i} className={major ? "tick major" : i % 5 === 0 ? "tick mid" : "tick"} style={vertical ? { top: pos } : { left: pos }}>
        {major && <span>{i / 10}</span>}
      </div>
    );
  }
  return <div className={vertical ? "ruler v" : "ruler h"} style={vertical ? { height } : { width }}>{ticks}</div>;
}

export function Canvas() {
  const { engine, zoom, fitToWidth, selection, showGrid, showRulers, doc, sample, snap, view, bottom, editingText, canvasView, previewSplit, showPagination, gridMode, rulerUnit, capabilities } = useStore();
  const k = PT * zoom;
  const unitPt = pointsPerRulerUnit(rulerUnit, doc.print?.dpi ?? 203);
  const measure = (pt: number) => String(Math.round((pt / unitPt) * (rulerUnit === "dots" ? 1 : 10)) / (rulerUnit === "dots" ? 1 : 10));
  const structure = canvasView === "structure" ? engine.structure : undefined;
  const paginated = structure ?? engine.paginated;
  const [indicator, setIndicator] = useState<DropTarget | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; w: number; h: number; page: number } | null>(null);
  const [guides, setGuides] = useState<{ page: number; guides: Guide[]; distances: Distance[] } | null>(null);
  const [marquee, setMarquee] = useState<null | { page: number; x0: number; y0: number; x1: number; y1: number }>(null);
  const [explainedPage, setExplainedPage] = useState<number | null>(null);
  const drag = useRef<null | { id: string; mode: "move" | "resize"; handle?: string; sx: number; sy: number; moved: boolean; orig: any; page: number; duplicated?: boolean }>(null);
  const marqueeRef = useRef<typeof marquee>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const selSet = useMemo(() => new Set(selection), [selection]);

  const pageEls = useRef<(HTMLDivElement | null)[]>([]);

  useLayoutEffect(() => {
    const root = scroller.current;
    if (!root || !paginated) return;
    const items = [...root.querySelectorAll<HTMLElement>(".cn-text .text-content")];
    // Batch writes, then reads, then writes so hundreds of text nodes do not
    // force a fresh browser layout for each individual correction.
    for (const content of items) content.style.top = "0px";
    const corrections: [HTMLElement, number][] = [];
    for (const content of items) {
      const outer = content.parentElement;
      const textNode = [...content.childNodes].find((child) => child.nodeType === Node.TEXT_NODE);
      if (!outer || !textNode?.textContent) continue;
      const range = document.createRange();
      range.selectNodeContents(textNode);
      const renderedTop = range.getBoundingClientRect().top - outer.getBoundingClientRect().top;
      const paddingTop = parseFloat(getComputedStyle(outer).paddingTop) || 0;
      // PDFKit starts text at the box padding; CSS line boxes add half-leading.
      corrections.push([content, paddingTop - renderedTop]);
    }
    for (const [content, offset] of corrections) content.style.top = `${offset}px`;
  }, [paginated, k, capabilities]);

  useEffect(() => {
    const el = scroller.current;
    if (!fitToWidth || !el || !paginated) return;
    const sync = () => {
      const next = fitZoom(paginated.pageSize.width);
      const state = useStore.getState();
      if (state.fitToWidth && state.zoom !== next) state.set({ zoom: next });
    };
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    sync();
    return () => observer.disconnect();
  }, [fitToWidth, paginated?.pageSize.width]);

  function pagePoint(clientX: number, clientY: number, page: number) {
    const el = pageEls.current[page];
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: (clientX - r.left) / k, y: (clientY - r.top) / k };
  }

  function findTarget(page: number, x: number, y: number, excludeIds: Set<string>): DropTarget | null {
    const p = paginated?.pages[page];
    if (!p) return null;
    const nodes = [...flat([...p.header, ...p.content, ...p.footer])].filter((n) => {
      const id = (n.component as any).id;
      return id && !excludeIds.has(id) && n.component.type !== "pageBreak";
    });
    const inside = nodes.filter((n) => x >= n.box.x && x <= n.box.x + n.box.width && y >= n.box.y && y <= n.box.y + n.box.height);
    let hit = inside.sort((a, b) => a.box.width * a.box.height - b.box.width * b.box.height)[0];
    if (!hit) {
      const content = p.content.filter((n) => (n.component as any).id && !excludeIds.has((n.component as any).id));
      if (!content.length) return null;
      hit = content.reduce((best, n) => (Math.abs(n.box.y + n.box.height / 2 - y) < Math.abs(best.box.y + best.box.height / 2 - y) ? n : best));
    }
    const type = hit.component.type;
    const rel = (y - hit.box.y) / Math.max(1, hit.box.height);
    let position: ops.DropPosition = rel < 0.5 ? "before" : "after";
    if (CONTAINERS.includes(type) && type !== "group" && rel > 0.2 && rel < 0.8 && inside.includes(hit)) position = "inside";
    return { id: (hit.component as any).id, position, box: hit.box, page };
  }

  function subtreeIds(id: string): Set<string> {
    const set = new Set<string>([id]);
    const loc = ops.find(doc, id);
    if (loc) {
      const walk = (c: any) => {
        if (c.id) set.add(c.id);
        for (const key of ops.CHILD_LISTS) if (Array.isArray(c[key])) c[key].forEach(walk);
      };
      walk(loc.comp);
    }
    return set;
  }

  function snapTo(v: number, bypass = false) {
    return snap && !bypass ? Math.round(v / SNAP) * SNAP : Math.round(v * 10) / 10;
  }

  function snapContext(sourceDoc: ops.Doc, id: string, page: number) {
    const p = paginated?.pages[page];
    const loc = ops.find(sourceDoc, id);
    if (!p || !loc || !paginated) return null;
    const nodes = [...flat([...p.header, ...p.content, ...p.footer])];
    const siblingIds = new Set<string>(loc.list.map((c) => c.id).filter((siblingId: string) => siblingId && siblingId !== id));
    const others = nodes.filter((n) => siblingIds.has((n.component as any).id)).map((n) => n.box);
    const parentId = loc.parent;
    const parentBox = !parentId.startsWith("section:") ? nodes.find((n) => (n.component as any).id === parentId)?.box : undefined;
    const sectionBand = structure && parentId.startsWith("section:") ? structure.bands.find((b) => b.sectionIndex === Number(parentId.slice(8)) && !b.ghost) : undefined;
    const bounds = parentBox ?? (sectionBand ? { x: paginated.margin.left, y: sectionBand.y, width: paginated.pageSize.width - paginated.margin.left - paginated.margin.right, height: sectionBand.height } : { x: paginated.margin.left, y: paginated.margin.top, width: paginated.pageSize.width - paginated.margin.left - paginated.margin.right, height: paginated.pageSize.height - paginated.margin.top - paginated.margin.bottom });
    const extra = { x: ((sourceDoc.guides ?? []) as any[]).filter((g) => g.axis === "x").map((g) => g.pos), y: ((sourceDoc.guides ?? []) as any[]).filter((g) => g.axis === "y").map((g) => g.pos) };
    const pageEl = pageEls.current[page];
    const pageTop = pageEl?.getBoundingClientRect().top ?? 0;
    const textEls = new Map(pageEl ? [...pageEl.querySelectorAll<HTMLElement>(".cn-text[data-cid]")].map((el) => [el.dataset.cid, el] as const) : []);
    const baselines = pageEl ? nodes.filter((n) => siblingIds.has((n.component as any).id) && ["text", "richText", "field"].includes(n.component.type)).flatMap((n) => {
      const textEl = textEls.get((n.component as any).id);
      const probe = textEl?.querySelector<HTMLElement>(".text-baseline-probe");
      return probe ? [{ pos: (probe.getBoundingClientRect().top - pageTop) / k, box: n.box }] : [];
    }) : [];
    return { others, bounds, extra, baselines };
  }

  // ---- pointer interactions (select, move/reorder, resize)
  function onPointerDown(e: React.PointerEvent, page: number) {
    if (e.button !== 0) return;
    const handle = (e.target as HTMLElement).closest("[data-handle]") as HTMLElement | null;
    const el = (e.target as HTMLElement).closest("[data-cid]") as HTMLElement | null;
    const store = useStore.getState();
    if (handle) {
      const id = store.selection[0]!;
      const loc = ops.find(store.doc, id);
      const node = [...flat([...paginated!.pages[page]!.header, ...paginated!.pages[page]!.content, ...paginated!.pages[page]!.footer])].find((n) => (n.component as any).id === id);
      drag.current = { id, mode: "resize", handle: handle.dataset.handle, sx: e.clientX, sy: e.clientY, moved: false, orig: { w: node?.box.width ?? 0, h: node?.box.height ?? 0, x: Number(loc?.comp.x) || 0, y: Number(loc?.comp.y) || 0, absolute: typeof loc?.comp.x === "number", box: node?.box ? { ...node.box } : undefined }, page };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button === 0 && store.contextMenu) store.set({ contextMenu: null });
    if (!el) {
      if (!e.shiftKey) store.select([]);
      const pt = pagePoint(e.clientX, e.clientY, page);
      if (structure) {
        const hit = structure.bands.find((b) => pt.y >= b.y && pt.y < b.y + b.height);
        store.set({ selectedBand: hit ? hit.sectionIndex : null });
      }
      const m = { page, x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y };
      marqueeRef.current = m;
      setMarquee(m);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    const id = el.dataset.cid!;
    if (e.shiftKey) store.select([id], true);
    else if (!store.selection.includes(id)) store.select([id]);
    const loc = ops.find(store.doc, id);
    if (loc?.comp.locked) return;
    const node = [...flat([...paginated!.pages[page]!.header, ...paginated!.pages[page]!.content, ...paginated!.pages[page]!.footer])].find((n) => (n.component as any).id === id);
    const probe = el.querySelector<HTMLElement>(".text-baseline-probe");
    const pageEl = pageEls.current[page];
    const baselineOffset = probe && pageEl && node ? (probe.getBoundingClientRect().top - pageEl.getBoundingClientRect().top) / k - node.box.y : undefined;
    drag.current = { id, mode: "move", sx: e.clientX, sy: e.clientY, moved: false, orig: { x: Number(loc?.comp.x) || 0, y: Number(loc?.comp.y) || 0, absolute: ops.parentLayout(store.doc, id) === "absolute" || typeof loc?.comp.x === "number", box: node?.box ? { ...node.box } : undefined, baselineOffset }, page };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent, page: number) {
    if (marqueeRef.current) {
      const pt = pagePoint(e.clientX, e.clientY, marqueeRef.current.page);
      marqueeRef.current = { ...marqueeRef.current, x1: pt.x, y1: pt.y };
      setMarquee(marqueeRef.current);
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / k;
    const dy = (e.clientY - d.sy) / k;
    if (!d.moved && Math.hypot(dx, dy) * k < 4) return;
    d.moved = true;
    const store = useStore.getState();
    if (d.mode === "resize") {
      const patch: Record<string, number> = {};
      const h = d.handle!;
      const changesX = h.includes("e") || h.includes("w");
      const changesY = h.includes("n") || h.includes("s");
      let width = Math.max(8, d.orig.w + (h.includes("e") ? dx : h.includes("w") ? -dx : 0));
      let height = Math.max(4, d.orig.h + (h.includes("s") ? dy : h.includes("n") ? -dy : 0));
      let x = h.includes("w") ? d.orig.x + d.orig.w - width : d.orig.x;
      let y = h.includes("n") ? d.orig.y + d.orig.h - height : d.orig.y;
      const context = d.orig.absolute && d.orig.box ? snapContext(store.doc, d.id, page) : null;
      let snapped = { x: false, y: false };
      if (context) {
        const offX = d.orig.box.x - d.orig.x;
        const offY = d.orig.box.y - d.orig.y;
        const guideEnabled = store.view.guides && !e.altKey;
        const result = snapResizeBox({ x: x + offX, y: y + offY, width, height }, h, context.others, context.bounds, guideEnabled, context.extra);
        if (guideEnabled) {
          snapped = result.snapped;
          width = result.box.width;
          height = result.box.height;
          x = result.box.x - offX;
          y = result.box.y - offY;
          setGuides({ page, guides: result.guides, distances: result.distances });
        } else setGuides(null);
      } else setGuides(null);
      if (changesX) {
        if (!snapped.x) width = Math.max(8, snapTo(width, e.altKey));
        patch.width = Math.round(width * 10) / 10;
        if (h.includes("w") && d.orig.absolute) patch.x = snapped.x ? Math.round(x * 10) / 10 : Math.round((d.orig.x + d.orig.w - width) * 10) / 10;
      }
      if (changesY) {
        if (!snapped.y) height = Math.max(4, snapTo(height, e.altKey));
        patch.height = Math.round(height * 10) / 10;
        if (h.includes("n") && d.orig.absolute) patch.y = snapped.y ? Math.round(y * 10) / 10 : Math.round((d.orig.y + d.orig.h - height) * 10) / 10;
      }
      store.patch(d.id, patch, `resize:${d.id}`);
      return;
    }
    if (d.orig.absolute) {
      if (e.altKey && e.shiftKey && !d.duplicated) {
        // Shift+Alt-drag leaves the original in place and drags a copy.
        d.duplicated = true;
        const r = ops.duplicate(store.doc, d.id);
        if (r.newId) {
          store.setDoc(r.doc);
          store.set({ selection: [r.newId] });
          d.id = r.newId;
        }
      }
      let x = d.orig.x + dx;
      let y = d.orig.y + dy;
      const me = d.orig.box;
      let snapped = { x: false, y: false };
      const context = me ? snapContext(store.doc, d.id, page) : null;
      if (me && context) {
        const offX = me.x - d.orig.x;
        const offY = me.y - d.orig.y;
        const guideEnabled = store.view.guides && !e.altKey;
        const r = snapBox({ x: x + offX, y: y + offY, width: me.width, height: me.height }, context.others, context.bounds, guideEnabled, { ...context.extra, baseline: d.orig.baselineOffset === undefined ? undefined : { movingOffset: d.orig.baselineOffset, targets: context.baselines } });
        if (guideEnabled) {
          x = r.x - offX;
          y = r.y - offY;
          snapped = r.snapped;
          setGuides({ page, guides: r.guides, distances: r.distances });
        } else setGuides(null);
      }
      store.patch(d.id, { x: snapped.x ? Math.round(x * 10) / 10 : snapTo(x, e.altKey), y: snapped.y ? Math.round(y * 10) / 10 : snapTo(y, e.altKey) }, `move:${d.id}`);
      return;
    }
    const pt = pagePoint(e.clientX, e.clientY, page);
    setIndicator(findTarget(page, pt.x, pt.y, subtreeIds(d.id)));
  }

  function onPointerUp() {
    if (marqueeRef.current) {
      const m = marqueeRef.current;
      marqueeRef.current = null;
      setMarquee(null);
      const rect = { x: Math.min(m.x0, m.x1), y: Math.min(m.y0, m.y1), width: Math.abs(m.x1 - m.x0), height: Math.abs(m.y1 - m.y0) };
      if (rect.width > 3 || rect.height > 3) {
        const p = paginated?.pages[m.page];
        const hits = p
          ? [...flat([...p.header, ...p.content, ...p.footer])].filter((n) => {
              const c = n.component as any;
              return c.id && !CONTAINERS.includes(c.type) && rectsIntersect(rect, n.box);
            })
          : [];
        useStore.getState().select(hits.map((n) => (n.component as any).id));
      }
      return;
    }
    setGuides(null);
    const d = drag.current;
    drag.current = null;
    if (d?.mode === "move" && d.moved && !d.orig.absolute && indicator) {
      const store = useStore.getState();
      store.setDoc(ops.move(store.doc, d.id, indicator.id, indicator.position));
    }
    setIndicator(null);
    setGhost(null);
  }

  // ---- drag & drop from the palette / data panel
  function onDragOver(e: React.DragEvent, page: number) {
    if (!e.dataTransfer.types.includes("application/x-rpt")) return;
    e.preventDefault();
    const pt = pagePoint(e.clientX, e.clientY, page);
    const bandIndex = structure?.bands.find((band) => pt.y >= band.y && pt.y < band.y + band.height)?.sectionIndex ?? null;
    const candidate = findTarget(page, pt.x, pt.y, new Set());
    setIndicator(structure && (bandIndex === null || !candidate || ops.bandIndexOf(doc, candidate.id) !== bandIndex) ? null : candidate);
  }

  function onDrop(e: React.DragEvent, page: number) {
    const raw = e.dataTransfer.getData("application/x-rpt");
    if (!raw) return;
    e.preventDefault();
    const payload = JSON.parse(raw);
    const store = useStore.getState();
    const pt = pagePoint(e.clientX, e.clientY, page);
    const bandIndex = structure?.bands.find((band) => pt.y >= band.y && pt.y < band.y + band.height)?.sectionIndex ?? null;
    const candidate = findTarget(page, pt.x, pt.y, new Set());
    const target = structure && (bandIndex === null || !candidate || ops.bandIndexOf(store.doc, candidate.id) !== bandIndex) ? null : candidate;
    setIndicator(null);
    const targetId = target?.id;
    const position = target?.position ?? "after";

    if (payload.kind === "component") {
      store.addComponent(payload.type, targetId, position, {}, bandIndex);
    } else if (payload.kind === "field") {
      const comp: any = { type: "text", binding: payload.binding };
      if (payload.fieldKind === "date") comp.format = "date:dd MMM yyyy";
      if (payload.fieldKind === "number" && /amount|price|total|rate|cost|balance|fee|tax/i.test(payload.name)) comp.format = "currency";
      if (payload.fieldKind === "number") comp.style = { align: "right" };
      const rowDataset = ops.rowDatasetAt(store.doc, targetId) ?? (bandIndex === null ? undefined : ops.rowDatasetAtBand(store.doc, bandIndex));
      if (payload.rowDataset && rowDataset !== payload.rowDataset) {
        // A field of an array dropped outside any row context: list that field once per row.
        store.insertComponent({ type: "repeater", dataset: payload.rowDataset, children: [comp] }, targetId, position, bandIndex);
      } else store.insertComponent(comp, targetId, position, bandIndex);
    } else if (payload.kind === "array") {
      store.set({ dropPrompt: { x: e.clientX, y: e.clientY, dataset: payload.ref, targetId, position, bandIndex } });
    }
  }

  // ---- fit-to-width helper & keyboard are handled in App; here just render
  if (!paginated) {
    return (
      <div className="canvas-scroll" ref={scroller}>
        <div className="canvas-empty">{engine.problems.some((p) => p.severity === "error") ? "Fix the errors in the Problems panel to see the report." : "Rendering..."}</div>
      </div>
    );
  }

  const pw = paginated.pageSize.width * k;
  const ph = paginated.pageSize.height * k;

  if (doc.print?.printerType === "receipt" && canvasView === "pages") {
    return (
      <div className="canvas-scroll receipt-canvas" ref={scroller} data-testid="canvas">
        <BandBar />
        <EscPosPreview design />
      </div>
    );
  }

  return (
    <div className={`canvas-scroll ${structure ? "structure" : ""}`} ref={scroller} data-testid="canvas">
      <BandBar />
      {structure && showPagination && engine.paginated && <StructurePageStrip paginated={engine.paginated} />}
      <div className={structure && previewSplit ? "canvas-layout with-preview" : "canvas-layout"}>
      <div className="pages">
        {paginated.pages.map((page, pi) => {
          const allNodes = [...flat([...page.background, ...page.header, ...page.content, ...page.footer])];
          const selected = allNodes.filter((n) => selSet.has((n.component as any).id));
          const single = selection.length === 1 ? selected[0] : undefined;
          const showHandles = single && ["text", "image", "qrcode", "barcode", "chart", "rectangle", "container", "row", "column", "grid", "spacer", "line", "table"].includes(single.component.type);
          return (
            <div key={pi} className="page-wrap" data-page={pi}>
              {!structure && (showPagination || bottom === "pagination") && pi > 0 && <div className="page-break-anchor" data-testid={`page-break-${pi + 1}`}>
                <button className="page-break-button" aria-expanded={explainedPage === pi + 1} onClick={() => setExplainedPage(explainedPage === pi + 1 ? null : pi + 1)}>Page {pi + 1} starts · Why?</button>
                {explainedPage === pi + 1 && <div className="page-break-popover"><PageBreakDetails paginated={paginated} pageNumber={pi + 1} /></div>}
              </div>}
              {showRulers && pi === 0 && (
                <>
                  <Rulers width={pw} height={ph} k={k} margin={paginated.margin} bands={structure?.bands} />
                </>
              )}
              <div
                ref={(r) => {
                  pageEls.current[pi] = r;
                }}
                className={`page ${showGrid ? (gridMode === "dots" ? "dots" : "grid") : ""} ${view.boundaries ? "boundaries" : ""}`}
                data-testid={`page-${pi + 1}`}
                style={{ width: pw, height: ph, fontFamily: canvasFontStack(capabilities, doc.theme?.fonts?.body), ["--gridsize" as any]: `${SNAP * k}px` }}
                onPointerDown={(e) => onPointerDown(e, pi)}
                onPointerMove={(e) => onPointerMove(e, pi)}
                onPointerUp={onPointerUp}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const target = (e.target as HTMLElement).closest("[data-cid]") as HTMLElement | null;
                  const st = useStore.getState();
                  if (target && !st.selection.includes(target.dataset.cid!)) st.select([target.dataset.cid!]);
                  st.set({ contextMenu: { x: e.clientX, y: e.clientY, id: target?.dataset.cid } });
                }}
                onDoubleClick={(e) => {
                  // pointer capture retargets events to the page, so hit-test explicitly
                  const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest("[data-cid]") as HTMLElement | null;
                  if (!target) return;
                  const st = useStore.getState();
                  const comp = ops.find(st.doc, target.dataset.cid!)?.comp;
                  if (!comp || comp.locked) return;
                  if (["text", "richText"].includes(comp.type)) {
                    if (comp.binding || comp.expression) {
                      st.toast("This text is bound to data - change it in the properties panel");
                      st.set({ rightOpen: true });
                    } else st.set({ editingText: comp.id });
                  } else if (comp.type === "table") st.set({ tableEditId: comp.id, selection: [comp.id], contextMenu: null });
                }}
                onDragOver={(e) => onDragOver(e, pi)}
                onDragLeave={() => setIndicator(null)}
                onDrop={(e) => onDrop(e, pi)}
              >
                {page.background.length > 0 && <div className="page-background-layer" aria-hidden="true">{page.background.map((node, index) => <NodeView key={index} node={node} k={k} capabilities={capabilities} />)}</div>}
                {view.margins && <div className="margin-guide" style={{ left: paginated.margin.left * k, top: paginated.margin.top * k, right: paginated.margin.right * k, bottom: paginated.margin.bottom * k }} />}
                {view.margins && doc.print?.safeMargin ? (
                  <div className="safe-area" title="Printer safe area" style={{ left: (doc.print.safeMargin / MM) * k, top: (doc.print.safeMargin / MM) * k, right: (doc.print.safeMargin / MM) * k, bottom: (doc.print.safeMargin / MM) * k }} />
                ) : null}
                {view.margins && !structure && <PageZones page={page} paginated={paginated} k={k} />}
                {[...page.header, ...page.content, ...page.footer].map((n, i) => (
                  <NodeView key={i} node={n} k={k} capabilities={capabilities} />
                ))}
                {structure && <BandChrome bands={structure.bands} k={k} />}
                {(doc.guides?.length ?? 0) > 0 && <GuideLayer k={k} width={pw} height={ph} />}
                {selected.map((n, i) => (
                  <div key={`sel${i}`} className="selbox" style={boxStyle(n, k)}>
                    {showHandles && n === single && !ops.find(doc, (single.component as any).id)?.comp.locked && (
                      <>
                        {(typeof ops.find(doc, (single.component as any).id)?.comp.x === "number" ? ["n", "s", "e", "w", "ne", "nw", "se", "sw"] : ["e", "s", "se"]).map((h) => (
                          <span key={h} className={`handle ${h}`} data-handle={h} />
                        ))}
                      </>
                    )}
                    {ops.find(doc, (n.component as any).id)?.comp.locked && <span className="lock-badge" title="Locked">🔒</span>}
                    {n === single && !editingText && <span className={`selection-metrics ${n.box.y + n.box.height + 22 > paginated.pageSize.height ? "above" : ""}`} data-testid="selection-metrics" title="Position and size in page coordinates">
                      X {measure(n.box.x)} · Y {measure(n.box.y)} · W {measure(n.box.width)} · H {measure(n.box.height)} {rulerUnit}
                    </span>}
                  </div>
                ))}
                {single && !drag.current && !editingText && <FloatingToolbar id={(single.component as any).id} left={Math.max(0, single.box.x * k)} top={Math.max(0, single.box.y * k - 38)} />}
                {editingText && (() => {
                  const target = allNodes.find((n) => (n.component as any).id === editingText);
                  return target ? <InlineEditor id={editingText} box={target.box} k={k} /> : null;
                })()}
                {view.diagnostics && <Diagnostics nodes={allNodes} k={k} />}
                {structure && showPagination && engine.paginated && <StructureBreakLayer structure={structure} paginated={engine.paginated} k={k} />}
                {guides && guides.page === pi && <SmartGuides g={guides} k={k} />}
                {marquee && marquee.page === pi && (
                  <div className="marquee" style={{ left: Math.min(marquee.x0, marquee.x1) * k, top: Math.min(marquee.y0, marquee.y1) * k, width: Math.abs(marquee.x1 - marquee.x0) * k, height: Math.abs(marquee.y1 - marquee.y0) * k }} />
                )}
                {indicator && indicator.page === pi && (
                  <div
                    className={`drop-indicator ${indicator.position}`}
                    style={
                      indicator.position === "inside"
                        ? { left: indicator.box.x * k, top: indicator.box.y * k, width: indicator.box.width * k, height: indicator.box.height * k }
                        : { left: indicator.box.x * k, width: indicator.box.width * k, top: (indicator.position === "before" ? indicator.box.y : indicator.box.y + indicator.box.height) * k }
                    }
                  />
                )}
                {ghost && ghost.page === pi && <div className="ghost" style={{ left: ghost.x, top: ghost.y, width: ghost.w, height: ghost.h }} />}
                <div className="page-label">
                  {structure ? "Structure view" : `Page ${pi + 1} / ${paginated.pages.length}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {structure && previewSplit && <PaginatedPreviewPane />}
      </div>
      <DropPromptMenu />
      <ContextMenu />
    </div>
  );
}

function PaginatedPreviewPane() {
  return <aside className="structure-preview-pane" aria-label="Paginated sample preview" data-testid="structure-preview-pane">
    <strong>Rendered PDF</strong>
    <PdfPreview compact />
  </aside>;
}

const MM = 25.4 / 72;

function PageZones({ page, paginated, k }: { page: any; paginated: any; k: number }) {
  const z = page.zones;
  const bodyEnd = Math.max(0, ...page.content.map((n: PositionedNode) => n.box.y + n.box.height));
  const remaining = z.body.y + z.body.height - bodyEnd;
  const zoneStyle = (y: number, h: number): React.CSSProperties => ({ left: paginated.margin.left * k, right: paginated.margin.right * k, top: y * k, height: h * k });
  return (
    <>
      {z.header.height > 0 && (
        <div className="zone header" style={zoneStyle(z.header.y, z.header.height)}>
          <span>Page header</span>
        </div>
      )}
      <div className="zone body" style={zoneStyle(z.body.y, z.body.height)}>
        <span>Body</span>
      </div>
      {z.footer.height > 0 && (
        <div className="zone footer" style={zoneStyle(z.footer.y, z.footer.height)}>
          <span>Page footer</span>
        </div>
      )}
      {remaining > 8 && (
        <div className="remaining" style={{ left: paginated.margin.left * k, right: paginated.margin.right * k, top: bodyEnd * k, height: remaining * k }} data-testid="remaining-area">
          <span>{(remaining * MM).toFixed(0)} mm free</span>
        </div>
      )}
    </>
  );
}

function SmartGuides({ g, k }: { g: { guides: Guide[]; distances: Distance[] }; k: number }) {
  return (
    <>
      {g.guides.map((l, i) => (
        <div key={i} className={`guide ${l.axis}${l.kind ? ` ${l.kind}` : ""}`} data-testid={l.kind === "baseline" ? "baseline-snap-guide" : undefined} style={l.axis === "x" ? { left: l.pos * k, top: l.from * k, height: (l.to - l.from) * k } : { top: l.pos * k, left: l.from * k, width: (l.to - l.from) * k }} />
      ))}
      {g.distances.map((d, i) => (
        <div key={`d${i}`} className={`dist ${d.axis}${d.equal ? " equal" : ""}`} data-testid={d.equal ? "equal-gap-guide" : undefined} title={d.equal ? "Equal spacing" : undefined} style={d.axis === "x" ? { left: d.from * k, width: (d.to - d.from) * k, top: d.at * k } : { top: d.from * k, height: (d.to - d.from) * k, left: d.at * k }}>
          <span>{d.mm.toFixed(1)} mm</span>
        </div>
      ))}
    </>
  );
}

function Diagnostics({ nodes, k }: { nodes: PositionedNode[]; k: number }) {
  const problems = useStore((s) => s.engine.problems);
  const byId = new Map<string, "error" | "warning">();
  for (const p of problems) {
    if (!p.componentId || p.severity === "suggestion") continue;
    if (byId.get(p.componentId) !== "error") byId.set(p.componentId, p.severity);
  }
  return (
    <>
      {nodes
        .filter((n) => byId.has((n.component as any).id))
        .map((n, i) => (
          <button
            key={i}
            className={`diag-badge ${byId.get((n.component as any).id)}`}
            data-testid="diag-badge"
            style={{ left: (n.box.x + n.box.width) * k - 8, top: n.box.y * k - 8 }}
            title="Show in Problems"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              useStore.getState().select([(n.component as any).id]);
              useStore.getState().set({ bottom: "problems" });
            }}
          >
            !
          </button>
        ))}
    </>
  );
}

function DropPromptMenu() {
  const prompt = useStore((s) => s.dropPrompt);
  if (!prompt) return null;
  return <DropPromptChoice key={`${prompt.dataset}:${prompt.x}:${prompt.y}`} prompt={prompt} />;
}

function DropPromptChoice({ prompt }: { prompt: NonNullable<ReturnType<typeof useStore.getState>["dropPrompt"]> }) {
  const { doc, sample } = useStore();
  const [display, setDisplay] = useState<ListDisplay>("table");
  const [createFields, setCreateFields] = useState(true);
  const firstChoice = useRef<HTMLInputElement>(null);
  const close = () => useStore.getState().set({ dropPrompt: null });
  const rows = datasetValue(doc, sample, prompt.dataset);
  const fields = scalarFields(datasetFields(doc, sample, prompt.dataset));
  const title = titleCase(prompt.dataset.split(".").pop()!);
  const canvasBounds = document.querySelector(".center")?.getBoundingClientRect();
  const dialogWidth = Math.min(360, window.innerWidth - 24);
  const canvasHasRoom = canvasBounds && canvasBounds.width >= dialogWidth + 24;
  const leftEdge = canvasHasRoom ? canvasBounds.left + 12 : 12;
  const rightEdge = canvasHasRoom ? canvasBounds.right - dialogWidth - 12 : window.innerWidth - dialogWidth - 12;
  useEffect(() => {
    firstChoice.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest(".drop-prompt")) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);
  const create = () => {
    const s = useStore.getState();
    s.insertComponent(listFor(prompt.dataset, title, rows, display, createFields, fields), prompt.targetId, prompt.position, prompt.bandIndex);
    s.set({ rightOpen: true });
    close();
  };
  return (
    <div className="drop-prompt" style={{ left: Math.max(leftEdge, Math.min(prompt.x, rightEdge)), top: Math.max(56, Math.min(prompt.y, window.innerHeight - 430)) }} role="dialog" aria-label={`Add ${title} to report`} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } }} data-testid="drop-prompt">
      <div className="drop-prompt-title">Add {title} to report</div>
      <p className="drop-prompt-subtitle">Choose how each record should appear.</p>
      <fieldset className="drop-prompt-options">
        <legend>Display as</legend>
        {([
          ["table", "Table", "Columns with repeating rows"],
          ["repeater", "Repeater", "A simple list of records"],
          ["cards", "Cards", "A separate bordered card per record"],
        ] as const).map(([value, label, description]) => (
          <label key={value} className={display === value ? "selected" : ""}>
            <input ref={value === "table" ? firstChoice : undefined} type="radio" name="array-display" value={value} checked={display === value} onChange={() => setDisplay(value)} />
            <span><strong>{label}</strong><small>{description}</small></span>
          </label>
        ))}
      </fieldset>
      <label className="drop-prompt-auto"><input type="checkbox" checked={createFields} onChange={(event) => setCreateFields(event.target.checked)} /> Create fields automatically</label>
      <p className="drop-prompt-fields">{fields.length ? `${fields.length} field${fields.length === 1 ? "" : "s"}: ${fields.slice(0, 5).map((field) => titleCase(field.name)).join(", ")}${fields.length > 5 ? "…" : ""}` : "No fields found. A blank field will be created for editing."}</p>
      <div className="drop-prompt-actions"><button className="btn" onClick={close}>Cancel</button><button className="btn primary" data-testid="create-array-display" onClick={create}>Create {display === "table" ? "table" : display === "cards" ? "cards" : "repeater"}</button></div>
    </div>
  );
}
