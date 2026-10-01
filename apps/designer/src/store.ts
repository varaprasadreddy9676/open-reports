import { create } from "zustand";
import * as ops from "./model/ops";
import type { Comp, Doc } from "./model/ops";
import { runEngine, type EngineResult } from "./engine";
import { blankReport } from "./lib/templates";
import { api, ApiError } from "./lib/api";

export type Mode = "design" | "code" | "preview";
export type LeftTab = "insert" | "data" | "layers";

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
}

interface State {
  doc: Doc;
  sample: Record<string, unknown>;
  parameters: Record<string, unknown>;
  selection: string[];
  clipboard: Comp[];
  past: Doc[];
  future: Doc[];
  lastCoalesce: { key: string; at: number } | null;
  mode: Mode;
  leftTab: LeftTab;
  zoom: number;
  showGrid: boolean;
  snap: boolean;
  showRulers: boolean;
  leftOpen: boolean;
  rightOpen: boolean;
  problemsOpen: boolean;
  engine: EngineResult;
  engineBusy: boolean;
  meta: TemplateMeta;
  toasts: Toast[];
  dialog: null | "open" | "new" | "settings" | "dataset" | "palette" | "generate";
  editingDataset: string | null;
  dropPrompt: DropPrompt | null;
  codeFocus: { id: string; nonce: number } | null;

  setDoc(doc: Doc, opts?: { coalesce?: string; keepSelection?: boolean }): void;
  loadDoc(doc: Doc, meta?: Partial<TemplateMeta>, sample?: Record<string, unknown>): void;
  undo(): void;
  redo(): void;
  select(ids: string[], additive?: boolean): void;
  addComponent(type: string, targetId?: string, position?: ops.DropPosition, overrides?: Partial<Comp>): string;
  insertComponent(comp: Comp, targetId?: string, position?: ops.DropPosition): string;
  removeSelected(): void;
  duplicateSelected(): void;
  copy(): void;
  paste(): void;
  patch(id: string, patch: Record<string, any>, coalesce?: string): void;
  patchStyle(id: string, patch: Record<string, any>, coalesce?: string): void;
  nudge(dx: number, dy: number): void;
  setSample(id: string, value: unknown): void;
  setParameter(id: string, value: unknown): void;
  setMode(m: Mode): void;
  set(partial: Partial<State>): void;
  toast(text: string, kind?: Toast["kind"]): void;
  refresh(): Promise<void>;
  save(): Promise<void>;
  publish(): Promise<void>;
  openTemplate(id: string): Promise<void>;
  openCode(id: string): void;
}

let toastId = 1;
let engineRun = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

const DRAFT_KEY = "designer.draft";

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
  clipboard: [],
  past: [],
  future: [],
  lastCoalesce: null,
  mode: "design",
  leftTab: "insert",
  zoom: 1,
  showGrid: false,
  snap: true,
  showRulers: false,
  leftOpen: true,
  rightOpen: true,
  problemsOpen: true,
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
    const now = Date.now();
    const coalesce = opts.coalesce && s.lastCoalesce && s.lastCoalesce.key === opts.coalesce && now - s.lastCoalesce.at < 900;
    const past = coalesce ? s.past : [...s.past, s.doc].slice(-100);
    set({
      doc,
      past,
      future: [],
      lastCoalesce: opts.coalesce ? { key: opts.coalesce, at: now } : null,
      meta: { ...s.meta, dirty: true },
    });
    persistDraft(doc, s.sample);
    get().refresh();
  },

  loadDoc(doc, meta = {}, sample = {}) {
    const d = ops.ensureIds(doc);
    set({ doc: d, sample, selection: [], past: [], future: [], meta: { dirty: false, ...meta }, parameters: {}, lastCoalesce: null });
    persistDraft(d, sample);
    get().refresh();
  },

  undo() {
    const s = get();
    const prev = s.past[s.past.length - 1];
    if (!prev) return;
    set({ doc: prev, past: s.past.slice(0, -1), future: [s.doc, ...s.future], lastCoalesce: null, meta: { ...s.meta, dirty: true } });
    get().refresh();
  },

  redo() {
    const s = get();
    const next = s.future[0];
    if (!next) return;
    set({ doc: next, past: [...s.past, s.doc], future: s.future.slice(1), lastCoalesce: null, meta: { ...s.meta, dirty: true } });
    get().refresh();
  },

  select(ids, additive = false) {
    const s = get();
    if (additive) {
      const set2 = new Set(s.selection);
      for (const id of ids) (set2.has(id) ? set2.delete(id) : set2.add(id));
      set({ selection: [...set2] });
    } else set({ selection: ids });
  },

  addComponent(type, targetId, position = "after", overrides = {}) {
    const make = ops.PALETTE[type];
    if (!make) return "";
    return get().insertComponent({ ...make(), ...overrides }, targetId, position);
  },

  insertComponent(comp, targetId, position = "after") {
    const s = get();
    const withId: Comp = comp.id ? comp : { id: ops.genId(s.doc, comp.type), ...comp };
    const next = ops.insert(s.doc, withId, targetId, position);
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

  setParameter(id, value) {
    set({ parameters: { ...get().parameters, [id]: value } });
    get().refresh();
  },

  setMode(mode) {
    set({ mode });
  },

  set(partial) {
    set(partial as any);
  },

  toast(text, kind = "info") {
    const id = toastId++;
    set({ toasts: [...get().toasts, { id, kind, text }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), kind === "error" ? 6000 : 2800);
  },

  async refresh() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const run = ++engineRun;
      set({ engineBusy: true });
      const { doc, sample, parameters } = get();
      const result = await runEngine(doc, sample, parameters);
      if (run === engineRun) {
        // On a schema/engine error keep showing the last good render, with fresh problems alongside it.
        const prev = get().engine;
        set({ engine: result.paginated ? result : { ...prev, problems: result.problems }, engineBusy: false });
      }
    }, 60);
  },

  async save() {
    const s = get();
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
      set({ meta: { id: rec.id, version: rec.currentVersion, status: rec.status, dirty: false } });
      get().toast(`Saved as version ${rec.currentVersion}`, "success");
    } catch (e) {
      get().toast((e as Error).message, "error");
    }
  },

  async publish() {
    const s = get();
    if (s.meta.dirty || !s.meta.id) await get().save();
    const m = get().meta;
    if (!m.id || !m.version) return;
    try {
      await api.publish(m.id, m.version);
      set({ meta: { ...m, status: "published" } });
      get().toast(`Published version ${m.version}`, "success");
    } catch (e) {
      get().toast((e as Error).message, "error");
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
}));
