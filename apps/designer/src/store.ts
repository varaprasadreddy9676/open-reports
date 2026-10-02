import { create } from "zustand";
import * as ops from "./model/ops";
import type { Comp, Doc } from "./model/ops";
import { runEngine, type EngineResult, type Capabilities } from "./engine";
import { diffDocs, summarize } from "./lib/diff";
import type { Proposal } from "./lib/ai";
import { blankReport } from "./lib/templates";
import { api, ApiError } from "./lib/api";

export type Mode = "design" | "data" | "code" | "preview";
export type LeftTab = "insert" | "layers" | "data" | "pages";
export type BottomPanel = null | "problems" | "pagination" | "history";
export type CanvasView = "structure" | "pages";
export type RulerUnit = "mm" | "cm" | "in" | "pt" | "px" | "dots";
export type RulerOrigin = "page" | "printable";
export type SaveState = "saved" | "saving" | "dirty" | "error";

export interface HistoryEntry {
  doc: Doc;
  label: string;
  at: number;
}

export interface ViewOptions {
  grid: boolean;
  rulers: boolean;
  guides: boolean;
  margins: boolean;
  boundaries: boolean;
  diagnostics: boolean;
}

export interface Block {
  id: string;
  name: string;
  children: Comp[];
}

export interface TemplateMeta {
  id?: string;
  version?: number;
  status?: "draft" | "published" | "archived";
  dirty: boolean;
}

export interface Toast {
  id: number;
  kind: "info" | "error" | "success";
  text: string;
}

export interface DropPrompt {
  x: number;
  y: number;
  dataset: string;
  targetId?: string;
  position: ops.DropPosition;
  bandIndex?: number | null;
}

interface State {
  doc: Doc;
  sample: Record<string, unknown>;
  parameters: Record<string, unknown>;
  selection: string[];
  clipboard: Comp[];
  past: HistoryEntry[];
  future: HistoryEntry[];
  lastCoalesce: { key: string; at: number } | null;
  mode: Mode;
  leftTab: LeftTab;
  zoom: number;
  fitToWidth: boolean;
  showGrid: boolean;
  snap: boolean;
  showRulers: boolean;
  canvasView: CanvasView;
  previewSplit: boolean;
  showPagination: boolean;
  /** Example records shown per detail band in the structure view. */
  ghosts: number;
  rulerUnit: RulerUnit;
  rulerOrigin: RulerOrigin;
  gridMode: "lines" | "dots";
  /** Index (in doc.sections) of the band selected on the structure canvas. */
  selectedBand: number | null;
  view: ViewOptions;
  split: boolean;
  bottom: BottomPanel;
  target: string;
  sampleRows: number;
  saveState: SaveState;
  capabilities?: Capabilities;
  blocks: Block[];
  editingText: string | null;
  tableEditId: string | null;
  renaming: string | null;
  contextMenu: { x: number; y: number; id?: string } | null;
  compareVersion: number | null;
  aiOpen: boolean;
  aiProposal: Proposal | null;
  aiBusy: boolean;
  leftOpen: boolean;
  rightOpen: boolean;
  focusCanvas: boolean;
  focusRestore: { leftOpen: boolean; rightOpen: boolean; bottom: BottomPanel } | null;
  engine: EngineResult;
  engineBusy: boolean;
  meta: TemplateMeta;
  toasts: Toast[];
  dialog: null | "ai-settings" | "open" | "new" | "settings" | "dataset" | "group" | "palette" | "generate" | "compare" | "block" | "publish";
  editingDataset: string | null;
  dropPrompt: DropPrompt | null;
  codeFocus: { id: string; nonce: number } | null;

  setDoc(doc: Doc, opts?: { coalesce?: string; keepSelection?: boolean }): void;
  loadDoc(doc: Doc, meta?: Partial<TemplateMeta>, sample?: Record<string, unknown>): void;
  undo(): void;
  redo(): void;
  select(ids: string[], additive?: boolean): void;
  addComponent(type: string, targetId?: string, position?: ops.DropPosition, overrides?: Partial<Comp>, bandIndex?: number | null): string;
  insertComponent(comp: Comp, targetId?: string, position?: ops.DropPosition, bandIndex?: number | null): string;
  removeSelected(): void;
  duplicateSelected(): void;
  copy(): void;
  paste(): void;
  patch(id: string, patch: Record<string, any>, coalesce?: string): void;
  patchStyle(id: string, patch: Record<string, any>, coalesce?: string): void;
  nudge(dx: number, dy: number): void;
  setSample(id: string, value: unknown): void;
  clearSample(id: string): void;
  setParameter(id: string, value: unknown): void;
  setMode(m: Mode): void;
  set(partial: Partial<State>): void;
  toast(text: string, kind?: Toast["kind"]): void;
  refresh(): Promise<void>;
  save(): Promise<void>;
  publish(notes: string): Promise<boolean>;
  openTemplate(id: string): Promise<void>;
  openCode(id: string): void;
  groupSelected(): void;
  ungroupSelected(): void;
  toggleLock(id?: string): void;
  toggleHide(id?: string): void;
  rename(id: string, name: string): void;
  restore(index: number): void;
  loadCapabilities(): Promise<void>;
  loadBlocks(): Promise<void>;
  saveBlock(name: string): Promise<void>;
  insertBlock(id: string): void;
  acceptAi(): void;
  rejectAi(): void;
}

let toastId = 1;
let engineRun = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

function pref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(`designer.${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: string): void {
  try {
    localStorage.setItem(`designer.${key}`, value);
  } catch {
    /* private mode */
  }
}

const DRAFT_KEY = "designer.draft";
const CLIP_KEY = "designer.clipboard";

function saveClipboard(comps: Comp[]) {
  try {
    localStorage.setItem(CLIP_KEY, JSON.stringify(comps));
  } catch {
    /* storage unavailable */
  }
}

function loadClipboard(): Comp[] {
  try {
    return JSON.parse(localStorage.getItem(CLIP_KEY) ?? "[]");
  } catch {
    return [];
  }
}

let autosave: ReturnType<typeof setTimeout> | undefined;
/** Drafts are always kept locally; saved templates are autosaved to the server a few seconds after the last edit. */
function scheduleAutosave() {
  clearTimeout(autosave);
  autosave = setTimeout(() => {
    const s = useStore.getState();
    if (s.meta.id && s.meta.dirty && s.meta.status !== "published") s.save();
  }, 4000);
}

function persistDraft(doc: Doc, sample: Record<string, unknown>) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ doc, sample }));
  } catch {
    /* storage unavailable */
  }
}

export function loadDraft(): { doc: Doc; sample: Record<string, unknown> } | undefined {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export const useStore = create<State>((set, get) => ({
  doc: ops.ensureIds(blankReport()),
  sample: {},
  parameters: {},
  selection: [],
  clipboard: loadClipboard(),
  past: [],
  future: [],
  lastCoalesce: null,
  mode: "design",
  leftTab: "insert",
  zoom: 1,
  fitToWidth: false,
  showGrid: false,
  snap: true,
  showRulers: true,
  canvasView: pref("canvasView", "structure") as CanvasView,
  previewSplit: false,
  showPagination: false,
  ghosts: 0,
  rulerUnit: pref("rulerUnit", "mm") as RulerUnit,
  rulerOrigin: pref("rulerOrigin", "page") as RulerOrigin,
  gridMode: "lines",
  selectedBand: null,
  view: { grid: false, rulers: true, guides: true, margins: true, boundaries: false, diagnostics: true },
  split: false,
  bottom: null,
  target: "pdf",
  sampleRows: 0,
  saveState: "saved",
  capabilities: undefined,
  blocks: [],
  editingText: null,
  tableEditId: null,
  renaming: null,
  contextMenu: null,
  compareVersion: null,
  aiOpen: false,
  aiProposal: null,
  aiBusy: false,
  leftOpen: true,
  rightOpen: true,
  focusCanvas: false,
  focusRestore: null,
  engine: { problems: [] },
  engineBusy: false,
  meta: { dirty: false },
  toasts: [],
  dialog: null,
  editingDataset: null,
  dropPrompt: null,
  codeFocus: null,

  setDoc(doc, opts = {}) {
    const s = get();
    if (doc === s.doc) return;
    if (s.aiProposal) set({ aiProposal: null }); // editing by hand supersedes a pending AI proposal
    const now = Date.now();
    const coalesce = opts.coalesce && s.lastCoalesce && s.lastCoalesce.key === opts.coalesce && now - s.lastCoalesce.at < 900;
    const past = coalesce ? s.past : [...s.past, { doc: s.doc, label: summarize(diffDocs(s.doc, doc)), at: now }].slice(-100);
    set({
      doc,
      past,
      future: [],
      lastCoalesce: opts.coalesce ? { key: opts.coalesce, at: now } : null,
      meta: { ...s.meta, dirty: true },
      saveState: "dirty",
    });
    persistDraft(doc, s.sample);
    get().refresh();
    scheduleAutosave();
  },

  loadDoc(doc, meta = {}, sample = {}) {
    const d = ops.ensureIds(doc);
    set({ doc: d, sample, selection: [], tableEditId: null, past: [], future: [], meta: { dirty: false, ...meta }, parameters: {}, lastCoalesce: null, saveState: "saved", showPagination: false, fitToWidth: true });
    persistDraft(d, sample);
    get().refresh();
  },

  undo() {
    const s = get();
    const prev = s.past[s.past.length - 1];
    if (!prev) return;
    set({ doc: prev.doc, past: s.past.slice(0, -1), future: [{ doc: s.doc, label: prev.label, at: Date.now() }, ...s.future], lastCoalesce: null, meta: { ...s.meta, dirty: true }, saveState: "dirty" });
    persistDraft(prev.doc, s.sample);
    get().refresh();
  },

  redo() {
    const s = get();
    const next = s.future[0];
    if (!next) return;
    set({ doc: next.doc, past: [...s.past, { doc: s.doc, label: next.label, at: Date.now() }], future: s.future.slice(1), lastCoalesce: null, meta: { ...s.meta, dirty: true }, saveState: "dirty" });
    persistDraft(next.doc, s.sample);
    get().refresh();
  },

  select(ids, additive = false) {
    const s = get();
    if (additive) {
      const set2 = new Set(s.selection);
      for (const id of ids) (set2.has(id) ? set2.delete(id) : set2.add(id));
      set({ selection: [...set2], selectedBand: null });
    } else set({ selection: ids, selectedBand: null });
  },

  addComponent(type, targetId, position = "after", overrides = {}, bandIndex) {
    const make = ops.PALETTE[type];
    if (!make) return "";
    return get().insertComponent({ ...make(), ...overrides }, targetId, position, bandIndex);
  },

  insertComponent(comp, targetId, position = "after", bandIndex) {
    const s = get();
    const withId: Comp = comp.id ? comp : { id: ops.genId(s.doc, comp.type), ...comp };
    const next = ops.insert(s.doc, withId, targetId, position, bandIndex === undefined ? s.selectedBand : bandIndex);
    get().setDoc(next);
    set({ selection: [withId.id] });
    return withId.id;
  },

  removeSelected() {
    const s = get();
    if (!s.selection.length) return;
    get().setDoc(ops.remove(s.doc, s.selection));
    set({ selection: [] });
  },

  duplicateSelected() {
    const s = get();
    let doc = s.doc;
    const ids: string[] = [];
    for (const id of s.selection) {
      const r = ops.duplicate(doc, id);
      doc = r.doc;
      if (r.newId) ids.push(r.newId);
    }
    get().setDoc(doc);
    set({ selection: ids });
  },

  copy() {
    const s = get();
    const comps = s.selection.map((id) => ops.find(s.doc, id)?.comp).filter(Boolean) as Comp[];
    set({ clipboard: structuredClone(comps) });
    saveClipboard(comps);
    if (comps.length) get().toast(`Copied ${comps.length} element${comps.length > 1 ? "s" : ""}`);
  },

  paste() {
    const s = get();
    if (!s.clipboard.length) return;
    let doc = s.doc;
    const ids: string[] = [];
    let target = s.selection[s.selection.length - 1];
    for (const c of s.clipboard) {
      const copy = ops.reId(doc, structuredClone(c));
      if (typeof copy.x === "number") copy.x += 10;
      if (typeof copy.y === "number") copy.y += 10;
      doc = ops.insert(doc, copy, target, "after");
      target = copy.id;
      ids.push(copy.id);
    }
    get().setDoc(doc);
    set({ selection: ids });
  },

  patch(id, patch, coalesce) {
    const s = get();
    get().setDoc(ops.update(s.doc, id, patch), { coalesce: coalesce ?? `p:${id}:${Object.keys(patch).join(",")}` });
  },

  patchStyle(id, patch, coalesce) {
    const s = get();
    get().setDoc(ops.updateStyle(s.doc, id, patch), { coalesce: coalesce ?? `s:${id}:${Object.keys(patch).join(",")}` });
  },

  nudge(dx, dy) {
    const s = get();
    let doc = s.doc;
    for (const id of s.selection) {
      const loc = ops.find(doc, id);
      if (!loc) continue;
      const layout = ops.parentLayout(doc, id);
      if (layout === "absolute" || typeof loc.comp.x === "number") {
        doc = ops.update(doc, id, { x: (Number(loc.comp.x) || 0) + dx, y: (Number(loc.comp.y) || 0) + dy });
      } else if (dy !== 0) {
        doc = ops.shift(doc, id, dy > 0 ? 1 : -1);
      }
    }
    get().setDoc(doc, { coalesce: "nudge" });
  },

  setSample(id, value) {
    const sample = { ...get().sample, [id]: value };
    set({ sample });
    persistDraft(get().doc, sample);
    get().refresh();
  },

  clearSample(id) {
    const sample = { ...get().sample };
    if (!(id in sample)) return;
    delete sample[id];
    set({ sample });
    persistDraft(get().doc, sample);
    get().refresh();
  },

  setParameter(id, value) {
    set({ parameters: { ...get().parameters, [id]: value } });
    get().refresh();
  },

  setMode(mode) {
    set({ mode, ...(mode !== "design" ? { tableEditId: null } : {}) });
  },

  set(partial) {
    set({ ...partial, ...(partial.mode && partial.mode !== "design" ? { tableEditId: null } : {}) } as any);
  },

  toast(text, kind = "info") {
    const id = toastId++;
    set({ toasts: [...get().toasts, { id, kind, text }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), kind === "error" ? 6000 : 2800);
  },

  async refresh() {
    clearTimeout(timer);
    const run = ++engineRun;
    set({ engineBusy: true });
    timer = setTimeout(async () => {
      const { doc: realDoc, aiProposal, sample, parameters, sampleRows, target, capabilities, ghosts } = get();
      // While an AI proposal awaits approval the canvas shows the proposed result; nothing is committed until Accept.
      const doc = aiProposal?.doc ?? realDoc;
      const result = await runEngine(doc, sample, parameters, { sampleRows, target, capabilities, ghosts });
      if (run === engineRun) {
        // On a schema/engine error keep showing the last good render, with fresh problems alongside it.
        const prev = get().engine;
        set({ engine: result.paginated ? result : { ...prev, problems: result.problems }, engineBusy: false });
      }
    }, 60);
  },

  async save() {
    const s = get();
    set({ saveState: "saving" });
    try {
      const id = s.meta.id ?? s.doc.id;
      let rec;
      if (s.meta.id) rec = await api.saveTemplate(id, s.doc.name, s.doc);
      else {
        try {
          rec = await api.createTemplate(id, s.doc.name, s.doc);
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) rec = await api.saveTemplate(id, s.doc.name, s.doc);
          else throw e;
        }
      }
      set({ meta: { id: rec.id, version: rec.currentVersion, status: rec.status, dirty: false }, saveState: "saved" });
      get().toast(`Saved as version ${rec.currentVersion}`, "success");
    } catch (e) {
      set({ saveState: "error" });
      get().toast((e as Error).message, "error");
    }
  },

  async publish(notes) {
    const s = get();
    if (s.meta.dirty || !s.meta.id) await get().save();
    const m = get().meta;
    if (!m.id || !m.version || m.dirty || get().saveState === "error") return false;
    try {
      await api.publish(m.id, m.version, notes);
      set({ meta: { ...m, status: "published" } });
      get().toast(`Published version ${m.version}`, "success");
      return true;
    } catch (e) {
      get().toast((e as Error).message, "error");
      return false;
    }
  },

  async openTemplate(id) {
    try {
      const tpl = await api.getTemplate(id);
      const version = await api.getVersion(id, tpl.currentVersion);
      get().loadDoc(version.definition, { id: tpl.id, version: tpl.currentVersion, status: version.status, dirty: false });
      set({ dialog: null });
    } catch (e) {
      get().toast((e as Error).message, "error");
    }
  },

  openCode(id) {
    set({ mode: "code", codeFocus: { id, nonce: Date.now() } });
  },

  groupSelected() {
    const s = get();
    if (s.selection.length < 2) return;
    const r = ops.group(s.doc, s.selection);
    if (!r.id) return get().toast("Select elements that share the same parent to group them");
    get().setDoc(r.doc);
    set({ selection: [r.id] });
  },

  ungroupSelected() {
    const s = get();
    const id = s.selection[0];
    if (!id) return;
    const r = ops.ungroup(s.doc, id);
    if (r.ids.length) {
      get().setDoc(r.doc);
      set({ selection: r.ids });
    }
  },

  toggleLock(id) {
    const s = get();
    for (const t of id ? [id] : s.selection) {
      const c = ops.find(get().doc, t)?.comp;
      if (c) get().setDoc(ops.setLocked(get().doc, [t], !c.locked));
    }
  },

  toggleHide(id) {
    const s = get();
    for (const t of id ? [id] : s.selection) {
      const c = ops.find(get().doc, t)?.comp;
      if (c) get().setDoc(ops.setHidden(get().doc, [t], !c.hidden));
    }
  },

  rename(id, name) {
    get().setDoc(ops.update(get().doc, id, { name: name || undefined }));
  },

  restore(index) {
    const s = get();
    const entry = s.past[index];
    if (!entry) return;
    get().setDoc(entry.doc);
    get().toast("Restored an earlier state - Undo brings back your latest edits");
  },

  async loadCapabilities() {
    try {
      set({ capabilities: await api.capabilities() });
      get().refresh();
    } catch {
      /* server unavailable: capability checks are skipped */
    }
  },

  async loadBlocks() {
    try {
      set({ blocks: (await api.listBlocks()) as Block[] });
    } catch {
      /* ignore */
    }
  },

  async saveBlock(name) {
    const s = get();
    const comps = s.selection.map((id) => ops.find(s.doc, id)?.comp).filter(Boolean) as Comp[];
    if (!comps.length) return;
    try {
      await api.putBlock(name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "block", name, structuredClone(comps));
      await get().loadBlocks();
      get().toast(`Saved "${name}" to My Components`, "success");
    } catch (e) {
      get().toast((e as Error).message, "error");
    }
  },

  insertBlock(id) {
    const s = get();
    const b = s.blocks.find((x) => x.id === id);
    if (!b) return;
    let doc = s.doc;
    let target = s.selection[s.selection.length - 1];
    const ids: string[] = [];
    for (const c of b.children) {
      const copy = ops.reId(doc, structuredClone(c));
      doc = ops.insert(doc, copy, target, "after");
      target = copy.id;
      ids.push(copy.id);
    }
    get().setDoc(doc);
    set({ selection: ids });
  },

  acceptAi() {
    const p = get().aiProposal;
    if (!p) return;
    set({ aiProposal: null });
    get().setDoc(ops.ensureIds(p.doc));
    get().toast("Applied the AI change - Undo restores your previous version", "success");
  },

  rejectAi() {
    if (!get().aiProposal) return;
    set({ aiProposal: null });
    get().refresh();
  },
}));
