import type { PositionedNode } from "@reporting/layout";
import { useStore } from "../store";
import * as ops from "../model/ops";
import { formatCombo, isMacPlatform, matchesCombo, type Combo } from "./shortcuts";
import { childSelection, levelSelection, parentSelection, reorder, siblingSelection, type ReorderMode } from "./selection-nav";
import { nextZoomStep } from "./viewport";
import { zoomCanvas, zoomToFit, zoomToSelection } from "./zoom";

type Store = ReturnType<typeof useStore.getState>;

/**
 * Where a shortcut works:
 * - global: everywhere, even while typing or with a dialog open
 * - canvas: in Design mode when no dialog is open and focus is not in a text field
 * - canvas-focus: like canvas, and focus is not on a button or menu (so Tab still moves focus through the interface)
 */
export type CommandScope = "global" | "canvas" | "canvas-focus";
export type CommandGroup = "General" | "View" | "Select" | "Edit" | "Arrange";

export interface CanvasCommand {
  id: string;
  label: string;
  group: CommandGroup;
  combos: Combo[];
  scope: CommandScope;
  /** Listed in the command palette (keys that only make sense with a selection still appear in the cheat sheet). */
  palette?: boolean;
  /** Keep the browser's default action as well, e.g. native copy. */
  keepDefault?: boolean;
  /** Return false to pass the key on to the next matching command or to the browser. */
  run(store: Store, event?: KeyboardEvent): boolean | void;
}

const TYPING = "input, textarea, select, [contenteditable=''], [contenteditable='true'], .cm-editor";
const CONTROLS = "button, a[href], [role='menuitem'], [role='tab'], [role='option'], [role='treeitem'], summary";
/** Composite widgets that use arrows, Delete and Escape themselves. */
const WIDGETS = "[role='menu'], [role='menubar'], [role='listbox'], [role='tablist'], [role='tree'], [role='grid'], [role='radiogroup'], [role='dialog']";

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || Boolean(target.closest(TYPING)));
}

function* flatNodes(nodes: PositionedNode[]): Generator<PositionedNode> {
  for (const node of nodes) {
    yield node;
    if (node.children) yield* flatNodes(node.children);
  }
}

function renderedBox(store: Store, id: string): PositionedNode["box"] | undefined {
  for (const page of store.engine.paginated?.pages ?? []) {
    for (const node of flatNodes([...page.background, ...page.header, ...page.content, ...page.footer])) {
      if ((node.component as { id?: string }).id === id) return node.box;
    }
  }
  return undefined;
}

/** Arrow keys move by 1 pt, Shift by 10 pt, as in Figma; fine control matters more than the grid in print layouts. */
function nudgeStep(_store: Store, large: boolean): number {
  return large ? 10 : 1;
}

function resizeSelected(store: Store, dw: number, dh: number): boolean {
  let doc = store.doc;
  for (const id of store.selection) {
    const comp = ops.find(doc, id)?.comp;
    if (!comp || comp.locked) continue;
    const box = renderedBox(store, id);
    const patch: Record<string, number> = {};
    const width = typeof comp.width === "number" ? comp.width : box?.width;
    const height = typeof comp.height === "number" ? comp.height : box?.height;
    if (dw && width !== undefined) patch.width = Math.max(1, Math.round((width + dw) * 10) / 10);
    if (dh && height !== undefined) patch.height = Math.max(1, Math.round((height + dh) * 10) / 10);
    if (Object.keys(patch).length) doc = ops.update(doc, id, patch);
  }
  if (doc === store.doc) return false;
  store.setDoc(doc, { coalesce: "resize-keys" });
  return true;
}

function arrange(store: Store, next: ops.Doc, reason: string): void {
  if (next === store.doc) store.toast(reason, "info");
  else store.setDoc(next);
}

const ALIGN_REASON = "Select two or more free-positioned elements in the same container to align them.";
const DISTRIBUTE_REASON = "Select three or more free-positioned elements in the same container to space them evenly.";

function alignCommand(mode: ops.AlignMode, code: string, label: string): CanvasCommand {
  return { id: `align-${mode}`, label, group: "Arrange", combos: [{ code, alt: true }], scope: "canvas", palette: true, run: (s) => arrange(s, ops.align(s.doc, s.selection, mode), ALIGN_REASON) };
}

function reorderCommand(mode: ReorderMode, label: string, combo: Combo): CanvasCommand {
  return {
    id: `order-${mode}`, label, group: "Arrange", combos: [combo], scope: "canvas", palette: true,
    run: (s) => {
      if (!s.selection.length) return false;
      const next = reorder(s.doc, s.selection, mode);
      if (next !== s.doc) s.setDoc(next, { coalesce: `order-${mode}`, keepSelection: true });
    },
  };
}

function arrow(key: string, dx: number, dy: number): CanvasCommand {
  return {
    id: `nudge-${key}`, label: `Move ${key.replace("Arrow", "").toLowerCase()} (Shift: larger step)`, group: "Edit", combos: [{ key, shift: "any" }], scope: "canvas",
    run: (s, e) => {
      if (!s.selection.length) return false;
      const step = nudgeStep(s, Boolean(e?.shiftKey));
      s.nudge(dx * step, dy * step);
    },
  };
}

function resizeArrow(key: string, dw: number, dh: number, label: string): CanvasCommand {
  return {
    id: `resize-${key}`, label, group: "Edit", combos: [{ key, mod: true, shift: "any" }], scope: "canvas",
    run: (s, e) => {
      if (!s.selection.length) return false;
      const step = nudgeStep(s, Boolean(e?.shiftKey));
      return resizeSelected(s, dw * step, dh * step);
    },
  };
}

export const COMMANDS: CanvasCommand[] = [
  // General
  { id: "palette", label: "Command palette", group: "General", combos: [{ key: "k", mod: true }], scope: "global", run: (s) => s.set({ dialog: s.dialog === "palette" ? null : "palette" }) },
  { id: "shortcuts", label: "Keyboard shortcuts", group: "General", combos: [{ key: "?", shift: "any" }], scope: "canvas", palette: true, run: (s) => s.set({ dialog: "shortcuts" }) },
  { id: "ai", label: "Ask AI to edit the selection", group: "General", combos: [{ key: "j", mod: true }], scope: "global", palette: true, run: (s) => s.set({ aiOpen: !s.aiOpen }) },
  { id: "save", label: "Save report", group: "General", combos: [{ key: "s", mod: true }], scope: "global", palette: true, run: (s) => void s.save() },
  {
    id: "leave-home", label: "Back to the designer", group: "General", combos: [{ key: "Escape" }], scope: "global",
    run: (s) => (s.home && !s.dialog ? s.set({ home: false }) : false),
  },
  // View
  { id: "zoom-in", label: "Zoom in", group: "View", combos: [{ key: "=", mod: true, shift: "any" }, { key: "+", mod: true, shift: "any" }], scope: "canvas", palette: true, run: (s) => zoomCanvas(nextZoomStep(s.zoom, 1)) },
  { id: "zoom-out", label: "Zoom out", group: "View", combos: [{ key: "-", mod: true, shift: "any" }], scope: "canvas", palette: true, run: (s) => zoomCanvas(nextZoomStep(s.zoom, -1)) },
  { id: "zoom-100", label: "Zoom to 100%", group: "View", combos: [{ code: "Digit0", shift: true }, { key: "0", mod: true }], scope: "canvas", palette: true, run: () => zoomCanvas(1) },
  { id: "zoom-fit", label: "Zoom to fit page width", group: "View", combos: [{ code: "Digit1", shift: true }], scope: "canvas", palette: true, run: () => zoomToFit() },
  { id: "zoom-selection", label: "Zoom to selection", group: "View", combos: [{ code: "Digit2", shift: true }], scope: "canvas", palette: true, run: () => zoomToSelection() },
  // Select
  { id: "select-level", label: "Select all at this level", group: "Select", combos: [{ key: "a", mod: true }], scope: "canvas", palette: true, run: (s) => s.select(levelSelection(s.doc, s.selection)) },
  {
    id: "select-next", label: "Select next element", group: "Select", combos: [{ key: "Tab" }], scope: "canvas-focus",
    run: (s) => {
      const next = s.selection.length === 1 ? siblingSelection(s.doc, s.selection[0]!, 1) : undefined;
      return next ? s.select([next]) : false;
    },
  },
  {
    id: "select-previous", label: "Select previous element", group: "Select", combos: [{ key: "Tab", shift: true }], scope: "canvas-focus",
    run: (s) => {
      const previous = s.selection.length === 1 ? siblingSelection(s.doc, s.selection[0]!, -1) : undefined;
      return previous ? s.select([previous]) : false;
    },
  },
  {
    id: "enter", label: "Edit text, or select children", group: "Select", combos: [{ key: "Enter" }], scope: "canvas-focus",
    run: (s) => {
      if (s.selection.length === 1) {
        const comp = ops.find(s.doc, s.selection[0]!)?.comp;
        if (!comp || comp.locked) return false;
        if (["text", "richText"].includes(comp.type) && !comp.binding && !comp.expression) return s.set({ editingText: comp.id });
        if (comp.type === "table") return s.set({ tableEditId: comp.id, contextMenu: null });
      }
      const children = childSelection(s.doc, s.selection);
      return children.length ? s.select(children) : false;
    },
  },
  {
    id: "select-parent", label: "Select parent", group: "Select", combos: [{ key: "Enter", shift: true }, { key: "\\" }], scope: "canvas-focus",
    run: (s) => {
      const parents = parentSelection(s.doc, s.selection);
      return parents.length ? s.select(parents) : false;
    },
  },
  {
    id: "escape", label: "Leave table editing, or clear the selection", group: "Select", combos: [{ key: "Escape" }], scope: "canvas",
    run: (s) => {
      if (s.tableEditId) return s.set({ tableEditId: null });
      s.set({ contextMenu: null, editingText: null, renaming: null });
      s.select([]);
    },
  },
  {
    id: "rename", label: "Rename", group: "Select", combos: [{ key: "F2" }], scope: "canvas",
    run: (s) => (s.selection[0] ? s.set({ renaming: s.selection[0], leftTab: "layers", leftOpen: true }) : false),
  },
  // Edit
  { id: "undo", label: "Undo", group: "Edit", combos: [{ key: "z", mod: true }], scope: "canvas", palette: true, run: (s) => s.undo() },
  { id: "redo", label: "Redo", group: "Edit", combos: [{ key: "z", mod: true, shift: true }, { key: "y", mod: true }], scope: "canvas", palette: true, run: (s) => s.redo() },
  { id: "copy", label: "Copy", group: "Edit", combos: [{ key: "c", mod: true }], scope: "canvas", keepDefault: true, run: (s) => s.copy() },
  { id: "paste", label: "Paste", group: "Edit", combos: [{ key: "v", mod: true }], scope: "canvas", run: (s) => s.paste() },
  { id: "duplicate", label: "Duplicate", group: "Edit", combos: [{ key: "d", mod: true }], scope: "canvas", palette: true, run: (s) => s.duplicateSelected() },
  { id: "delete", label: "Delete", group: "Edit", combos: [{ key: "Delete" }, { key: "Backspace" }], scope: "canvas", run: (s) => s.removeSelected() },
  arrow("ArrowLeft", -1, 0),
  arrow("ArrowRight", 1, 0),
  arrow("ArrowUp", 0, -1),
  arrow("ArrowDown", 0, 1),
  resizeArrow("ArrowRight", 1, 0, "Make wider"),
  resizeArrow("ArrowLeft", -1, 0, "Make narrower"),
  resizeArrow("ArrowDown", 0, 1, "Make taller"),
  resizeArrow("ArrowUp", 0, -1, "Make shorter"),
  // Arrange
  { id: "group", label: "Group selection", group: "Arrange", combos: [{ key: "g", mod: true }], scope: "canvas", palette: true, run: (s) => s.groupSelected() },
  { id: "ungroup", label: "Ungroup", group: "Arrange", combos: [{ key: "g", mod: true, shift: true }], scope: "canvas", palette: true, run: (s) => s.ungroupSelected() },
  { id: "lock", label: "Lock or unlock", group: "Arrange", combos: [{ key: "l", mod: true }], scope: "canvas", palette: true, run: (s) => s.toggleLock() },
  { id: "hide", label: "Hide or show", group: "Arrange", combos: [{ key: "h", mod: true, shift: true }], scope: "canvas", palette: true, run: (s) => s.toggleHide() },
  alignCommand("left", "KeyA", "Align left"),
  alignCommand("center", "KeyH", "Align horizontal centres"),
  alignCommand("right", "KeyD", "Align right"),
  alignCommand("top", "KeyW", "Align top"),
  alignCommand("middle", "KeyV", "Align vertical centres"),
  alignCommand("bottom", "KeyS", "Align bottom"),
  { id: "distribute-h", label: "Space evenly across", group: "Arrange", combos: [{ code: "KeyH", alt: true, shift: true }], scope: "canvas", palette: true, run: (s) => arrange(s, ops.distribute(s.doc, s.selection, "horizontal"), DISTRIBUTE_REASON) },
  { id: "distribute-v", label: "Space evenly down", group: "Arrange", combos: [{ code: "KeyV", alt: true, shift: true }], scope: "canvas", palette: true, run: (s) => arrange(s, ops.distribute(s.doc, s.selection, "vertical"), DISTRIBUTE_REASON) },
  reorderCommand("forward", "Bring forward", { code: "BracketRight", mod: true }),
  reorderCommand("backward", "Send backward", { code: "BracketLeft", mod: true }),
  reorderCommand("front", "Bring to front", { code: "BracketRight", mod: true, alt: true }),
  reorderCommand("back", "Send to back", { code: "BracketLeft", mod: true, alt: true }),
];

function inScope(command: CanvasCommand, store: Store, event: KeyboardEvent): boolean {
  if (command.scope === "global") return true;
  if (store.dialog || store.home || store.mode !== "design" || isTyping(event.target)) return false;
  if (event.target instanceof Element && event.target.closest(WIDGETS)) return false;
  if (command.scope === "canvas-focus") return !(event.target instanceof Element && event.target.closest(CONTROLS) && !event.target.closest(".canvas-scroll"));
  return true;
}

/** The one keydown handler for the designer. Returns true when a command handled the key. */
export function handleShortcut(event: KeyboardEvent): boolean {
  // A focused widget (menu, tree, list) already handled this key.
  if (event.defaultPrevented) return false;
  const store = useStore.getState();
  for (const command of COMMANDS) {
    if (!command.combos.some((combo) => matchesCombo(combo, event)) || !inScope(command, store, event)) continue;
    if (command.run(store, event) === false) continue;
    if (!command.keepDefault) event.preventDefault();
    return true;
  }
  return false;
}

/** The label of a command's first key combination for this platform, e.g. "⇧⌘Z" or "Ctrl+Shift+Z". */
export function shortcutLabel(id: string, mac = isMacPlatform()): string | undefined {
  const combo = COMMANDS.find((command) => command.id === id)?.combos[0];
  return combo ? formatCombo(combo, mac) : undefined;
}
