import React, { useEffect } from "react";
import { useStore, loadDraft } from "./store";
import { Canvas } from "./components/Canvas";
import { LeftPanel } from "./components/LeftPanel";
import { Properties } from "./components/Properties";
import { CodeEditor } from "./components/CodeEditor";
import { Preview } from "./components/Preview";
import { BottomBar, BottomPanel, Dialogs, Toasts, Toolbar } from "./components/Shell";
import { DataMode } from "./components/DataMode";
import * as ops from "./model/ops";

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

export default function App() {
  const { mode, leftOpen, rightOpen, split } = useStore();
  const set = useStore((s) => s.set);

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
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        s.set({ dialog: s.dialog === "palette" ? null : "palette" });
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        s.save();
        return;
      }
      if (isTyping(e.target) || s.dialog) return;
      if (s.mode !== "design") return;
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
        s.set({ editingText: s.selection[0], leftTab: "layers" });
      } else if (e.key === "Escape") {
        s.set({ contextMenu: null, editingText: null });
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
      <div className={`main ${leftOpen ? "" : "no-left"} ${rightOpen ? "" : "no-right"}`}>
        {leftOpen && mode === "design" && <LeftPanel />}
        <section className="center" aria-label="Workspace">
          <button className="edge left" aria-label={leftOpen ? "Hide insert panel" : "Show insert panel"} title="Toggle insert panel" onClick={() => set({ leftOpen: !leftOpen })}>
            {leftOpen ? "‹" : "›"}
          </button>
          <button className="edge right" aria-label={rightOpen ? "Hide properties" : "Show properties"} title="Toggle properties" onClick={() => set({ rightOpen: !rightOpen })}>
            {rightOpen ? "›" : "‹"}
          </button>
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
        {rightOpen && (mode === "design" || mode === "code") && <Properties />}
      </div>
      <BottomPanel />
      <BottomBar />
      <Dialogs />
      <Toasts />
    </div>
  );
}
