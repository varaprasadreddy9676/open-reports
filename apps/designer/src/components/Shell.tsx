import { ThemeDialogBody } from "./ThemeDialog";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { loadDraft, requestReplaceReport, resolveReplaceReport, useStore, type Mode } from "../store";
import { api, ApiError, settings, type TemplateRecord } from "../lib/api";
import { STARTERS, blankReport } from "../lib/templates";
import { generateReportFromJson } from "../lib/generate";
import { insertFromPalette, PALETTE_ITEMS } from "./LeftPanel";
import { exportReport } from "./Preview";
import { DatasetEditor } from "./DatasetEditor";
import { GroupWizard } from "./GroupWizard";
import { PageBreakDetails } from "./PageBreakDetails";
import { SaveBlockDialogBody } from "./CanvasTools";
import { CompareDialogBody } from "./CompareDialog";
import { PublishDialogBody } from "./PublishDialog";
import { AiSettingsBody } from "./AiBar";
import { ShortcutSheet } from "./ShortcutSheet";
import { COMMANDS, shortcutLabel } from "../lib/commands";
import { importJrxml, type ImportResult } from "@reporting/jrxml-import";
import { JrxmlFolderImport } from "./JrxmlFolderImport";

/** Opens the "I tried Open Reports" issue form on the upstream repository. */
const FEEDBACK_URL = "https://github.com/varaprasadreddy9676/open-reports/issues/new?template=1-feedback.yml";

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
  const { doc, meta, view, snap, past, future, engineBusy, target, mode, split, embedded } = useStore();
  const s = useStore.getState;
  const set = useStore((st) => st.set);
  const [menu, setMenu] = useState<null | "export" | "more" | "view">(null);
  const printerFormat = doc.print?.printerType === "receipt" ? "escpos" : ["label", "card", "wristband"].includes(doc.print?.printerType ?? "") ? "zpl" : null;
  const close = React.useCallback(() => setMenu(null), []);
  useOutsideClose(menu !== null, close);
  useEffect(() => {
    if (menu) requestAnimationFrame(() => document.querySelector<HTMLElement>('.toolbar [role="menu"] [role="menuitem"]:not(:disabled), .toolbar [role="menu"] [role="menuitemcheckbox"]:not(:disabled)')?.focus());
  }, [menu]);
  const setView = (k: keyof typeof view) => {
    const v = { ...s().view, [k]: !s().view[k] };
    set({ view: v, showGrid: v.grid, showRulers: v.rulers });
  };
  return (
    <header className="toolbar" role="toolbar" aria-label="Main toolbar">
      <div className="brand">
        {!embedded && <button className="home-nav" data-testid="btn-home" title="Go to Home" onClick={() => set({ home: true, dialog: null })}>
          <span className="logo" aria-hidden="true">▤</span>
          <span>Home</span>
        </button>}
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

      <div className="toolbar-group toolbar-history">
        <button className="icon-btn" data-testid="btn-undo" title={`Undo (${shortcutLabel("undo")})`} aria-label="Undo" disabled={!past.length} onClick={() => s().undo()}>↶</button>
        <button className="icon-btn" data-testid="btn-redo" title={`Redo (${shortcutLabel("redo")})`} aria-label="Redo" disabled={!future.length} onClick={() => s().redo()}>↷</button>
      </div>

      <div className="mode-switch" role="tablist" aria-label="Editor mode">
        {(["design", "data", "code", "preview"] as Mode[]).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? "active" : ""} data-testid={`mode-${m}`} onClick={() => set({ mode: m })}>
            {m === "design" ? "Design" : m === "data" ? "Data" : m === "code" ? "Code" : "Preview"}
          </button>
        ))}
      </div>

      <div className="toolbar-group right">
        <button className="btn toolbar-open" data-testid="btn-open" onClick={() => set({ dialog: "open" })}>Open</button>
        <button className="btn" data-testid="btn-preview" onClick={() => set({ mode: "preview", demoHint: null })}>▶ Run preview</button>
        <button className="btn" data-testid="btn-save" onClick={() => s().save()}>Save</button>
        <button className="btn publish" data-testid="btn-publish" onClick={() => set({ dialog: "publish" })}>Publish</button>
        <div className="menu-wrap" onKeyDown={(e) => {
          if (!menu) return;
          if (e.key === "Escape") {
            e.preventDefault();
            setMenu(null);
            document.querySelector<HTMLElement>('[data-testid="btn-more"]')?.focus();
            return;
          }
          if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement || !["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
          const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled)'));
          if (!items.length) return;
          e.preventDefault();
          const at = items.indexOf(document.activeElement as HTMLElement);
          const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
          items[next]?.focus();
        }}>
          <button className="icon-btn" data-testid="btn-more" aria-label="More report actions" aria-haspopup="menu" aria-expanded={menu !== null} onClick={() => setMenu(menu === null ? "more" : null)}>⋯</button>
          {menu === "more" && (
            <div className="menu right" role="menu">
              <button role="menuitem" data-testid="btn-new" onClick={() => (setMenu(null), set({ dialog: "new" }))}>New report…</button>
              <button role="menuitem" onClick={() => (setMenu(null), set({ dialog: "open" }))}>Open…</button>
              <button role="menuitem" data-testid="menu-import-jrxml" onClick={() => (setMenu(null), set({ dialog: "import-jrxml" }))}>Import JRXML…</button>
              <button role="menuitem" data-testid="menu-duplicate" onClick={() => (setMenu(null), duplicateReport())}>Duplicate report</button>
              <button role="menuitem" onClick={() => (setMenu(null), set({ dialog: "compare", compareVersion: null }))} disabled={!meta.id}>Compare versions…</button>
              <hr />
              <button role="menuitem" data-testid="btn-view" onClick={() => setMenu("view")}>Canvas view options…</button>
              <button role="menuitemcheckbox" aria-checked={split} data-testid="toggle-split" onClick={() => (set({ split: !split, mode: split ? s().mode : "design" }), setMenu(null))}><span className="check">{split ? "✓" : ""}</span>Split design and code</button>
              <button role="menuitem" data-testid="btn-ai" onClick={() => (set({ aiOpen: !s().aiOpen }), setMenu(null))}>Ask AI…</button>
              <button role="menuitem" data-testid="btn-palette" onClick={() => (set({ dialog: "palette" }), setMenu(null))}>Command palette… <kbd>⌘K</kbd></button>
              <button role="menuitem" data-testid="btn-export" onClick={() => setMenu("export")}>Export…</button>
              <label className="menu-field">Output target
                <select data-testid="target-select" value={target} onChange={(e) => (set({ target: e.target.value }), s().refresh())}>
                  {TARGETS.filter((t) => t.id !== "zpl" && t.id !== "escpos" || t.id === printerFormat).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </label>
              <hr />
              <button role="menuitem" onClick={() => (setMenu(null), set({ dialog: "settings" }))}>Settings…</button>
              {!embedded && <a role="menuitem" data-testid="menu-feedback" href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" onClick={() => setMenu(null)}>Send feedback ↗</a>}
              <hr />
              <button role="menuitem" className="danger" disabled={!meta.id} onClick={() => (setMenu(null), deleteReport())}>Delete report</button>
            </div>
          )}
          {menu === "export" && <div className="menu right" role="menu">
            <button role="menuitem" onClick={() => setMenu("more")}>← Report actions</button>
            <hr />
            {(["pdf", "html", "xlsx", "csv", ...(printerFormat ? [printerFormat] : [])] as ("pdf" | "html" | "xlsx" | "csv" | "zpl" | "escpos")[]).map((f) => (
              <button key={f} role="menuitem" data-testid={`export-${f}`} onClick={() => (setMenu(null), exportReport(f))}>
                {f === "zpl" ? "ZPL label" : f === "escpos" ? "ESC/POS receipt" : f.toUpperCase()}
              </button>
            ))}
            <hr />
            <button role="menuitem" data-testid="export-definition" onClick={() => (setMenu(null), downloadDefinition())}>Report definition (.json)</button>
          </div>}
          {menu === "view" && <div className="menu right" role="menu">
            <button role="menuitem" onClick={() => setMenu("more")}>← Report actions</button>
            <hr />
            {([
              ["grid", "Grid", "toggle-grid"],
              ["rulers", "Rulers", "toggle-rulers"],
              ["guides", "Smart guides", "toggle-guides"],
              ["margins", "Margins & safe area", "toggle-margins"],
              ["boundaries", "Show all boundaries", "toggle-boundaries"],
              ["diagnostics", "Diagnostics on canvas", "toggle-diagnostics"],
            ] as const).map(([k, label, tid]) => (
              <button key={k} role="menuitemcheckbox" aria-checked={view[k]} data-testid={tid} onClick={() => setView(k)}>
                <span className="check">{view[k] ? "✓" : ""}</span>{label}
              </button>
            ))}
            <label className="menu-field">Design with
              <select data-testid="sample-rows" value={useStore.getState().sampleRows} onChange={(e) => (set({ sampleRows: Number(e.target.value) }), s().refresh())}>
                <option value={0}>all rows</option>
                <option value={5}>first 5 rows</option>
                <option value={20}>first 20 rows</option>
                <option value={50}>first 50 rows</option>
              </select>
            </label>
            <button role="menuitemcheckbox" aria-checked={snap} data-testid="toggle-snap" onClick={() => set({ snap: !snap })}><span className="check">{snap ? "✓" : ""}</span>Snap to grid & components</button>
            <button role="menuitemcheckbox" aria-checked={useStore.getState().focusCanvas} data-testid="toggle-focus-canvas" onClick={() => {
              const state = s();
              if (state.focusCanvas) set({ ...state.focusRestore, focusCanvas: false, focusRestore: null });
              else set({ focusCanvas: true, focusRestore: { leftOpen: state.leftOpen, rightOpen: state.rightOpen, bottom: state.bottom }, leftOpen: false, rightOpen: false, bottom: null });
              setMenu(null);
            }}><span className="check">{useStore.getState().focusCanvas ? "✓" : ""}</span>Focus Canvas</button>
          </div>}
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
  requestReplaceReport(() => {
    s.loadDoc(copy);
    s.toast("Duplicated - this copy is not saved yet");
  });
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
        {useStore.getState().migrationIssues.length > 0 && <button role="tab" aria-selected={bottom === "migration"} className={bottom === "migration" ? "active" : ""} data-testid="toggle-migration" onClick={() => toggle("migration")}>
          Migration ({useStore.getState().migrationIssues.filter((issue) => issue.status !== "converted").length})
        </button>}
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
      {bottom === "migration" && <MigrationPanel />}
    </div>
  );
}

function MigrationPanel() {
  const { migrationIssues: issues, doc } = useStore();
  const pending = issues.filter((issue) => issue.status !== "converted");
  return <div className="migration-panel" data-testid="migration-panel">
    <div className="pg-summary"><strong>JRXML migration</strong><span className="muted">{pending.length} items need review; {doc.migration?.summary.converted ?? issues.filter((issue) => issue.status === "converted").length} converted</span></div>
    {pending.map((issue, index) => <div className="migration-row" key={index}>
      <button className="problem-main" data-testid="migration-issue" onClick={() => {
        const state = useStore.getState();
        if (issue.targetId) {
          const band = state.doc.sections?.findIndex((section: { id?: string }) => section.id === issue.targetId) ?? -1;
          if (band >= 0) state.set({ selectedBand: band, selection: [], mode: "design" });
          else state.select([issue.targetId]);
          state.set({ mode: "design" });
          requestAnimationFrame(() => document.querySelector(`[data-cid="${issue.targetId}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
        }
      }}>
        <span className={`migration-status ${issue.status}`}>{issue.status}</span>
        <span>{issue.feature}: {issue.message}</span>
        <span className="muted small">line {issue.line}</span>
      </button>
      {issue.original && <details><summary>Original expression</summary><code>{issue.original}</code></details>}
    </div>)}
  </div>;
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
  const [openPage, setOpenPage] = useState<number | null>(null);
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
      {pag.pages.length <= 1 && <div className="muted pad">Everything fits on one page.</div>}
      {pag.pages.slice(1).map((page) => {
        const causes = pag.decisions.filter((decision) => decision.page === page.number && decision.kind !== "group-header-repeated");
        const primary = causes[0] ?? pag.decisions.find((decision) => decision.page === page.number);
        return <div key={page.number} className="decision-row">
          <button className={`decision ${primary?.kind ?? "flow-break"}`} data-testid="pagination-decision" aria-expanded={openPage === page.number} onClick={() => {
            setOpenPage(openPage === page.number ? null : page.number);
            const st = useStore.getState();
            if (primary?.componentId) st.select([primary.componentId]);
            st.set({ mode: "design" });
            requestAnimationFrame(() => document.querySelector(`[data-page="${page.number - 1}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
          }}>
            <span className="dk">p.{page.number}</span>
            <span className="dm"><strong>{primary?.kind.replace(/-/g, " ") ?? "Page start"}</strong> {primary?.message ?? "Inspect this page's start."}</span>
            <span className="decision-chevron" aria-hidden="true">{openPage === page.number ? "▾" : "▸"}</span>
          </button>
          {openPage === page.number && <div className="pagination-page-details"><PageBreakDetails paginated={pag} pageNumber={page.number} /></div>}
        </div>;
      })}
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
export function Modal({ children, onClose, wide, label = "Report dialog", closable = true }: { children: React.ReactNode; onClose: () => void; wide?: boolean; label?: string; closable?: boolean }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const modal = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (modal.current?.querySelector<HTMLElement>("[data-default-focus]") ?? closeButton.current)?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (closable) onClose();
      } else if (e.key === "Tab") {
        const focusable = Array.from(modal.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? []);
        if (!focusable.length) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [onClose, closable]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && closable && onClose()}>
      <div ref={modal} className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={label}>
        <button ref={closeButton} className="modal-close" type="button" aria-label="Close dialog" title="Close (Esc)" disabled={!closable} onClick={onClose}>×</button>
        {children}
      </div>
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

function StarterChoices() {
  const set = useStore((s) => s.set);
  const [q, setQ] = useState("");
  const [size, setSize] = useState(0);
  const groups = ["Documents", "Healthcare", "Printing", "Data"] as const;
  const create = (doc: any) => {
    requestReplaceReport(() => {
      useStore.getState().loadDoc(doc);
      set({ dialog: null, mode: "design" });
    });
  };
  const createBlank = () => {
    const selected = DOC_SIZES[size]!;
    const blank = blankReport();
    create({ ...blank, page: { ...blank.page, ...selected.page }, ...(selected.print ? { print: selected.print } : {}) });
  };
  return <>
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
        <button className="starter blank" data-testid="starter-jrxml" onClick={() => set({ dialog: "import-jrxml" })}>
          <strong>Import JRXML</strong>
          <span>Open a JasperReports source file and review conversion issues</span>
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
    </>;
}

export function HomeScreen() {
  const { doc, meta } = useStore();
  const set = useStore((s) => s.set);
  const interfaceTheme = useStore((s) => s.interfaceTheme);
  const setInterfaceTheme = useStore((s) => s.setInterfaceTheme);
  const hasDraft = Boolean(loadDraft()?.doc);
  const isPublicDemo = window.location.hostname === "open-reports-demo.onrender.com";
  const tryExample = (key: string) => {
    const example = STARTERS.find((item) => item.key === key);
    if (!example) return;
    requestReplaceReport(() => {
      useStore.getState().loadDoc({ ...structuredClone(example.doc), id: `${example.doc.id}-${Date.now().toString(36).slice(-4)}` });
      set({ mode: "design", demoHint: "edit" });
    });
  };
  return <main className="home-screen" data-testid="home-screen">
    <header className="home-header">
      <div className="home-brand"><span className="logo" aria-hidden="true">▤</span><strong>Open Reports</strong></div>
      <div className="home-header-actions">
        <label className="home-appearance">Appearance <select aria-label="Interface appearance" data-testid="home-appearance" value={interfaceTheme} onChange={(event) => setInterfaceTheme(event.target.value as typeof interfaceTheme)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></label>
        {hasDraft && <button className="btn" data-testid="home-continue" onClick={() => set({ home: false })}>Continue editing →</button>}
        <a className="btn" href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">Give feedback ↗</a>
      </div>
    </header>
    <div className="home-content">
      <p className="home-eyebrow">REPORT DESIGNER</p>
      <h1>Start with a working report</h1>
      <p className="home-intro">Choose an example, change it in the designer, then run Preview to see the printable result.</p>
      {isPublicDemo && <p className="home-demo-note">Public demo: saved reports are shared and may reset when this service restarts. Export the report definition to keep your own copy.</p>}
      <div className="home-featured" aria-label="Quick start examples">
        <div className="home-featured-copy">
          <span className="home-featured-label">RECOMMENDED FIRST TRY</span>
          <h2>Explore a complete invoice</h2>
          <p>See real layout, sample data, and PDF preview in a report you can edit.</p>
          <button className="btn primary" data-testid="home-try-invoice" onClick={() => tryExample("invoice")}>Try invoice example →</button>
        </div>
        <div className="home-steps" aria-label="How the demo works">
          <span><b>1</b> Open an example</span>
          <span><b>2</b> Edit text, data, or layout</span>
          <span><b>3</b> Run preview and export</span>
        </div>
      </div>
      <div className="home-section-head"><div><h2>Your workspace</h2><p>Pick up where you left off or open a saved report.</p></div></div>
      <div className="home-workspace-actions">
        {hasDraft && <button className="home-workspace-card" onClick={() => set({ home: false })}>
          <strong>Continue {doc.name || "Untitled report"}</strong><span>{meta.id ? "Saved report" : "Local draft"} · Return to the designer →</span>
        </button>}
        <button className="home-workspace-card" data-testid="home-open" onClick={() => set({ dialog: "open" })}><strong>Open a saved report</strong><span>Browse reports saved on this server →</span></button>
      </div>
      <div className="home-section-head"><div><h2>Create something new</h2><p>Start blank, use your data, or browse the examples below.</p></div></div>
      <StarterChoices />
    </div>
  </main>;
}

function NewDialog() {
  const set = useStore((s) => s.set);
  return <Modal wide label="New report" onClose={() => set({ dialog: null })}>
    <h2>New report</h2>
    <StarterChoices />
  </Modal>;
}

function JrxmlImportDialog() {
  const set = useStore((s) => s.set);
  const [scope, setScope] = useState<"single" | "folder">("single");
  const [folderBusy, setFolderBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [filename, setFilename] = useState("");
  const [error, setError] = useState("");
  const read = async (file?: File) => {
    setResult(null); setError("");
    if (!file) return;
    setFilename(file.name);
    if (!file.name.toLowerCase().endsWith(".jrxml")) { setError("Choose a .jrxml source file."); return; }
    if (file.size > 10_000_000) { setError("JRXML exceeds the 10 MB import limit."); return; }
    try { setResult(importJrxml(await file.text(), { sourceName: file.name })); }
    catch (cause) { setError((cause as Error).message); }
  };
  const apply = () => {
    if (!result?.report) return;
    requestReplaceReport(() => {
      const state = useStore.getState();
      state.loadDoc(result.report!);
      state.set({ migrationIssues: result.issues, bottom: "migration", dialog: null, mode: "design" });
      state.toast("JRXML draft imported. Review migration issues before using the output.");
    });
  };
  const pending = result?.issues.filter((issue) => issue.status !== "converted") ?? [];
  return <Modal wide label="Import JRXML" closable={!folderBusy} onClose={() => { if (!folderBusy) set({ dialog: null }); }}>
    <h2>Import JasperReports source</h2>
    <p className="muted">Import one JRXML file or a folder. Converted reports stay as drafts; data connections and unsupported expressions need review.</p>
    <div className="tabs" aria-label="JRXML import scope"><button aria-pressed={scope === "single"} className={scope === "single" ? "active" : ""} disabled={folderBusy} onClick={() => setScope("single")}>One file</button><button aria-pressed={scope === "folder"} className={scope === "folder" ? "active" : ""} disabled={folderBusy} onClick={() => setScope("folder")}>Folder</button></div>
    {scope === "single" ? <>
    <input type="file" accept=".jrxml,application/xml,text/xml" data-testid="jrxml-file" aria-label="JRXML file" onChange={(event) => void read(event.target.files?.[0])} />
    {error && <p className="err" role="alert">{error}</p>}
    {result && <div className="jrxml-review" data-testid="jrxml-review">
      <p><strong>{filename}</strong> · {result.format ?? "invalid"} · {result.summary.converted} converted · {result.summary["needs-review"]} need review · {result.summary.unsupported} unsupported</p>
      <div className="jrxml-review-list">{pending.slice(0, 100).map((issue, index) => <div key={index} className="migration-row">
        <span className={`migration-status ${issue.status}`}>{issue.status}</span>
        <span>{issue.feature}: {issue.message}</span>
        <span className="muted small">line {issue.line}</span>
      </div>)}</div>
      {pending.length > 100 && <p className="muted">Showing the first 100 issues here. All issues will be available after import.</p>}
    </div>}
    <div className="dialog-actions"><button className="btn" onClick={() => set({ dialog: null })}>Cancel</button><button className="btn primary" data-testid="apply-jrxml" disabled={!result?.report} onClick={apply}>Open editable draft</button></div>
    </> : <JrxmlFolderImport onBusyChange={setFolderBusy} />}
  </Modal>;
}

const SAMPLE_JSON = `{
  "patient": { "name": "Alex Morgan", "mrn": "MRN-1042", "dob": "1994-05-12", "gender": "Male" },
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
              requestReplaceReport(() => {
                useStore.getState().loadDoc(doc);
                useStore.getState().set({ dialog: null, mode: "design", leftTab: "data" });
              });
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
  const home = useStore((s) => s.home);
  const [items, setItems] = useState<TemplateRecord[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.listTemplates().then(setItems).catch((e) => setError((e as Error).message));
  }, []);
  return (
    <Modal label="Open a saved report" onClose={() => set({ dialog: null })}>
      <h2>Open a saved report</h2>
      <p className="muted">Select a report to edit, or close this dialog to return.</p>
      {error && <div className="field-error" role="alert">{error}</div>}
      {!items && !error && <p className="muted" role="status">Loading saved reports…</p>}
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
      <div className="dialog-actions">
        <button className="btn" onClick={() => set({ dialog: null })}>Close</button>
        {!home && <button className="btn" onClick={() => set({ dialog: null, home: true })}>Go Home</button>}
        <span className="spacer" />
        <button className="btn" onClick={() => set({ dialog: "new" })}>New report</button>
      </div>
    </Modal>
  );
}

function SettingsDialog() {
  const set = useStore((s) => s.set);
  const interfaceTheme = useStore((s) => s.interfaceTheme);
  const setInterfaceTheme = useStore((s) => s.setInterfaceTheme);
  const [key, setKey] = useState(settings.apiKey);
  const [base, setBase] = useState(settings.apiBase);
  const [health, setHealth] = useState("");
  return (
    <Modal onClose={() => set({ dialog: null })}>
      <h2>Settings</h2>
      <label className="field wide"><span className="field-label">Interface appearance</span><select aria-label="Interface appearance" data-testid="settings-appearance" value={interfaceTheme} onChange={(event) => setInterfaceTheme(event.target.value as typeof interfaceTheme)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></label>
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
      { id: "publish", label: "Review and publish version", run: () => s().set({ dialog: "publish" }) },
      { id: "new", label: "New report...", run: () => s().set({ dialog: "new" }) },
      { id: "open", label: "Open report...", run: () => s().set({ dialog: "open" }) },
      { id: "dataset", label: "Create dataset", run: () => s().set({ dialog: "dataset", editingDataset: null }) },
      { id: "theme", label: "Edit theme: colours, fonts, sizes, spacing and text styles", run: () => s().set({ dialog: "theme" }) },
      { id: "json", label: "Paste sample JSON to generate a report", run: () => s().set({ dialog: "generate" }) },
      ...(s().mode === "design" ? [] : [{ id: "design", label: "Switch to Design", run: () => s().set({ mode: "design" }) }]),
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
      ...PALETTE_ITEMS.map((i) => ({ id: `add-${i.label}`, label: `Add ${i.label.toLowerCase()}`, run: () => insertFromPalette(i) })),
      ...((useStore.getState().doc.sections ?? []) as any[]).flatMap((sec) => (sec.children ?? []).map((c: any) => ({ id: `find-${c.id}`, label: `Find component: ${c.id}`, run: () => s().select([c.id]) }))),
    ];
    // Keyboard commands come first and carry their shortcut, so the palette teaches the keys.
    const keyed: Command[] = COMMANDS.filter((command) => command.palette).map((command) => ({ id: command.id, label: command.label, hint: shortcutLabel(command.id), run: () => void command.run(s()) }));
    return [...keyed, ...cmds];
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
  if (dialog === "replace") return <Modal label="Unsaved changes" onClose={() => resolveReplaceReport(false)}><h2>Replace this report?</h2><p className="muted">Your changes to <strong>{useStore.getState().doc.name || "Untitled report"}</strong> are saved only in this local draft. Opening another report will replace it.</p><div className="dialog-actions"><button className="btn" data-testid="replace-cancel" data-default-focus onClick={() => resolveReplaceReport(false)}>Keep editing</button><span className="spacer" /><button className="btn danger" data-testid="replace-confirm" onClick={() => resolveReplaceReport(true)}>Replace report</button></div></Modal>;
  if (dialog === "new") return <NewDialog />;
  if (dialog === "import-jrxml") return <JrxmlImportDialog />;
  if (dialog === "open") return <OpenDialog />;
  if (dialog === "settings") return <SettingsDialog />;
  if (dialog === "generate") return <GenerateDialog />;
  if (dialog === "palette") return <CommandPalette />;
  if (dialog === "shortcuts") return <ShortcutSheet />;
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
  if (dialog === "theme")
    return (
      <Modal wide onClose={() => set({ dialog: null })}>
        <ThemeDialogBody />
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
          {t.action && <button type="button" className="toast-action" data-testid="toast-action" onClick={() => { t.action!.run(); useStore.setState({ toasts: useStore.getState().toasts.filter((x) => x.id !== t.id) }); }}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
}

export { ApiError };
