import React, { useEffect } from "react";
import { useStore, loadDraft } from "./store";
import { Canvas } from "./components/Canvas";
import { LeftPanel } from "./components/LeftPanel";
import { Properties } from "./components/Properties";
import { CodeEditor } from "./components/CodeEditor";
import { Preview } from "./components/Preview";
import { BottomBar, BottomPanel, Dialogs, HomeScreen, Toasts, Toolbar } from "./components/Shell";
import { DataMode } from "./components/DataMode";
import { AiBar } from "./components/AiBar";
import { TableDesigner } from "./components/TableDesigner";
import { BandBar } from "./components/BandLayer";
import { arrayRefs, datasetFields, scalarFields } from "./lib/fields";
import { titleCase } from "./lib/lowcode";
import * as ops from "./model/ops";

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

function GettingStartedHint() {
  const { doc, sample, selection, demoHint, mode } = useStore();
  const set = useStore((s) => s.set);
  if (mode !== "design") return null;
  const selected = selection.length === 1 ? ops.find(doc, selection[0]!)?.comp : null;
  const table = selected?.type === "table" && !selected.dataset ? selected : null;
  const refs = table ? arrayRefs(doc, sample) : [];
  const blank = (doc.sections?.length ?? 0) === 1 && !doc.sections?.[0]?.children?.length && !doc.groups?.length;
  if (!demoHint && !blank && !table) return null;
  const useDataset = (ref: string) => {
    if (!table) return;
    const fields = scalarFields(datasetFields(doc, sample, ref));
    useStore.getState().patch(table.id, {
      dataset: ref,
      columns: fields.slice(0, 10).map((field) => ({
        id: field.name,
        header: titleCase(field.name),
        binding: `row.${field.path}`,
        format: field.kind === "date" ? "date:dd MMM yyyy" : field.kind === "number" && /amount|price|total|rate|cost|balance/i.test(field.name) ? "currency" : undefined,
        align: field.kind === "number" ? "right" : undefined,
      })),
      headerRows: undefined,
      cellSpans: undefined,
    });
  };
  return <div className="getting-started" role="status" data-testid="getting-started">
    <div><strong>{table ? "Connect table data" : demoHint === "edit" ? "Try one edit" : demoHint === "preview" ? "See the printable result" : "Start on the page"}</strong><span>{table ? refs.length ? "Choose data to fill this table and create its columns." : "Create a dataset to fill this table." : demoHint === "edit" ? "Click text on the invoice, then change it in the Content panel." : demoHint === "preview" ? "Your change is on the canvas. Check the PDF it produces." : "Add text from Components, or drag an item onto the page."}</span></div>
    {table ? refs.length ? <select aria-label="Table data" data-testid="canvas-table-data" defaultValue="" onChange={(event) => useDataset(event.target.value)}><option value="" disabled>Choose data…</option>{refs.map((ref) => <option key={ref} value={ref}>{ref}</option>)}</select> : <button className="btn primary" data-testid="canvas-create-dataset" onClick={() => set({ dialog: "dataset", editingDataset: null })}>Create dataset</button> : demoHint === "preview" ? <button className="btn primary" onClick={() => set({ mode: "preview", demoHint: null })}>Preview PDF →</button> : blank ? <button className="btn primary" onClick={() => useStore.getState().addComponent("text")}>Add text</button> : <button className="mini" onClick={() => set({ demoHint: null })}>Dismiss</button>}
  </div>;
}

export default function App() {
  const { mode, home, leftOpen, rightOpen, split, tableEditId } = useStore();
  const set = useStore((s) => s.set);
  const showsLeft = mode === "design" && leftOpen;
  const showsRight = (mode === "design" || mode === "code") && rightOpen;

  useEffect(() => {
    const draft = loadDraft();
    const s = useStore.getState();
    if (draft?.doc) {
      s.loadDoc(draft.doc, { dirty: draft.dirty ?? false }, draft.sample ?? {});
    } else {
      s.refresh();
    }
    s.set({ home: true });
    s.loadCapabilities();
    s.loadBlocks();
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      const theme = useStore.getState().interfaceTheme;
      if (theme === "system") useStore.getState().setInterfaceTheme(theme);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const laptop = window.matchMedia("(max-width: 1200px)");
    const overlay = window.matchMedia("(max-width: 980px)");
    const collapseForWidth = () => {
      if (!laptop.matches) return;
      useStore.getState().set({ rightOpen: false, bottom: null, ...(overlay.matches ? { leftOpen: false } : {}) });
    };
    collapseForWidth();
    laptop.addEventListener("change", collapseForWidth);
    overlay.addEventListener("change", collapseForWidth);
    return () => {
      laptop.removeEventListener("change", collapseForWidth);
      overlay.removeEventListener("change", collapseForWidth);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        s.set({ dialog: s.dialog === "palette" ? null : "palette" });
        return;
      }
      if (mod && e.key.toLowerCase() === "j") {
        e.preventDefault();
        s.set({ aiOpen: !s.aiOpen });
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        s.save();
        return;
      }
      if (e.key === "Escape" && s.home && !s.dialog) {
        e.preventDefault();
        s.set({ home: false });
        return;
      }
      if (isTyping(e.target) || s.dialog) return;
      if (s.mode !== "design") return;
      if (e.key === "Escape" && s.tableEditId) {
        s.set({ tableEditId: null });
        return;
      }
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        e.preventDefault();
        e.shiftKey ? s.redo() : s.undo();
      } else if (mod && key === "y") {
        e.preventDefault();
        s.redo();
      } else if (mod && key === "c") {
        s.copy();
      } else if (mod && key === "v") {
        e.preventDefault();
        s.paste();
      } else if (mod && key === "d") {
        e.preventDefault();
        s.duplicateSelected();
      } else if (mod && key === "a") {
        e.preventDefault();
        s.select([...ops.walkAll(s.doc)].map((l) => l.comp.id));
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        s.removeSelected();
      } else if (mod && key === "g") {
        e.preventDefault();
        e.shiftKey ? s.ungroupSelected() : s.groupSelected();
      } else if (mod && key === "l") {
        e.preventDefault();
        s.toggleLock();
      } else if (mod && e.shiftKey && key === "h") {
        e.preventDefault();
        s.toggleHide();
      } else if (e.key === "F2" && s.selection[0]) {
        s.set({ renaming: s.selection[0], leftTab: "layers", leftOpen: true });
      } else if (e.key === "Escape") {
        s.set({ contextMenu: null, editingText: null, renaming: null });
        s.select([]);
      } else if (e.key.startsWith("Arrow") && s.selection.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        s.nudge(e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0, e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app" data-testid="app">
      {home ? <HomeScreen /> : <>
      <Toolbar />
      {mode === "design" && tableEditId ? <TableDesigner id={tableEditId} /> : <div className={`main ${showsLeft ? "" : "no-left"} ${showsRight ? "" : "no-right"}`}>
        {showsLeft && <LeftPanel />}
        <section className="center" aria-label="Workspace">
          {mode === "design" && <button className="edge left" aria-label={leftOpen ? "Hide insert panel" : "Show insert panel"} title="Toggle insert panel" onClick={() => set({ leftOpen: !leftOpen, focusCanvas: false, focusRestore: null })}>
            {leftOpen ? "‹" : "›"}
          </button>}
          {(mode === "design" || mode === "code") && <button className="edge right" aria-label={rightOpen ? "Hide properties" : "Show properties"} title="Toggle properties" onClick={() => set({ rightOpen: !rightOpen, focusCanvas: false, focusRestore: null })}>
            {rightOpen ? "›" : "‹"}
          </button>}
          {mode === "design" && <BandBar />}
          {mode === "design" && <GettingStartedHint />}
          {mode === "design" && !split && <Canvas />}
          {mode === "design" && split && (
            <div className="split">
              <Canvas />
              <CodeEditor />
            </div>
          )}
          {mode === "data" && <DataMode />}
          {mode === "code" && <CodeEditor />}
          {mode === "preview" && <Preview />}
        </section>
        {showsRight && <Properties />}
      </div>}
      <BottomPanel />
      <BottomBar />
      <AiBar />
      </>}
      <Dialogs />
      <Toasts />
    </div>
  );
}
