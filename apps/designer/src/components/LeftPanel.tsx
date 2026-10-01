import React, { useMemo, useState } from "react";
import { useStore } from "../store";
import * as ops from "../model/ops";
import { datasetValue, inferFields, type FieldNode } from "../lib/fields";
import { titleCase } from "../lib/lowcode";
import { Icon } from "./Icon";
import { api } from "../lib/api";

interface PaletteItem {
  type: string;
  label: string;
  group: string;
  keywords?: string;
  overrides?: Record<string, any>;
}

export const PALETTE_ITEMS: PaletteItem[] = [
  { type: "text", label: "Text", group: "Basic", keywords: "label heading paragraph" },
  { type: "image", label: "Image", group: "Basic", keywords: "logo picture photo" },
  { type: "line", label: "Line", group: "Basic", keywords: "divider rule" },
  { type: "rectangle", label: "Rectangle", group: "Basic", keywords: "shape box border" },
  { type: "spacer", label: "Spacer", group: "Basic", keywords: "gap space" },
  { type: "container", label: "Container", group: "Layout", keywords: "group box" },
  { type: "row", label: "Row", group: "Layout", keywords: "horizontal columns side by side" },
  { type: "column", label: "Column", group: "Layout", keywords: "vertical stack" },
  { type: "grid", label: "Grid", group: "Layout", keywords: "columns cells" },
  { type: "table", label: "Table", group: "Data", keywords: "rows columns list items" },
  { type: "repeater", label: "Repeater", group: "Data", keywords: "list loop each" },
  { type: "qrcode", label: "QR Code", group: "Print", keywords: "barcode 2d scan" },
  { type: "barcode", label: "Barcode", group: "Print", keywords: "code128 ean scan" },
  { type: "pageBreak", label: "Page break", group: "Print", keywords: "new page" },
  { type: "labelSheet", label: "Label sheet", group: "Print", keywords: "stickers avery a4 sheet labels n-up grid" },
  { type: "chart", label: "Bar chart", group: "Charts", keywords: "graph", overrides: { chartType: "bar" } },
  { type: "chart", label: "Line chart", group: "Charts", keywords: "graph trend", overrides: { chartType: "line" } },
  { type: "chart", label: "Pie chart", group: "Charts", keywords: "graph share", overrides: { chartType: "pie" } },
];

export function insertFromPalette(item: PaletteItem) {
  const s = useStore.getState();
  const last = s.selection[s.selection.length - 1];
  const loc = last ? ops.find(s.doc, last) : undefined;
  const container = loc && (ops.CONTAINER_TYPES as readonly string[]).includes(loc.comp.type) && loc.comp.type !== "group";
  s.addComponent(item.type, last, container ? "inside" : "after", item.overrides);
}

function PluginComponents({ q }: { q: string }) {
  const list = (useStore((s) => s.capabilities?.customComponents) ?? []).filter((c) => `${c.kind} ${c.description ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  if (!list.length) return null;
  return (
    <div className="palette-group" data-testid="plugin-components">
      <div className="group-title">Plugins</div>
      {list.map((c) => (
        <div key={c.kind} className="block-row">
          <button
            className="block-item"
            title={c.description}
            data-testid={`plugin-${c.kind}`}
            onClick={() => {
              const s = useStore.getState();
              const last = s.selection[s.selection.length - 1];
              s.insertComponent({ type: "custom", kind: c.kind, props: Object.fromEntries(Object.keys(c.props ?? {}).map((k) => [k, ""])) } as any, last, "after");
            }}
          >
            <Icon name="group" small />
            <span>{c.kind}</span>
            <span className="muted small">previews in Preview</span>
          </button>
        </div>
      ))}
    </div>
  );
}

function BlocksSection({ q }: { q: string }) {
  const blocks = useStore((s) => s.blocks);
  const filtered = blocks.filter((b) => b.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="palette-group" data-testid="my-components">
      <div className="group-title row-title">
        My Components
        <button className="mini" data-testid="save-block" title="Save the current selection as a reusable component" disabled={false} onClick={() => (useStore.getState().selection.length ? useStore.getState().set({ dialog: "block" }) : useStore.getState().toast("Select something on the canvas first"))}>
          + Save selection
        </button>
      </div>
      {filtered.length === 0 && <p className="muted small">Save headers, letterheads, signature blocks and totals once - reuse them in every report.</p>}
      {filtered.map((b) => (
        <div key={b.id} className="block-row">
          <button className="block-item" data-testid={`block-${b.id}`} onClick={() => useStore.getState().insertBlock(b.id)}>
            <Icon name="group" small />
            <span>{b.name}</span>
          </button>
          <button
            className="mini danger"
            aria-label={`Delete ${b.name}`}
            onClick={async () => {
              await api.deleteBlock(b.id);
              useStore.getState().loadBlocks();
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function InsertTab() {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const filtered = PALETTE_ITEMS.filter((i) => `${i.label} ${i.group} ${i.keywords ?? ""}`.toLowerCase().includes(q.toLowerCase()));
    const map = new Map<string, PaletteItem[]>();
    for (const i of filtered) map.set(i.group, [...(map.get(i.group) ?? []), i]);
    return [...map.entries()];
  }, [q]);
  return (
    <div className="tab-body">
      <input className="search" placeholder="Search components..." aria-label="Search components" value={q} onChange={(e) => setQ(e.target.value)} />
      {groups.map(([g, items]) => (
        <div key={g} className="palette-group">
          <div className="group-title">{g}</div>
          <div className="palette-grid">
            {items.map((i) => (
              <button
                key={i.label}
                className="palette-item"
                draggable
                data-testid={`palette-${i.label.toLowerCase().replace(/\s+/g, "-")}`}
                title={`Add ${i.label} (click, or drag onto the page)`}
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-rpt", JSON.stringify({ kind: "component", type: i.type }));
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => insertFromPalette(i)}
              >
                <Icon name={i.type === "chart" ? `chart-${i.overrides?.chartType}` : i.type} />
                <span>{i.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <PluginComponents q={q} />
      <BlocksSection q={q} />
      {groups.length === 0 && <p className="muted">No components match "{q}".</p>}
    </div>
  );
}

function FieldRow({ node, dsId, arrayRoot, depth, parentIsArray }: { node: FieldNode; dsId: string; arrayRoot?: string; depth: number; parentIsArray: boolean }) {
  const [open, setOpen] = useState(depth < 1);
  const isArray = node.kind === "array";
  const isObj = node.kind === "object";
  const ref = `${dsId}.${node.path}`;
  const payload = isArray
    ? { kind: "array", ref }
    : parentIsArray
      ? { kind: "field", binding: `row.${node.path.split(".").slice(arrayRoot ? arrayRoot.split(".").length : 0).join(".")}`, name: node.name, fieldKind: node.kind, rowDataset: arrayRoot ? `${dsId}.${arrayRoot}` : dsId }
      : { kind: "field", binding: `data.${dsId}.${node.path}`, name: node.name, fieldKind: node.kind };
  return (
    <div>
      <div
        className={`field-row kind-${node.kind}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        draggable={!isObj}
        data-testid={`field-${dsId}-${node.path}`}
        onDragStart={(e) => {
          e.dataTransfer.setData("application/x-rpt", JSON.stringify(payload));
          e.dataTransfer.effectAllowed = "copy";
        }}
        onClick={() => (isObj || isArray) && setOpen(!open)}
        title={isArray ? "Drag onto the page to create a Table or Repeater" : isObj ? "" : "Drag onto the page to create a bound text"}
      >
        <span className="twisty">{isObj || isArray ? (open ? "▾" : "▸") : ""}</span>
        <span className="field-icon">{isArray ? "[]" : isObj ? "{}" : node.kind === "number" ? "#" : node.kind === "date" ? "d" : node.kind === "boolean" ? "b" : "a"}</span>
        <span className="field-name">{titleCase(node.name)}</span>
        {isArray && <span className="badge">array</span>}
      </div>
      {open && node.children?.map((c) => <FieldRow key={c.path} node={c} dsId={dsId} arrayRoot={isArray ? node.path : arrayRoot} depth={depth + 1} parentIsArray={isArray || parentIsArray} />)}
    </div>
  );
}

function DataTab() {
  const { doc, sample, parameters } = useStore();
  const set = useStore((s) => s.set);
  const datasets: any[] = doc.datasets ?? [];
  const params: any[] = doc.parameters ?? [];
  return (
    <div className="tab-body">
      <div className="group-title row-title">
        Datasets
        <button className="mini" data-testid="add-dataset" onClick={() => set({ dialog: "dataset", editingDataset: null })}>
          + Add
        </button>
      </div>
      {datasets.length === 0 && <p className="muted">No data yet. Add a dataset or paste sample JSON to start binding fields.</p>}
      {datasets.map((ds) => {
        const value = datasetValue(doc, sample, ds.id);
        const fields = inferFields(value);
        const isArray = Array.isArray(value);
        return (
          <div key={ds.id} className="dataset" data-testid={`dataset-${ds.id}`}>
            <div className="dataset-head">
              <span className="ds-name">{ds.id}</span>
              <span className="badge">{ds.source}</span>
              <span className="spacer" />
              <button className="mini" aria-label={`Edit ${ds.id}`} onClick={() => set({ dialog: "dataset", editingDataset: ds.id })}>
                Edit
              </button>
              <button
                className="mini danger"
                aria-label={`Delete ${ds.id}`}
                onClick={() => useStore.getState().setDoc({ ...doc, datasets: datasets.filter((d) => d.id !== ds.id) })}
              >
                ×
              </button>
            </div>
            {isArray && (
              <div
                className="field-row kind-array"
                draggable
                data-testid={`array-${ds.id}`}
                onDragStart={(e) => e.dataTransfer.setData("application/x-rpt", JSON.stringify({ kind: "array", ref: ds.id }))}
                title="Drag onto the page to create a Table or Repeater"
              >
                <span className="field-icon">[]</span>
                <span className="field-name">{titleCase(ds.id)} rows</span>
                <span className="badge">drag</span>
              </div>
            )}
            {fields.map((f) => (
              <FieldRow key={f.path} node={f} dsId={ds.id} depth={0} parentIsArray={isArray} arrayRoot={isArray ? "" : undefined} />
            ))}
            {fields.length === 0 && <p className="muted small">No fields found{ds.source !== "inline" ? ` - open Edit and Test to load a preview` : ""}.</p>}
          </div>
        );
      })}

      <div className="group-title row-title">
        Parameters
        <button className="mini" data-testid="add-parameter" onClick={() => useStore.getState().setDoc({ ...doc, parameters: [...params, { id: `param${params.length + 1}`, type: "string", required: false }] })}>
          + Add
        </button>
      </div>
      {params.map((p, i) => (
        <div key={i} className="param-row">
          <input aria-label="Parameter id" value={p.id} onChange={(e) => update(i, { id: e.target.value })} />
          <select aria-label="Parameter type" value={p.type} onChange={(e) => update(i, { type: e.target.value })}>
            {["string", "number", "boolean", "date", "datetime", "array", "object", "enum"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <input aria-label="Sample value" placeholder="sample" value={String(parameters[p.id] ?? p.default ?? "")} onChange={(e) => useStore.getState().setParameter(p.id, e.target.value)} />
          <span draggable className="field-icon drag" title="Drag onto the page" onDragStart={(e) => e.dataTransfer.setData("application/x-rpt", JSON.stringify({ kind: "field", binding: `params.${p.id}`, name: p.id, fieldKind: "string" }))}>
            ⠿
          </span>
          <button className="mini danger" aria-label="Remove parameter" onClick={() => useStore.getState().setDoc({ ...doc, parameters: params.filter((_, j) => j !== i) })}>
            ×
          </button>
        </div>
      ))}
      <div className="group-title">Variables</div>
      {(doc.variables ?? []).map((v: any, i: number) => (
        <div key={i} className="param-row var">
          <input aria-label="Variable id" value={v.id} onChange={(e) => updateVar(i, { id: e.target.value })} />
          <select aria-label="Scope" value={v.scope} onChange={(e) => updateVar(i, { scope: e.target.value })}>
            {["report", "group", "row", "page"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <input aria-label="Variable expression" className="mono" placeholder="expression" value={v.expression} onChange={(e) => updateVar(i, { expression: e.target.value })} />
          <button className="mini danger" aria-label="Remove variable" onClick={() => useStore.getState().setDoc({ ...doc, variables: (doc.variables ?? []).filter((_: any, j: number) => j !== i) })}>
            ×
          </button>
        </div>
      ))}
      <button className="mini" onClick={() => useStore.getState().setDoc({ ...doc, variables: [...(doc.variables ?? []), { id: `var${(doc.variables ?? []).length + 1}`, scope: "report", expression: "0" }] })}>
        + Add variable
      </button>
    </div>
  );

  function update(i: number, patch: Record<string, any>) {
    const s = useStore.getState();
    s.setDoc({ ...s.doc, parameters: (s.doc.parameters ?? []).map((p: any, j: number) => (j === i ? { ...p, ...patch } : p)) }, { coalesce: `param${i}` });
  }
  function updateVar(i: number, patch: Record<string, any>) {
    const s = useStore.getState();
    s.setDoc({ ...s.doc, variables: (s.doc.variables ?? []).map((p: any, j: number) => (j === i ? { ...p, ...patch } : p)) }, { coalesce: `var${i}` });
  }
}

function LayerRow({ comp, depth }: { comp: ops.Comp; depth: number }) {
  const selection = useStore((s) => s.selection);
  const editingText = useStore((s) => s.renaming);
  const [open, setOpen] = useState(true);
  const kids = ops.CHILD_LISTS.flatMap((k) => (Array.isArray(comp[k]) ? (comp[k] as ops.Comp[]) : []));
  const selected = selection.includes(comp.id);
  const renaming = editingText === comp.id;
  const st = useStore.getState;
  return (
    <div>
      <div
        className={`layer ${selected ? "selected" : ""} ${comp.hidden ? "is-hidden" : ""}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        draggable={!comp.locked}
        data-testid={`layer-${comp.id}`}
        onClick={(e) => st().select([comp.id], e.shiftKey)}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!st().selection.includes(comp.id)) st().select([comp.id]);
          st().set({ contextMenu: { x: e.clientX, y: e.clientY, id: comp.id } });
        }}
        onDoubleClick={() => st().set({ renaming: comp.id })}
        onDragStart={(e) => e.dataTransfer.setData("application/x-layer", comp.id)}
        onDragOver={(e) => e.dataTransfer.types.includes("application/x-layer") && e.preventDefault()}
        onDrop={(e) => {
          const id = e.dataTransfer.getData("application/x-layer");
          if (!id) return;
          e.preventDefault();
          e.stopPropagation();
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const rel = (e.clientY - rect.top) / rect.height;
          const isContainer = (ops.CONTAINER_TYPES as readonly string[]).includes(comp.type);
          const s = st();
          s.setDoc(ops.move(s.doc, id, comp.id, isContainer && rel > 0.3 && rel < 0.7 ? "inside" : rel < 0.5 ? "before" : "after"));
        }}
      >
        <span className="twisty" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>{kids.length || comp.type === "table" ? (open ? "▾" : "▸") : ""}</span>
        <Icon name={comp.type} small />
        {renaming ? (
          <input
            className="layer-rename"
            data-testid="layer-rename"
            autoFocus
            defaultValue={comp.name ?? ops.layerName(comp)}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => (st().rename(comp.id, e.target.value.trim() === ops.layerName({ ...comp, name: undefined }) ? "" : e.target.value.trim()), st().set({ renaming: null }))}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") st().set({ renaming: null });
            }}
          />
        ) : (
          <span className="layer-name">{ops.layerName(comp)}</span>
        )}
        <span className="layer-actions">
          <button className={`layer-btn ${comp.locked ? "on" : ""}`} aria-label={comp.locked ? "Unlock" : "Lock"} title={comp.locked ? "Unlock" : "Lock"} data-testid={`lock-${comp.id}`} onClick={(e) => (e.stopPropagation(), st().toggleLock(comp.id))}>
            {comp.locked ? "🔒" : "🔓"}
          </button>
          <button className={`layer-btn ${comp.hidden ? "on" : ""}`} aria-label={comp.hidden ? "Show" : "Hide"} title={comp.hidden ? "Show" : "Hide"} data-testid={`hide-${comp.id}`} onClick={(e) => (e.stopPropagation(), st().toggleHide(comp.id))}>
            {comp.hidden ? "🙈" : "👁"}
          </button>
        </span>
      </div>
      {open && comp.type === "table" && (
        <>
          {[
            comp.showHeader !== false ? "Header row" : null,
            `Detail rows${comp.dataset ? ` · ${comp.dataset}` : ""}`,
            comp.showFooter ? "Footer row" : null,
          ]
            .filter(Boolean)
            .map((label) => (
              <div key={label as string} className="layer pseudo" style={{ paddingLeft: 8 + (depth + 1) * 14 }} onClick={() => st().select([comp.id])}>
                <span className="layer-type">▤</span>
                <span className="layer-name muted">{label}</span>
              </div>
            ))}
        </>
      )}
      {open && kids.map((k) => <LayerRow key={k.id} comp={k} depth={depth + 1} />)}
    </div>
  );
}

const SECTION_TYPES = ["reportHeader", "pageHeader", "detail", "pageFooter", "reportFooter"];

function LayersTab() {
  const { doc } = useStore();
  const sections: any[] = doc.sections ?? [];
  return (
    <div className="tab-body" data-testid="layers-tab">
      <div className="layer root">{doc.name}</div>
      {sections.map((s, i) => (
        <div key={i}>
          <div
            className="layer section"
            data-testid={`section-${s.type}`}
            onDragOver={(e) => e.dataTransfer.types.includes("application/x-layer") && e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("application/x-layer");
              if (!id) return;
              e.preventDefault();
              const st = useStore.getState();
              const loc = ops.find(st.doc, id);
              if (!loc) return;
              const without = ops.remove(st.doc, [id]);
              const next = structuredClone(without);
              next.sections[i].children.push(loc.comp);
              st.setDoc(next);
            }}
          >
            <span className="layer-type">{ops.sectionLabel(s)}</span>
            <span className="spacer" />
            <button
              className="mini danger"
              aria-label={`Remove ${s.type} section`}
              onClick={() => useStore.getState().setDoc(ops.removeSection(doc, i))}
            >
              ×
            </button>
          </div>
          {(s.children ?? []).map((c: ops.Comp) => (
            <LayerRow key={c.id} comp={c} depth={1} />
          ))}
        </div>
      ))}
      <label className="add-section">
        <span>Add section</span>
        <select
          value=""
          aria-label="Add section"
          onChange={(e) => {
            if (!e.target.value) return;
            const s = useStore.getState();
            s.setDoc({ ...s.doc, sections: [...(s.doc.sections ?? []), { type: e.target.value, children: [] }] });
          }}
        >
          <option value="">Choose...</option>
          {SECTION_TYPES.filter((t) => t === "detail" || !sections.some((s) => s.type === t)).map((t) => (
            <option key={t} value={t}>{ops.sectionLabel({ type: t })}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function PagesTab() {
  const { engine } = useStore();
  const pag = engine.paginated;
  if (!pag) return <div className="tab-body muted">No pages yet.</div>;
  const scale = 96 / pag.pageSize.width;
  return (
    <div className="tab-body" data-testid="pages-tab">
      {pag.pages.map((p, i) => (
        <button key={i} className="thumb" data-testid="page-thumb" onClick={() => document.querySelector(`[data-page="${i}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })} aria-label={`Go to page ${i + 1}`}>
          <span className="thumb-page" style={{ width: pag.pageSize.width * scale, height: pag.pageSize.height * scale }}>
            {[...p.header, ...p.content, ...p.footer].map((n, j) => (
              <span key={j} className={`thumb-box ${(n.component as any).type}`} style={{ left: n.box.x * scale, top: n.box.y * scale, width: Math.max(1, n.box.width * scale), height: Math.max(1, n.box.height * scale) }} />
            ))}
          </span>
          <span className="muted small">Page {i + 1}{(() => { const sec = (useStore.getState().doc.sections ?? [])[p.master.header ?? -1] as any; return sec?.appliesTo && sec.appliesTo !== "all" && sec.appliesTo !== "standard" ? ` · ${sec.appliesTo}` : ""; })()}</span>
        </button>
      ))}
    </div>
  );
}

export function LeftPanel() {
  const tab = useStore((s) => s.leftTab);
  const set = useStore((s) => s.set);
  return (
    <aside className="panel left" aria-label="Insert, data and layers">
      <div className="tabs" role="tablist">
        {(["insert", "layers", "data", "pages"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} data-testid={`left-tab-${t}`} onClick={() => set({ leftTab: t })}>
            {t === "insert" ? "Components" : titleCase(t)}
          </button>
        ))}
      </div>
      {tab === "insert" && <InsertTab />}
      {tab === "data" && <DataTab />}
      {tab === "layers" && <LayersTab />}
      {tab === "pages" && <PagesTab />}
    </aside>
  );
}
