import React, { useEffect } from "react";
import { useStore, loadDraft } from "./store";
import { Canvas } from "./components/Canvas";
import { LeftPanel } from "./components/LeftPanel";
import { Properties } from "./components/Properties";
import { CodeEditor } from "./components/CodeEditor";
import { Preview } from "./components/Preview";
import { BottomBar, BottomPanel, Dialogs, Toasts, Toolbar } from "./components/Shell";
import { DataMode } from "./components/DataMode";
import { AiBar } from "./components/AiBar";
import { TableDesigner } from "./components/TableDesigner";
import { BandBar } from "./components/BandLayer";
import * as ops from "./model/ops";

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

export default function App() {
  const { mode, leftOpen, rightOpen, split, tableEditId } = useStore();
  const set = useStore((s) => s.set);
  const showsLeft = mode === "design" && leftOpen;
  const showsRight = (mode === "design" || mode === "code") && rightOpen;

  useEffect(() => {
    const draft = loadDraft();
    const s = useStore.getState();
    if (draft?.doc) {
      s.loadDoc(draft.doc, {}, draft.sample ?? {});
      s.toast("Restored your last draft");
    } else {
      s.refresh();
      s.set({ dialog: "new" });
    }
    s.loadCapabilities();
    s.loadBlocks();
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
      <Dialogs />
      <Toasts />
    </div>
  );
}
