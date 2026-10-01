import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import * as ops from "../model/ops";

/** Right-click menu for the canvas and the layers tree. */
export function ContextMenu() {
  const menu = useStore((s) => s.contextMenu);
  const { selection, doc } = useStore();
  const st = useStore.getState;
  const set = useStore((s) => s.set);
  useEffect(() => {
    if (!menu) return;
    const close = () => set({ contextMenu: null });
    window.addEventListener("mousedown", close);
    window.addEventListener("wheel", close, { passive: true });
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("wheel", close);
    };
  }, [menu, set]);
  if (!menu) return null;
  const id = menu.id ?? selection[0];
  const comp = id ? ops.find(doc, id)?.comp : undefined;
  const isContainer = !!comp && Array.isArray(comp.children);
  const act = (fn: () => void) => () => {
    set({ contextMenu: null });
    fn();
  };
  const item = (label: string, fn: () => void, opts: { hint?: string; disabled?: boolean; danger?: boolean; testid?: string } = {}) => (
    <button role="menuitem" key={label} disabled={opts.disabled} className={opts.danger ? "danger" : ""} data-testid={opts.testid} onMouseDown={(e) => e.stopPropagation()} onClick={act(fn)}>
      <span>{label}</span>
      {opts.hint && <kbd>{opts.hint}</kbd>}
    </button>
  );
  return (
    <div className="ctx-menu" role="menu" style={{ left: menu.x, top: menu.y }} data-testid="context-menu" onContextMenu={(e) => e.preventDefault()}>
      {comp && (
        <>
          {item("Copy", () => st().copy(), { hint: "Ctrl+C" })}
          {item("Paste", () => st().paste(), { hint: "Ctrl+V", disabled: !st().clipboard.length })}
          {item("Duplicate", () => st().duplicateSelected(), { hint: "Ctrl+D" })}
          <hr />
          {item("Group", () => st().groupSelected(), { hint: "Ctrl+G", disabled: selection.length < 2, testid: "ctx-group" })}
          {item("Ungroup", () => st().ungroupSelected(), { hint: "Ctrl+Shift+G", disabled: !isContainer })}
          {item(comp.locked ? "Unlock" : "Lock", () => st().toggleLock(id), { hint: "Ctrl+L", testid: "ctx-lock" })}
          {item(comp.hidden ? "Show" : "Hide", () => st().toggleHide(id), { hint: "Ctrl+Shift+H", testid: "ctx-hide" })}
          {item("Rename", () => st().set({ leftTab: "layers", renaming: id ?? null, leftOpen: true }), { hint: "F2" })}
          <hr />
          {item("Move up", () => st().setDoc(ops.shift(st().doc, id!, -1)))}
          {item("Move down", () => st().setDoc(ops.shift(st().doc, id!, 1)))}
          {item("Save as reusable component…", () => st().set({ dialog: "block" }), { testid: "ctx-save-block" })}
          {item("Open in code", () => st().openCode(id!))}
          <hr />
          {item("Delete", () => st().removeSelected(), { hint: "Del", danger: true })}
        </>
      )}
      {!comp && (
        <>
          {item("Paste", () => st().paste(), { hint: "Ctrl+V", disabled: !st().clipboard.length })}
          {item("Select all", () => st().select([...ops.walkAll(st().doc)].map((l) => l.comp.id)), { hint: "Ctrl+A" })}
        </>
      )}
    </div>
  );
}

/** Floating text formatting bar shown above a single selected text element. */
export function FloatingToolbar({ id, left, top }: { id: string; left: number; top: number }) {
  const { doc } = useStore();
  const comp = ops.find(doc, id)?.comp;
  const st = useStore.getState;
  if (!comp || !["text", "richText", "field"].includes(comp.type)) return null;
  const style = (comp.style ?? {}) as Record<string, any>;
  const size = Number(style.fontSize) || 10;
  const btn = (label: React.ReactNode, title: string, on: boolean, fn: () => void, tid: string) => (
    <button className={`ft-btn ${on ? "on" : ""}`} title={title} aria-label={title} aria-pressed={on} data-testid={tid} onMouseDown={(e) => e.preventDefault()} onClick={fn}>
      {label}
    </button>
  );
  return (
    <div className="float-toolbar" style={{ left, top }} data-testid="float-toolbar" onPointerDown={(e) => e.stopPropagation()}>
      {btn(<b>B</b>, "Quick bold", style.fontWeight === "bold", () => st().patchStyle(id, { fontWeight: style.fontWeight === "bold" ? undefined : "bold" }, ""), "ft-bold")}
      {btn(<i>I</i>, "Quick italic", !!style.italic, () => st().patchStyle(id, { italic: style.italic ? undefined : true }, ""), "ft-italic")}
      <span className="ft-sep" />
      {(["left", "center", "right"] as const).map((a) => <React.Fragment key={a}>{btn(a === "left" ? "⇤" : a === "center" ? "↔" : "⇥", `Align ${a}`, (style.align ?? "left") === a, () => st().patchStyle(id, { align: a }, ""), `ft-${a}`)}</React.Fragment>)}
      <span className="ft-sep" />
      {btn("A−", "Smaller", false, () => st().patchStyle(id, { fontSize: Math.max(5, size - 1) }, "ft-size"), "ft-smaller")}
      <span className="ft-size">{size}</span>
      {btn("A+", "Larger", false, () => st().patchStyle(id, { fontSize: size + 1 }, "ft-size"), "ft-larger")}
      <span className="ft-sep" />
      <input type="color" aria-label="Text colour" className="ft-color" value={/^#[0-9a-f]{6}$/i.test(style.color ?? "") ? style.color : "#000000"} onChange={(e) => st().patchStyle(id, { color: e.target.value }, "ft-color")} />
    </div>
  );
}

/** In-place editor for static text; bound text is edited from the properties panel instead. */
export function InlineEditor({ id, box, k }: { id: string; box: { x: number; y: number; width: number; height: number }; k: number }) {
  const comp = ops.find(useStore.getState().doc, id)?.comp;
  const [text, setText] = useState(String(comp?.value ?? ""));
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  if (!comp) return null;
  const commit = () => {
    if (done.current) return;
    done.current = true;
    const st = useStore.getState();
    if (text !== String(comp.value ?? "")) st.patch(id, { value: text }, `text:${id}`);
    st.set({ editingText: null });
  };
  const style = (comp.style ?? {}) as Record<string, any>;
  return (
    <textarea
      ref={ref}
      className="inline-editor"
      data-testid="inline-editor"
      aria-label="Edit text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          done.current = true;
          useStore.getState().set({ editingText: null });
        } else if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          commit();
        }
      }}
      style={{
        left: box.x * k,
        top: box.y * k,
        width: Math.max(box.width, 40) * k,
        minHeight: Math.max(box.height, 14) * k,
        fontSize: (Number(style.fontSize) || 10) * k,
        fontWeight: style.fontWeight === "bold" ? 700 : 400,
        textAlign: style.align ?? "left",
      }}
    />
  );
}

export function SaveBlockDialogBody() {
  const [name, setName] = useState("");
  const set = useStore((s) => s.set);
  return (
    <>
      <h2>Save as reusable component</h2>
      <p className="muted">Saved components appear under “My Components” in the Components panel and can be inserted into any report.</p>
      <label className="field wide">
        <span className="field-label">Name</span>
        <input autoFocus data-testid="block-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hospital letterhead" />
      </label>
      <div className="dialog-actions">
        <button className="btn" onClick={() => set({ dialog: null })}>Cancel</button>
        <span className="spacer" />
        <button
          className="btn primary"
          data-testid="block-save"
          disabled={!name.trim()}
          onClick={async () => {
            await useStore.getState().saveBlock(name.trim());
            set({ dialog: null });
          }}
        >
          Save component
        </button>
      </div>
    </>
  );
}
