import React, { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { resolveColumnWidths, type PositionedNode } from "@reporting/layout";
import { renderChartSvg } from "@reporting/renderer-html/chart";
import { useStore } from "../store";
import * as ops from "../model/ops";
import { cssFrom } from "../lib/css";
import { datasetValue, inferFields } from "../lib/fields";
import { tableFor } from "../lib/generate";
import { titleCase } from "../lib/lowcode";

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

function NodeView({ node, k }: { node: PositionedNode; k: number }) {
  const c = node.component as any;
  const common = { "data-cid": c.id } as Record<string, any>;
  const st = boxStyle(node, k);

  switch (c.type) {
    case "text":
    case "richText":
    case "field":
      return (
        <div {...common} className="cn cn-text" style={{ ...st, ...cssFrom(c.style, k), whiteSpace: "pre-wrap", overflow: "hidden" }}>
          {c.text}
        </div>
      );
    case "image":
      return c.src ? (
        <img {...common} className="cn" src={c.src} alt={c.alt ?? ""} style={{ ...st, objectFit: c.fit === "cover" ? "cover" : c.fit === "fill" || c.fit === "stretch" ? "fill" : "contain" }} />
      ) : (
        <div {...common} className="cn cn-placeholder" style={st}>
          <span>Image</span>
        </div>
      );
    case "line":
      return <div {...common} className="cn" style={{ ...st, ...(c.orientation === "vertical" ? { borderLeft: `${k}px solid #000` } : { borderTop: `${k}px solid #000` }) }} />;
    case "rectangle":
      return <div {...common} className="cn" style={{ ...st, ...(c.style ? cssFrom(c.style, k) : { border: `${k}px solid #000` }) }} />;
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
      return <TableView node={node} k={k} />;
    default: {
      const own = CONTAINERS.includes(c.type);
      return (
        <>
          {own && <div {...common} className={`cn cn-block cn-${c.type}`} style={{ ...st, ...cssFrom(c.style, k) }} />}
          {(node.children ?? []).map((ch, i) => (
            <NodeView key={i} node={ch} k={k} />
          ))}
        </>
      );
    }
  }
}

function TableView({ node, k }: { node: PositionedNode; k: number }) {
  const t = node.component as any;
  const widths = resolveColumnWidths(t, node.box.width);
  const start = node.rowRange?.start ?? 0;
  const end = node.rowRange?.end ?? t.rows.length;
  const fs = ((t.style?.fontSize as number) ?? 10) * k;
  return (
    <table data-cid={t.id} className="cn cn-table" style={{ ...boxStyle(node, k), borderCollapse: "collapse", fontSize: fs, tableLayout: "fixed", ...cssFrom(t.style, k) }}>
      <colgroup>
        {widths.map((w, i) => (
          <col key={i} style={{ width: w.width * k }} />
        ))}
      </colgroup>
      {t.showHeader && (
        <thead>
          <tr>
            {t.columns.map((c: any) => (
              <th key={c.id} style={{ textAlign: c.align ?? "left", borderBottom: `${k}px solid #000`, padding: `${2 * k}px ${4 * k}px`, fontWeight: 700 }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {t.rows.slice(start, end).map((row: any, i: number) => (
          <tr key={start + i} style={{ background: t.alternateRowStyle && (start + i) % 2 === 1 ? "#f5f5f5" : undefined, ...cssFrom(row.style, k) }}>
            {t.columns.map((c: any) => (
              <td key={c.id} style={{ textAlign: c.align ?? "left", padding: `${2 * k}px ${4 * k}px`, overflow: "hidden", whiteSpace: "nowrap" }}>
                {row.formatted[c.id]}
              </td>
            ))}
          </tr>
        ))}
        {t.rows.length === 0 && (
          <tr>
            <td colSpan={t.columns.length} style={{ color: "#9ca3af", padding: 4 * k }}>
              No rows - bind a dataset
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
  const { engine, zoom, selection, showGrid, showRulers, doc, sample, snap } = useStore();
  const k = PT * zoom;
  const paginated = engine.paginated;
  const [indicator, setIndicator] = useState<DropTarget | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; w: number; h: number; page: number } | null>(null);
  const drag = useRef<null | { id: string; mode: "move" | "resize"; handle?: string; sx: number; sy: number; moved: boolean; orig: any; page: number }>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const selSet = useMemo(() => new Set(selection), [selection]);

  const pageEls = useRef<(HTMLDivElement | null)[]>([]);

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

  function snapTo(v: number) {
    return snap ? Math.round(v / SNAP) * SNAP : Math.round(v * 10) / 10;
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
      drag.current = { id, mode: "resize", handle: handle.dataset.handle, sx: e.clientX, sy: e.clientY, moved: false, orig: { w: node?.box.width ?? 0, h: node?.box.height ?? 0, x: Number(loc?.comp.x) || 0, y: Number(loc?.comp.y) || 0 }, page };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (!el) {
      store.select([]);
      return;
    }
    const id = el.dataset.cid!;
    if (e.shiftKey) store.select([id], true);
    else if (!store.selection.includes(id)) store.select([id]);
    const loc = ops.find(store.doc, id);
    drag.current = { id, mode: "move", sx: e.clientX, sy: e.clientY, moved: false, orig: { x: Number(loc?.comp.x) || 0, y: Number(loc?.comp.y) || 0, absolute: ops.parentLayout(store.doc, id) === "absolute" || typeof loc?.comp.x === "number" }, page };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent, page: number) {
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
      if (h.includes("e")) patch.width = Math.max(8, snapTo(d.orig.w + dx));
      if (h.includes("s")) patch.height = Math.max(4, snapTo(d.orig.h + dy));
      store.patch(d.id, patch, `resize:${d.id}`);
      return;
    }
    if (d.orig.absolute) {
      store.patch(d.id, { x: snapTo(d.orig.x + dx), y: snapTo(d.orig.y + dy) }, `move:${d.id}`);
      return;
    }
    const pt = pagePoint(e.clientX, e.clientY, page);
    setIndicator(findTarget(page, pt.x, pt.y, subtreeIds(d.id)));
  }

  function onPointerUp() {
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
    setIndicator(findTarget(page, pt.x, pt.y, new Set()));
  }

  function onDrop(e: React.DragEvent, page: number) {
    const raw = e.dataTransfer.getData("application/x-rpt");
    if (!raw) return;
    e.preventDefault();
    const payload = JSON.parse(raw);
    const store = useStore.getState();
    const pt = pagePoint(e.clientX, e.clientY, page);
    const target = findTarget(page, pt.x, pt.y, new Set());
    setIndicator(null);
    const targetId = target?.id;
    const position = target?.position ?? "after";

    if (payload.kind === "component") {
      store.addComponent(payload.type, targetId, position);
    } else if (payload.kind === "field") {
      const comp: any = { type: "text", binding: payload.binding };
      if (payload.fieldKind === "date") comp.format = "date:dd MMM yyyy";
      if (payload.fieldKind === "number" && /amount|price|total|rate|cost|balance|fee|tax/i.test(payload.name)) comp.format = "currency";
      if (payload.fieldKind === "number") comp.style = { align: "right" };
      if (payload.rowDataset && !ops.rowDatasetAt(store.doc, targetId)) {
        // A field of an array dropped outside any row context: list that field once per row.
        store.insertComponent({ type: "repeater", dataset: payload.rowDataset, children: [comp] }, targetId, position);
      } else store.insertComponent(comp, targetId, position);
    } else if (payload.kind === "array") {
      const r = el(e);
      store.set({ dropPrompt: { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0), dataset: payload.ref, targetId, position } });
    }
  }

  function el(e: React.DragEvent) {
    return (e.currentTarget as HTMLElement).closest(".canvas-scroll")?.getBoundingClientRect();
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

  return (
    <div className="canvas-scroll" ref={scroller} data-testid="canvas">
      <div className="pages">
        {paginated.pages.map((page, pi) => {
          const allNodes = [...flat([...page.header, ...page.content, ...page.footer])];
          const selected = allNodes.filter((n) => selSet.has((n.component as any).id));
          const single = selection.length === 1 ? selected[0] : undefined;
          const showHandles = single && ["text", "image", "qrcode", "barcode", "chart", "rectangle", "container", "row", "column", "grid", "spacer", "line", "table"].includes(single.component.type);
          return (
            <div key={pi} className="page-wrap">
              {showRulers && pi === 0 && (
                <>
                  <Ruler width={pw} height={ph} k={k} />
                  <Ruler width={pw} height={ph} k={k} vertical />
                </>
              )}
              <div
                ref={(r) => {
                  pageEls.current[pi] = r;
                }}
                className={`page ${showGrid ? "grid" : ""}`}
                data-testid={`page-${pi + 1}`}
                style={{ width: pw, height: ph, ["--gridsize" as any]: `${SNAP * k}px` }}
                onPointerDown={(e) => onPointerDown(e, pi)}
                onPointerMove={(e) => onPointerMove(e, pi)}
                onPointerUp={onPointerUp}
                onDragOver={(e) => onDragOver(e, pi)}
                onDragLeave={() => setIndicator(null)}
                onDrop={(e) => onDrop(e, pi)}
              >
                <div className="margin-guide" style={{ left: paginated.margin.left * k, top: paginated.margin.top * k, right: paginated.margin.right * k, bottom: paginated.margin.bottom * k }} />
                {[...page.header, ...page.content, ...page.footer].map((n, i) => (
                  <NodeView key={i} node={n} k={k} />
                ))}
                {selected.map((n, i) => (
                  <div key={`sel${i}`} className="selbox" style={boxStyle(n, k)}>
                    {showHandles && n === single && (
                      <>
                        <span className="handle e" data-handle="e" />
                        <span className="handle s" data-handle="s" />
                        <span className="handle se" data-handle="se" />
                      </>
                    )}
                  </div>
                ))}
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
                  Page {pi + 1} / {paginated.pages.length}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <DropPromptMenu />
    </div>
  );
}

function DropPromptMenu() {
  const prompt = useStore((s) => s.dropPrompt);
  const { doc, sample } = useStore();
  if (!prompt) return null;
  const close = () => useStore.getState().set({ dropPrompt: null });
  const rows = datasetValue(doc, sample, prompt.dataset);
  const create = (kind: "table" | "repeater") => {
    const s = useStore.getState();
    if (kind === "table") {
      const [heading, table] = tableFor(prompt.dataset, prompt.dataset.split(".").pop()!, rows);
      s.insertComponent(table as any, prompt.targetId, prompt.position);
      void heading;
    } else {
      const fields = inferFields(rows).filter((f) => f.kind !== "array" && f.kind !== "object").slice(0, 4);
      s.insertComponent(
        {
          type: "repeater",
          dataset: prompt.dataset,
          children: fields.map((f, i) => ({ type: "text", binding: `row.${f.path}`, style: i === 0 ? { fontWeight: "bold" } : { color: "#6b7280" } })),
        },
        prompt.targetId,
        prompt.position
      );
    }
    close();
  };
  return (
    <div className="drop-prompt" style={{ left: prompt.x, top: prompt.y }} role="menu" data-testid="drop-prompt">
      <div className="drop-prompt-title">Create {titleCase(prompt.dataset.split(".").pop()!)} as</div>
      <button onClick={() => create("table")}>Table</button>
      <button onClick={() => create("repeater")}>Repeater</button>
      <button className="ghost-btn" onClick={close}>
        Cancel
      </button>
    </div>
  );
}
