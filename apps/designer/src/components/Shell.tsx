import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore, type Mode } from "../store";
import { api, ApiError, settings, type TemplateRecord } from "../lib/api";
import { STARTERS, blankReport } from "../lib/templates";
import { generateReportFromJson } from "../lib/generate";
import { insertFromPalette, PALETTE_ITEMS } from "./LeftPanel";
import { exportReport } from "./Preview";
import { DatasetEditor } from "./DatasetEditor";
import { GroupWizard } from "./GroupWizard";
import { SaveBlockDialogBody } from "./CanvasTools";
import { CompareDialogBody } from "./CompareDialog";
import { PublishDialogBody } from "./PublishDialog";
import { AiSettingsBody } from "./AiBar";
import { fitZoom } from "../lib/zoom";

// ------------------------------------------------------------------ toolbar
function useOutsideClose(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".menu-wrap")) close();
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open, close]);
}

function SaveIndicator() {
  const { saveState, meta } = useStore();
  const text = saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : saveState === "dirty" ? (meta.id ? "Unsaved changes" : "Draft kept locally") : meta.id ? "✓ Saved" : "✓ Draft saved locally";
  return (
    <span className={`save-state ${saveState}`} data-testid="save-state" aria-live="polite">
      {text}
    </span>
  );
}

const TARGETS = [
  { id: "pdf", label: "PDF" },
  { id: "html", label: "HTML" },
  { id: "xlsx", label: "Excel" },
  { id: "csv", label: "CSV (data)" },
  { id: "zpl", label: "Label (ZPL)" },
  { id: "escpos", label: "Receipt (ESC/POS)" },
];

export function Toolbar() {
  const { doc, meta, zoom, view, snap, past, future, engineBusy, target, mode, split } = useStore();
  const s = useStore.getState;
  const set = useStore((st) => st.set);
  const [menu, setMenu] = useState<null | "export" | "more" | "view">(null);
  const close = React.useCallback(() => setMenu(null), []);
  useOutsideClose(menu !== null, close);
  const setView = (k: keyof typeof view) => {
    const v = { ...s().view, [k]: !s().view[k] };
    set({ view: v, showGrid: v.grid, showRulers: v.rulers });
  };
  return (
    <header className="toolbar" role="toolbar" aria-label="Main toolbar">
      <div className="brand">
        <span className="logo" aria-hidden="true">▤</span>
        <button className="crumb" data-testid="btn-open" onClick={() => set({ dialog: "open" })}>
          Reports
        </button>
        <span className="sep-slash">/</span>
        <input
          className="title-input"
          data-testid="title-input"
          aria-label="Report name"
          value={doc.name ?? ""}
          onChange={(e) => s().setDoc({ ...s().doc, name: e.target.value }, { coalesce: "name" })}
        />
        <span className={`status-pill ${meta.status ?? "draft"}`} data-testid="status-pill">
          {meta.id ? `${meta.status ?? "draft"} · v${meta.version ?? 1}` : "unsaved"}
        </span>
        <SaveIndicator />
        {engineBusy && <span className="busy" aria-label="Updating">⟳</span>}
      </div>

      <div className="toolbar-group">
        <button className="icon-btn" data-testid="btn-undo" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!past.length} onClick={() => s().undo()}>↶</button>
        <button className="icon-btn" data-testid="btn-redo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!future.length} onClick={() => s().redo()}>↷</button>
        <span className="sep" />
        <button className="icon-btn" aria-label="Zoom out" title="Zoom out" onClick={() => set({ zoom: Math.max(0.25, +(zoom - 0.1).toFixed(2)), fitToWidth: false })}>−</button>
        <span className="zoom-label" data-testid="zoom-label">{Math.round(zoom * 100)}%</span>
        <button className="icon-btn" aria-label="Zoom in" title="Zoom in" onClick={() => set({ zoom: Math.min(3, +(zoom + 0.1).toFixed(2)), fitToWidth: false })}>+</button>
        <button className="icon-btn" title="Fit page width" aria-label="Fit to width" onClick={() => set({ zoom: fitZoom(), fitToWidth: true })}>⤢</button>
        <button className="icon-btn" title="Zoom to selection" aria-label="Zoom to selection" onClick={() => zoomToSelection()}>◎</button>
        <button className="icon-btn" title="Actual size (100%)" aria-label="Actual size" onClick={() => set({ zoom: 1, fitToWidth: false })}>1:1</button>
        <span className="sep" />
        <div className="menu-wrap">
          <button className="btn" data-testid="btn-view" aria-haspopup="menu" aria-expanded={menu === "view"} onClick={() => setMenu(menu === "view" ? null : "view")}>View ▾</button>
          {menu === "view" && (
            <div className="menu" role="menu">
              {(
                [
                  ["grid", "Grid", "toggle-grid"],
                  ["rulers", "Rulers", "toggle-rulers"],
                  ["guides", "Smart guides", "toggle-guides"],
                  ["margins", "Margins & safe area", "toggle-margins"],
                  ["boundaries", "Show all boundaries", "toggle-boundaries"],
                  ["diagnostics", "Diagnostics on canvas", "toggle-diagnostics"],
                ] as const
              ).map(([k, label, tid]) => (
                <button key={k} role="menuitemcheckbox" aria-checked={view[k]} data-testid={tid} onClick={() => setView(k)}>
                  <span className="check">{view[k] ? "✓" : ""}</span>
                  {label}
                </button>
              ))}
              <label className="menu-field">
                Design with
                <select data-testid="sample-rows" value={useStore.getState().sampleRows} onChange={(e) => (set({ sampleRows: Number(e.target.value) }), s().refresh())}>
                  <option value={0}>all rows</option>
                  <option value={5}>first 5 rows</option>
                  <option value={20}>first 20 rows</option>
                  <option value={50}>first 50 rows</option>
                </select>
              </label>
              <button role="menuitemcheckbox" aria-checked={snap} data-testid="toggle-snap" onClick={() => set({ snap: !snap })}>
                <span className="check">{snap ? "✓" : ""}</span>Snap to grid & components
              </button>
              <button role="menuitemcheckbox" aria-checked={useStore.getState().focusCanvas} data-testid="toggle-focus-canvas" onClick={() => {
                const state = s();
                if (state.focusCanvas) set({ ...state.focusRestore, focusCanvas: false, focusRestore: null });
                else set({ focusCanvas: true, focusRestore: { leftOpen: state.leftOpen, rightOpen: state.rightOpen, bottom: state.bottom }, leftOpen: false, rightOpen: false, bottom: null });
                setMenu(null);
              }}><span className="check">{useStore.getState().focusCanvas ? "✓" : ""}</span>Focus Canvas</button>
            </div>
          )}
        </div>
      </div>

      <div className="mode-switch" role="tablist" aria-label="Editor mode">
        {(["design", "data", "code", "preview"] as Mode[]).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? "active" : ""} data-testid={`mode-${m}`} onClick={() => set({ mode: m })}>
            {m === "design" ? "Design" : m === "data" ? "Data" : m === "code" ? "Code" : "Preview"}
          </button>
        ))}
        <button className={`split-btn ${split ? "active" : ""}`} data-testid="toggle-split" aria-pressed={split} title="Split view: design + code" onClick={() => set({ split: !split, mode: split ? s().mode : "design" })}>
          ◫
        </button>
      </div>

      <div className="toolbar-group right">
        <label className="target" title="Choose which output to design for; the editor warns about anything it can't express">
          <span className="muted small">Target</span>
          <select data-testid="target-select" value={target} onChange={(e) => (set({ target: e.target.value }), s().refresh())}>
            {TARGETS.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </label>
        <button className="btn ai-btn" data-testid="btn-ai" title="Ask AI to edit (Ctrl+J) - bring your own key" onClick={() => set({ aiOpen: !useStore.getState().aiOpen })}>
          ✦ AI
        </button>
        <button className="btn" data-testid="btn-palette" title="Command palette (Ctrl+K)" onClick={() => set({ dialog: "palette" })}>⌘K</button>
        <div className="menu-wrap">
          <button className="btn" data-testid="btn-export" aria-haspopup="menu" aria-expanded={menu === "export"} onClick={() => setMenu(menu === "export" ? null : "export")}>Export ▾</button>
          {menu === "export" && (
            <div className="menu" role="menu">
              {(["pdf", "html", "xlsx", "csv", "zpl", "escpos"] as const).map((f) => (
                <button key={f} role="menuitem" data-testid={`export-${f}`} onClick={() => (setMenu(null), exportReport(f))}>
                  {f === "zpl" ? "ZPL label" : f === "escpos" ? "ESC/POS receipt" : f.toUpperCase()}
                </button>
              ))}
              <hr />
              <button role="menuitem" data-testid="export-definition" onClick={() => (setMenu(null), downloadDefinition())}>Report definition (.json)</button>
            </div>
          )}
        </div>
        <button className="btn primary" data-testid="btn-preview" onClick={() => set({ mode: "preview" })}>▶ Preview</button>
        <button className="btn" data-testid="btn-save" onClick={() => s().save()}>Save</button>
        <button className="btn publish" data-testid="btn-publish" onClick={() => set({ dialog: "publish" })}>Publish</button>
        <div className="menu-wrap">
          <button className="icon-btn" data-testid="btn-more" aria-label="More" aria-haspopup="menu" aria-expanded={menu === "more"} onClick={() => setMenu(menu === "more" ? null : "more")}>⋯</button>
          {menu === "more" && (
            <div className="menu right" role="menu">
              <button role="menuitem" data-testid="btn-new" onClick={() => (setMenu(null), set({ dialog: "new" }))}>New report…</button>
              <button role="menuitem" onClick={() => (setMenu(null), set({ dialog: "open" }))}>Open…</button>
              <button role="menuitem" data-testid="menu-duplicate" onClick={() => (setMenu(null), duplicateReport())}>Duplicate report</button>
              <button role="menuitem" onClick={() => (setMenu(null), set({ dialog: "compare", compareVersion: null }))} disabled={!meta.id}>Compare versions…</button>
              <hr />
              <button role="menuitem" onClick={() => (setMenu(null), downloadDefinition())}>Export definition</button>
              <button role="menuitem" onClick={() => (setMenu(null), set({ dialog: "settings" }))}>Settings…</button>
              <hr />
              <button role="menuitem" className="danger" disabled={!meta.id} onClick={() => (setMenu(null), deleteReport())}>Delete report</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function downloadDefinition() {
  const { doc } = useStore.getState();
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${doc.id}.report.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function duplicateReport() {
  const s = useStore.getState();
  const copy = { ...structuredClone(s.doc), id: `${s.doc.id}-copy-${Date.now().toString(36).slice(-4)}`, name: `${s.doc.name} (copy)` };
  s.loadDoc(copy);
  s.toast("Duplicated - this copy is not saved yet");
}

async function deleteReport() {
  const s = useStore.getState();
  if (!s.meta.id || !window.confirm(`Delete "${s.doc.name}" and all of its versions? This cannot be undone.`)) return;
  try {
    await api.deleteTemplate(s.meta.id);
    s.loadDoc(blankReport());
    s.toast("Report deleted", "success");
  } catch (e) {
    s.toast((e as Error).message, "error");
  }
}

export function zoomToSelection() {
  const s = useStore.getState();
  const id = s.selection[0];
  const el = id ? (document.querySelector(`[data-cid="${id}"]`) as HTMLElement | null) : null;
  const scroller = document.querySelector(".canvas-scroll") as HTMLElement | null;
  if (!el || !scroller) return s.set({ zoom: fitZoom(), fitToWidth: true });
  const r = el.getBoundingClientRect();
  const factor = Math.min((scroller.clientWidth - 120) / r.width, (scroller.clientHeight - 120) / r.height, 4);
  s.set({ zoom: Math.max(0.25, Math.min(3, +(s.zoom * factor).toFixed(2))), fitToWidth: false });
  requestAnimationFrame(() => document.querySelector(`[data-cid="${id}"]`)?.scrollIntoView({ block: "center", inline: "center" }));
}

// ------------------------------------------------------------------ bottom bar + panels
export function BottomBar() {
  const { engine, bottom, doc } = useStore();
  const receipt = doc.print?.printerType === "receipt";
  const set = useStore((s) => s.set);
  const errors = engine.problems.filter((p) => p.severity === "error").length;
  const warnings = engine.problems.filter((p) => p.severity === "warning").length;
  const suggestions = engine.problems.filter((p) => p.severity === "suggestion").length;
  const decisions = engine.paginated?.decisions.length ?? 0;
  const toggle = (b: Exclude<typeof bottom, null>) => set({ bottom: bottom === b ? null : b });
  return (
    <footer className="bottombar">
      <div className="tabs" role="tablist" aria-label="Panels">
        <button role="tab" aria-selected={bottom === "problems"} className={bottom === "problems" ? "active" : ""} data-testid="toggle-problems" onClick={() => toggle("problems")}>
          Problems
        </button>
        <button role="tab" aria-selected={bottom === "pagination"} className={bottom === "pagination" ? "active" : ""} data-testid="toggle-pagination" onClick={() => toggle("pagination")}>
          {receipt ? "PDF pagination" : "Pagination"}{decisions ? ` (${decisions})` : ""}
        </button>
        <button role="tab" aria-selected={bottom === "history"} className={bottom === "history" ? "active" : ""} data-testid="toggle-history" onClick={() => toggle("history")}>
          History
        </button>
      </div>
      <div className="counts" data-testid="problem-counts">
        <span className={errors ? "err" : ""}>{errors} errors</span>
        <span className={warnings ? "warn" : ""}>{warnings} warnings</span>
        <span>{suggestions} suggestions</span>
        {engine.paginated && <span className="muted">{receipt ? "PDF: " : ""}{engine.paginated.pages.length} page{engine.paginated.pages.length === 1 ? "" : "s"}</span>}
      </div>
    </footer>
  );
}

export function BottomPanel() {
  const bottom = useStore((s) => s.bottom);
  if (!bottom) return null;
  return (
    <div className="bottom-panel" role="region" aria-label={bottom}>
      {bottom === "problems" && <ProblemsPanel />}
      {bottom === "pagination" && <PaginationPanel />}
      {bottom === "history" && <HistoryPanel />}
    </div>
  );
}

export function ProblemsPanel() {
  const { engine } = useStore();
  const order = { error: 0, warning: 1, suggestion: 2 } as const;
  const list = [...engine.problems].sort((a, b) => order[a.severity] - order[b.severity]);
  return (
    <div className="problems" data-testid="problems">
      {list.length === 0 && <div className="muted pad">No problems found.</div>}
      {list.map((p, i) => (
        <div key={i} className={`problem ${p.severity}`} data-testid={`problem-${p.severity}`}>
          <button
            className="problem-main"
            onClick={() => {
              if (p.datasetId) {
                useStore.getState().set({ mode: "data", editingDataset: p.datasetId });
                return;
              }
              if (p.componentId) {
                useStore.getState().select([p.componentId]);
                if (useStore.getState().mode !== "design") useStore.getState().set({ mode: "design" });
                requestAnimationFrame(() => document.querySelector(`[data-cid="${p.componentId}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
              }
            }}
          >
            <span className="sev">{p.severity === "error" ? "ERROR" : p.severity === "warning" ? "WARNING" : "SUGGESTION"}</span>
            <span className="msg">{p.message}</span>
            {p.componentId && <span className="where">{p.componentId}</span>}
          </button>
          {p.fix && (
            <button
              className="btn small fix"
              data-testid="problem-fix"
              onClick={() => {
                const st = useStore.getState();
                st.patch(p.fix!.id, p.fix!.patch, `fix:${p.code}`);
                st.toast(`Fixed: ${p.fix!.label}`, "success");
              }}
            >
              {p.fix.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function PaginationPanel() {
  const { engine } = useStore();
  const pag = engine.paginated;
  if (!pag) return <div className="muted pad">Nothing paginated yet.</div>;
  const mm = (pt: number) => `${(pt * 25.4 / 72).toFixed(1)} mm`;
  return (
    <div className="pagination-panel" data-testid="pagination-panel">
      <div className="pg-summary">
        <strong>{pag.pages.length} page{pag.pages.length === 1 ? "" : "s"}</strong>
        <span className="muted" data-testid="pagination-source">{engine.paginationSource === "pdf" ? "PDF font layout" : "Estimated font layout"}</span>
        <span className="muted">Printable area {mm(pag.pageSize.width - pag.margin.left - pag.margin.right)} × {mm(pag.pageSize.height - pag.margin.top - pag.margin.bottom)}</span>
      </div>
      {pag.decisions.length === 0 && <div className="muted pad">The layout engine made no break decisions - everything fits.</div>}
      {pag.decisions.map((d, i) => (
        <div key={i} className="decision-row">
        <button
          className={`decision ${d.kind}`}
          data-testid="pagination-decision"
          onClick={() => {
            const st = useStore.getState();
            if (d.componentId) st.select([d.componentId]);
            st.set({ mode: "design" });
            requestAnimationFrame(() => document.querySelector(`[data-page="${d.page - 1}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
          }}
        >
          <span className="dk">p.{d.page}</span>
          <span className="dm">
            <strong>{d.kind.replace(/-/g, " ")}</strong> {d.message}
            {d.required !== undefined && d.available !== undefined && (
              <em> needs {mm(d.required)}, {mm(d.available)} available</em>
            )}
          </span>
        </button>
        {d.componentId && d.actions?.map((a) => (
          <button key={a.label} className="btn small fix" data-testid="decision-action" onClick={() => useStore.getState().patch(d.componentId!, a.patch as any, `dec:${a.label}`)}>
            {a.label}
          </button>
        ))}
        </div>
      ))}
    </div>
  );
}

function HistoryPanel() {
  const { past, future, meta } = useStore();
  const restore = useStore((s) => s.restore);
  const set = useStore((s) => s.set);
  return (
    <div className="history-panel" data-testid="history-panel">
      <div className="pg-summary">
        <strong>History</strong>
        <span className="muted">{past.length} change{past.length === 1 ? "" : "s"} this session</span>
        <span className="spacer" />
        <button className="btn small" disabled={!meta.id} onClick={() => set({ dialog: "compare", compareVersion: null })}>Compare saved versions…</button>
      </div>
      {future.length > 0 && <div className="muted small pad">{future.length} undone step{future.length === 1 ? "" : "s"} can be redone</div>}
      {[...past].map((h, i) => ({ h, i })).reverse().map(({ h, i }) => (
        <button key={i} className="history-row" data-testid="history-row" onClick={() => restore(i)} title="Restore the report to how it was before this change">
          <span className="muted small">{new Date(h.at).toLocaleTimeString()}</span>
          <span>{h.label || "Edit"}</span>
          <span className="muted small">Restore before this</span>
        </button>
      ))}
      {past.length === 0 && <div className="muted pad">No edits yet.</div>}
    </div>
  );
}

// ------------------------------------------------------------------ dialogs
function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`}>{children}</div>
    </div>
  );
}

const DOC_SIZES: { label: string; page: Record<string, unknown>; print?: Record<string, unknown> }[] = [
  { label: "A4", page: { size: "A4", orientation: "portrait" } },
  { label: "A4 landscape", page: { size: "A4", orientation: "landscape" } },
  { label: "A5", page: { size: "A5", orientation: "portrait" } },
  { label: "Letter", page: { size: "Letter", orientation: "portrait" } },
  { label: "Receipt 80 mm", page: { size: "custom", width: 80, height: 200, unit: "mm", margin: { top: 3, right: 3, bottom: 3, left: 3 } }, print: { printerType: "receipt", language: "escpos", dpi: 203, safeMargin: 2 } },
  { label: "Receipt 58 mm", page: { size: "custom", width: 58, height: 160, unit: "mm", margin: { top: 3, right: 3, bottom: 3, left: 3 } }, print: { printerType: "receipt", language: "escpos", dpi: 203, safeMargin: 2 } },
  { label: "Label 40 × 25 mm", page: { size: "custom", width: 40, height: 25, unit: "mm", orientation: "landscape", margin: { top: 1.5, right: 2, bottom: 1.5, left: 2 } } },
  { label: "Label 50 × 30 mm", page: { size: "custom", width: 50, height: 30, unit: "mm", orientation: "landscape", margin: { top: 1.5, right: 2, bottom: 1.5, left: 2 } } },
  { label: "Label 100 × 50 mm", page: { size: "custom", width: 100, height: 50, unit: "mm", orientation: "landscape", margin: { top: 3, right: 4, bottom: 3, left: 4 } } },
];

function NewDialog() {
  const set = useStore((s) => s.set);
  const [q, setQ] = useState("");
  const [size, setSize] = useState(0);
  const groups = ["Documents", "Healthcare", "Printing", "Data"] as const;
  const create = (doc: any) => {
    useStore.getState().loadDoc(doc);
    set({ dialog: null, mode: "design" });
  };
  const createBlank = () => {
    const selected = DOC_SIZES[size]!;
    const blank = blankReport();
    create({ ...blank, page: { ...blank.page, ...selected.page }, ...(selected.print ? { print: selected.print } : {}) });
  };
  return (
    <Modal wide onClose={() => set({ dialog: null })}>
      <h2>New report</h2>
      <div className="starter-actions">
        <div className="starter blank">
          <button className="starter-main" data-testid="starter-blank" onClick={createBlank}>
            <strong>Blank report</strong>
            <span>Start from an empty page</span>
          </button>
          <select aria-label="Blank page size" data-testid="blank-size" value={size} onChange={(e) => setSize(Number(e.target.value))}>
            {DOC_SIZES.map((d, i) => (
              <option key={d.label} value={i}>{d.label}</option>
            ))}
          </select>
        </div>
        <button className="starter blank" data-testid="starter-json" onClick={() => set({ dialog: "generate" })}>
          <strong>From sample JSON</strong>
          <span>Paste data - fields, tables and layout are generated</span>
        </button>
      </div>
      <input className="search" data-testid="starter-search" placeholder="Search templates (invoice, label, wristband…)" aria-label="Search templates" value={q} onChange={(e) => setQ(e.target.value)} />
      {groups.filter((g) => STARTERS.some((t) => t.group === g && `${t.name} ${t.description}`.toLowerCase().includes(q.toLowerCase()))).map((g) => (
        <div key={g}>
          <div className="group-title">{g}</div>
          <div className="starter-grid">
            {STARTERS.filter((t) => t.group === g && `${t.name} ${t.description}`.toLowerCase().includes(q.toLowerCase())).map((t) => (
              <button
                key={t.key}
                className="starter"
                data-testid={`starter-${t.key}`}
                onClick={() => create({ ...structuredClone(t.doc), id: `${t.doc.id}-${Date.now().toString(36).slice(-4)}` })}
              >
                <strong>{t.name}</strong>
                <span>{t.description}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </Modal>
  );
}

const SAMPLE_JSON = `{
  "patient": { "name": "Sai Varaprasad", "mrn": "MRN-1042", "dob": "1994-05-12", "gender": "Male" },
  "invoice": {
    "number": "INV-2001",
    "date": "2025-02-10",
    "items": [
      { "description": "Consultation", "quantity": 1, "rate": 600 },
      { "description": "Blood test (CBC)", "quantity": 1, "rate": 450 },
      { "description": "X-ray chest", "quantity": 2, "rate": 700 }
    ]
  }
}`;

function GenerateDialog() {
  const set = useStore((s) => s.set);
  const [json, setJson] = useState(SAMPLE_JSON);
  const [name, setName] = useState("Patient invoice");
  const [error, setError] = useState("");
  return (
    <Modal wide onClose={() => set({ dialog: "new" })}>
      <h2>Create a report from sample JSON</h2>
      <p className="muted">Paste a response from your API. Datasets, bound fields and tables are created for you - then adjust visually.</p>
      <label className="field wide">
        <span className="field-label">Report name</span>
        <input data-testid="generate-name" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <textarea className="mono" data-testid="generate-json" rows={14} spellCheck={false} value={json} onChange={(e) => setJson(e.target.value)} aria-label="Sample JSON" />
      {error && <div className="field-error" role="alert">{error}</div>}
      <div className="dialog-actions">
        <button className="btn" onClick={() => set({ dialog: "new" })}>Back</button>
        <span className="spacer" />
        <button
          className="btn primary"
          data-testid="generate-create"
          onClick={() => {
            try {
              const doc = generateReportFromJson(JSON.parse(json), name || "New report");
              useStore.getState().loadDoc(doc);
              useStore.getState().set({ dialog: null, mode: "design", leftTab: "data" });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Create report
        </button>
      </div>
    </Modal>
  );
}

function OpenDialog() {
  const set = useStore((s) => s.set);
  const [items, setItems] = useState<TemplateRecord[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.listTemplates().then(setItems).catch((e) => setError((e as Error).message));
  }, []);
  return (
    <Modal onClose={() => set({ dialog: null })}>
      <h2>Open a saved report</h2>
      {error && <div className="field-error" role="alert">{error}</div>}
      {items && items.length === 0 && <p className="muted">Nothing saved yet. Use Save to store this report on the server.</p>}
      <ul className="template-list" data-testid="template-list">
        {(items ?? []).map((t) => (
          <li key={t.id}>
            <button data-testid={`open-${t.id}`} onClick={() => useStore.getState().openTemplate(t.id)}>
              <strong>{t.name}</strong>
              <span className={`status-pill ${t.status}`}>{t.status} · v{t.currentVersion}</span>
              <span className="muted small">{t.id}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function SettingsDialog() {
  const set = useStore((s) => s.set);
  const [key, setKey] = useState(settings.apiKey);
  const [base, setBase] = useState(settings.apiBase);
  const [health, setHealth] = useState("");
  return (
    <Modal onClose={() => set({ dialog: null })}>
      <h2>Server settings</h2>
      <label className="field wide">
        <span className="field-label">API base URL (blank = same origin / dev proxy)</span>
        <input value={base} onChange={(e) => setBase(e.target.value)} placeholder="http://localhost:4000" />
      </label>
      <label className="field wide">
        <span className="field-label">API key</span>
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} />
      </label>
      {health && <p className={health.startsWith("OK") ? "ok-text" : "field-error"}>{health}</p>}
      <div className="dialog-actions">
        <button
          className="btn"
          onClick={async () => {
            settings.apiBase = base;
            settings.apiKey = key;
            try {
              const r = await fetch(`${base}/health`);
              setHealth(r.ok ? "OK - server reachable" : `Server responded ${r.status}`);
            } catch {
              setHealth("Cannot reach the server");
            }
          }}
        >
          Test connection
        </button>
        <span className="spacer" />
        <button className="btn primary" onClick={() => ((settings.apiBase = base), (settings.apiKey = key), set({ dialog: null }))}>
          Save
        </button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ command palette
interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

function useCommands(): Command[] {
  return useMemo(() => {
    const s = () => useStore.getState();
    const cmds: Command[] = [
      { id: "ai", label: "Ask AI to edit the selection", hint: "Ctrl+J", run: () => s().set({ aiOpen: true }) },
      { id: "save", label: "Save report", hint: "Ctrl+S", run: () => s().save() },
      { id: "publish", label: "Review and publish version", run: () => s().set({ dialog: "publish" }) },
      { id: "new", label: "New report...", run: () => s().set({ dialog: "new" }) },
      { id: "open", label: "Open report...", run: () => s().set({ dialog: "open" }) },
      { id: "dataset", label: "Create dataset", run: () => s().set({ dialog: "dataset", editingDataset: null }) },
      { id: "json", label: "Paste sample JSON to generate a report", run: () => s().set({ dialog: "generate" }) },
      { id: "undo", label: "Undo", hint: "Ctrl+Z", run: () => s().undo() },
      { id: "redo", label: "Redo", hint: "Ctrl+Shift+Z", run: () => s().redo() },
      { id: "design", label: "Switch to Design", run: () => s().set({ mode: "design" }) },
      { id: "code", label: "Open report JSON", run: () => s().set({ mode: "code" }) },
      { id: "preview", label: "Preview PDF", run: () => s().set({ mode: "preview" }) },
      ...(["pdf", "html", "xlsx", "csv", "zpl"] as const).map((f) => ({ id: `export-${f}`, label: `Export ${f.toUpperCase()}`, run: () => exportReport(f) })),
      { id: "landscape", label: "Change page to landscape", run: () => s().setDoc({ ...s().doc, page: { ...s().doc.page, orientation: "landscape" } }) },
      { id: "portrait", label: "Change page to portrait", run: () => s().setDoc({ ...s().doc, page: { ...s().doc.page, orientation: "portrait" } }) },
      { id: "grid", label: "Toggle grid", run: () => s().set({ showGrid: !s().showGrid }) },
      { id: "rulers", label: "Toggle rulers", run: () => s().set({ showRulers: !s().showRulers }) },
      { id: "problems", label: "Toggle problems panel", run: () => s().set({ bottom: s().bottom === "problems" ? null : "problems" }) },
      { id: "pagination", label: "Show pagination decisions", run: () => s().set({ bottom: "pagination" }) },
      { id: "history", label: "Show history", run: () => s().set({ bottom: "history" }) },
      { id: "data", label: "Open Data mode", run: () => s().set({ mode: "data" }) },
      { id: "fit", label: "Zoom to fit width", run: () => s().set({ zoom: fitZoom(), fitToWidth: true }) },
      ...PALETTE_ITEMS.map((i) => ({ id: `add-${i.label}`, label: `Add ${i.label.toLowerCase()}`, run: () => insertFromPalette(i) })),
      ...((useStore.getState().doc.sections ?? []) as any[]).flatMap((sec) => (sec.children ?? []).map((c: any) => ({ id: `find-${c.id}`, label: `Find component: ${c.id}`, run: () => s().select([c.id]) }))),
    ];
    return cmds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useStore.getState().dialog]);
}

function CommandPalette() {
  const set = useStore((s) => s.set);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const cmds = useCommands();
  const list = cmds.filter((c) => c.label.toLowerCase().includes(q.toLowerCase())).slice(0, 12);
  const run = (c: Command) => {
    set({ dialog: null });
    setTimeout(c.run, 0);
  };
  return (
    <Modal onClose={() => set({ dialog: null })}>
      <input
        autoFocus
        className="palette-input"
        data-testid="palette-input"
        placeholder="Type a command... (add table, create dataset, preview PDF)"
        aria-label="Command"
        value={q}
        onChange={(e) => (setQ(e.target.value), setActive(0))}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(a + 1, list.length - 1)));
          if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
          if (e.key === "Enter" && list[active]) run(list[active]!);
        }}
      />
      <ul className="palette-list" role="listbox">
        {list.map((c, i) => (
          <li key={c.id} role="option" aria-selected={i === active} className={i === active ? "active" : ""} onMouseEnter={() => setActive(i)} onClick={() => run(c)}>
            <span>{c.label}</span>
            {c.hint && <kbd>{c.hint}</kbd>}
          </li>
        ))}
        {list.length === 0 && <li className="muted">No matching command</li>}
      </ul>
    </Modal>
  );
}

export function Dialogs() {
  const dialog = useStore((s) => s.dialog);
  const set = useStore((s) => s.set);
  if (!dialog) return null;
  if (dialog === "new") return <NewDialog />;
  if (dialog === "open") return <OpenDialog />;
  if (dialog === "settings") return <SettingsDialog />;
  if (dialog === "generate") return <GenerateDialog />;
  if (dialog === "palette") return <CommandPalette />;
  if (dialog === "ai-settings")
    return (
      <Modal onClose={() => set({ dialog: null })}>
        <AiSettingsBody onClose={() => set({ dialog: null })} />
      </Modal>
    );
  if (dialog === "compare")
    return (
      <Modal wide onClose={() => set({ dialog: null })}>
        <CompareDialogBody />
      </Modal>
    );
  if (dialog === "publish")
    return (
      <Modal wide onClose={() => set({ dialog: null })}>
        <PublishDialogBody />
      </Modal>
    );
  if (dialog === "block")
    return (
      <Modal onClose={() => set({ dialog: null })}>
        <SaveBlockDialogBody />
      </Modal>
    );
  if (dialog === "dataset")
    return (
      <Modal wide onClose={() => set({ dialog: null })}>
        <DatasetEditor key={useStore.getState().editingDataset ?? "new"} />
      </Modal>
    );
  if (dialog === "group")
    return (
      <Modal onClose={() => set({ dialog: null })}>
        <GroupWizard />
      </Modal>
    );
  return null;
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} data-testid="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}

export { ApiError };
