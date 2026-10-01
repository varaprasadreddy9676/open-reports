/**
 * Pure operations over the report definition (plain JSON). The designer never
 * keeps a second "visual model": every edit -- canvas, properties panel, code
 * editor, command palette -- is one of these functions producing a new
 * definition, which is why Visual/Low-code/Code stay in sync by construction.
 */
export type Doc = Record<string, any>;
export type Comp = Record<string, any> & { type: string };

export const CHILD_LISTS = ["children", "header", "footer", "otherwise"] as const;
export const CONTAINER_TYPES = ["container", "row", "column", "grid", "repeater", "keepTogether", "group", "conditional", "labelSheet"] as const;

export function clone<T>(v: T): T {
  return structuredClone(v);
}

export interface Located {
  comp: Comp;
  list: Comp[];
  index: number;
  /** id of the parent component, or `section:<n>` for a section's children */
  parent: string;
  path: string;
}

export function* walkAll(doc: Doc): Generator<Located> {
  const sections: any[] = doc.sections ?? [];
  for (let s = 0; s < sections.length; s++) {
    yield* walkList(sections[s].children ?? [], `section:${s}`, `sections[${s}].children`);
  }
}

function* walkList(list: Comp[], parent: string, path: string): Generator<Located> {
  for (let i = 0; i < list.length; i++) {
    const comp = list[i]!;
    yield { comp, list, index: i, parent, path: `${path}[${i}]` };
    for (const key of CHILD_LISTS) {
      if (Array.isArray(comp[key])) yield* walkList(comp[key], comp.id ?? parent, `${path}[${i}].${key}`);
    }
  }
}

export function find(doc: Doc, id: string): Located | undefined {
  for (const loc of walkAll(doc)) if (loc.comp.id === id) return loc;
  return undefined;
}

export function findByPath(doc: Doc, path: string): Located | undefined {
  // validator paths look like sections[0].children[1] or ....children[2].children[0]
  const base = path.replace(/\.(columns|binding|expression|visibleWhen|filterWhen|groupBy)(\[.*)?$/, "");
  for (const loc of walkAll(doc)) if (loc.path === base) return loc;
  return undefined;
}

const COUNTERS = new Map<string, number>();

export function genId(doc: Doc, type: string): string {
  const used = new Set<string>();
  for (const l of walkAll(doc)) if (l.comp.id) used.add(l.comp.id);
  let n = (COUNTERS.get(type) ?? 0) + 1;
  while (used.has(`${type}-${n}`)) n++;
  COUNTERS.set(type, n);
  return `${type}-${n}`;
}

/** Gives every component an id (placed first so the code view reads naturally). */
export function ensureIds(input: Doc): Doc {
  const doc = clone(input);
  const used = new Set<string>();
  for (const l of walkAll(doc)) if (l.comp.id) used.add(l.comp.id);
  const counters: Record<string, number> = {};
  const fix = (list: Comp[]) => {
    for (let i = 0; i < list.length; i++) {
      let comp = list[i]!;
      if (!comp.id) {
        let id: string;
        do id = `${comp.type}-${(counters[comp.type] = (counters[comp.type] ?? 0) + 1)}`;
        while (used.has(id));
        used.add(id);
        comp = { id, ...comp };
        list[i] = comp;
      } else if (Object.keys(comp)[0] !== "id") {
        const { id, ...rest } = comp;
        comp = { id, ...rest };
        list[i] = comp;
      }
      for (const key of CHILD_LISTS) if (Array.isArray(comp[key])) fix(comp[key]);
    }
  };
  for (const s of doc.sections ?? []) fix(s.children ?? (s.children = []));
  return doc;
}

export function ensureDetailSection(doc: Doc): { doc: Doc; index: number } {
  const next = clone(doc);
  next.sections ??= [];
  let index = next.sections.findIndex((s: any) => s.type === "detail");
  if (index < 0) {
    next.sections.push({ type: "detail", children: [] });
    index = next.sections.length - 1;
  }
  next.sections[index].children ??= [];
  return { doc: next, index };
}

export type DropPosition = "before" | "after" | "inside";

/** Inserts `comp` relative to `targetId` (or at the end of the detail section). */
export function insert(doc: Doc, comp: Comp, targetId?: string, position: DropPosition = "after"): Doc {
  const withId = comp.id ? comp : { id: genId(doc, comp.type), ...comp };
  const next = clone(doc);
  if (targetId) {
    const t = find(next, targetId);
    if (t) {
      if (position === "inside" && (CONTAINER_TYPES as readonly string[]).includes(t.comp.type)) {
        (t.comp.children ??= []).push(withId);
      } else {
        t.list.splice(t.index + (position === "after" ? 1 : 0), 0, withId);
      }
      return next;
    }
  }
  const { doc: d2, index } = ensureDetailSection(next);
  d2.sections[index].children.push(withId);
  return d2;
}

export function remove(doc: Doc, ids: string[]): Doc {
  const next = clone(doc);
  for (const id of ids) {
    const loc = find(next, id);
    if (loc) loc.list.splice(loc.index, 1);
  }
  return next;
}

export function update(doc: Doc, id: string, patch: Record<string, any>): Doc {
  const next = clone(doc);
  const loc = find(next, id);
  if (!loc) return doc;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete loc.comp[k];
    else loc.comp[k] = v;
  }
  return next;
}

export function updateStyle(doc: Doc, id: string, patch: Record<string, any>): Doc {
  const loc = find(doc, id);
  if (!loc) return doc;
  const style = { ...(loc.comp.style ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === "") delete style[k];
    else style[k] = v;
  }
  return update(doc, id, { style: Object.keys(style).length ? style : undefined });
}

export function move(doc: Doc, id: string, targetId: string, position: DropPosition): Doc {
  if (id === targetId) return doc;
  const loc = find(doc, id);
  if (!loc) return doc;
  // refuse to move a component into itself
  for (const l of walkSubtree(loc.comp)) if (l.id === targetId) return doc;
  const without = remove(doc, [id]);
  return insert(without, clone(loc.comp), targetId, position);
}

function* walkSubtree(c: Comp): Generator<Comp> {
  yield c;
  for (const key of CHILD_LISTS) if (Array.isArray(c[key])) for (const k of c[key]) yield* walkSubtree(k);
}

export function duplicate(doc: Doc, id: string): { doc: Doc; newId?: string } {
  const loc = find(doc, id);
  if (!loc) return { doc };
  const next = clone(doc);
  const copy = reId(next, clone(loc.comp));
  const l2 = find(next, id)!;
  l2.list.splice(l2.index + 1, 0, copy);
  return { doc: next, newId: copy.id };
}

export function reId(_doc: Doc, comp: Comp): Comp {
  const used = new Set<string>();
  const assign = (c: Comp) => {
    let id: string;
    let n = 1;
    do id = `${c.type}-${Date.now().toString(36)}${n++}`;
    while (used.has(id));
    used.add(id);
    c.id = id;
    for (const key of CHILD_LISTS) if (Array.isArray(c[key])) c[key].forEach(assign);
  };
  assign(comp);
  return comp;
}

/** z-order / flow-order: shift a component within its sibling list. */
export function shift(doc: Doc, id: string, delta: number): Doc {
  const next = clone(doc);
  const loc = find(next, id);
  if (!loc) return doc;
  const to = Math.max(0, Math.min(loc.list.length - 1, loc.index + delta));
  if (to === loc.index) return doc;
  const [c] = loc.list.splice(loc.index, 1);
  loc.list.splice(to, 0, c!);
  return next;
}

export function parentLayout(doc: Doc, id: string): string | undefined {
  const loc = find(doc, id);
  if (!loc || loc.parent.startsWith("section:")) return undefined;
  const parent = find(doc, loc.parent);
  return parent ? (parent.comp.layout ?? (parent.comp.type === "row" ? "row" : undefined)) : undefined;
}

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";

const num = (v: any) => (typeof v === "number" ? v : Number.parseFloat(v) || 0);

/** Aligns absolutely-positioned components (x/y/width/height numbers) to each other. */
export function align(doc: Doc, ids: string[], mode: AlignMode): Doc {
  const comps = ids.map((id) => find(doc, id)?.comp).filter(Boolean) as Comp[];
  if (comps.length < 2) return doc;
  const boxes = comps.map((c) => ({ id: c.id, x: num(c.x), y: num(c.y), w: num(c.width), h: num(c.height) }));
  const minX = Math.min(...boxes.map((b) => b.x));
  const maxR = Math.max(...boxes.map((b) => b.x + b.w));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxB = Math.max(...boxes.map((b) => b.y + b.h));
  let next = doc;
  for (const b of boxes) {
    const patch: Record<string, number> = {};
    if (mode === "left") patch.x = minX;
    if (mode === "right") patch.x = maxR - b.w;
    if (mode === "center") patch.x = (minX + maxR) / 2 - b.w / 2;
    if (mode === "top") patch.y = minY;
    if (mode === "bottom") patch.y = maxB - b.h;
    if (mode === "middle") patch.y = (minY + maxB) / 2 - b.h / 2;
    next = update(next, b.id, patch);
  }
  return next;
}

export function distribute(doc: Doc, ids: string[], axis: "horizontal" | "vertical"): Doc {
  const comps = ids.map((id) => find(doc, id)?.comp).filter(Boolean) as Comp[];
  if (comps.length < 3) return doc;
  const key = axis === "horizontal" ? "x" : "y";
  const size = axis === "horizontal" ? "width" : "height";
  const sorted = [...comps].sort((a, b) => num(a[key]) - num(b[key]));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const totalSize = sorted.reduce((s, c) => s + num(c[size]), 0);
  const span = num(last[key]) + num(last[size]) - num(first[key]);
  const gap = (span - totalSize) / (sorted.length - 1);
  let pos = num(first[key]);
  let next = doc;
  for (const c of sorted) {
    next = update(next, c.id, { [key]: Math.round(pos * 100) / 100 });
    pos += num(c[size]) + gap;
  }
  return next;
}

export const PALETTE: Record<string, () => Comp> = {
  text: () => ({ type: "text", value: "New text" }),
  image: () => ({ type: "image", src: "", height: 60, width: 120 }),
  line: () => ({ type: "line" }),
  rectangle: () => ({ type: "rectangle", height: 40 }),
  spacer: () => ({ type: "spacer", height: 12 }),
  container: () => ({ type: "container", children: [] }),
  row: () => ({ type: "row", children: [] }),
  column: () => ({ type: "column", children: [] }),
  grid: () => ({ type: "grid", columns: 2, children: [] }),
  table: () => ({ type: "table", dataset: "", columns: [{ id: "col-1", header: "Column", binding: "row.value" }] }),
  repeater: () => ({ type: "repeater", dataset: "", children: [] }),
  qrcode: () => ({ type: "qrcode", value: "https://example.com", width: 70, height: 70 }),
  barcode: () => ({ type: "barcode", value: "123456789012", symbology: "code128", width: 140, height: 40 }),
  chart: () => ({ type: "chart", chartType: "bar", dataset: "", series: [], height: 180 }),
  pageBreak: () => ({ type: "pageBreak" }),
  labelSheet: () => ({ type: "labelSheet", columns: 2, rows: 4, labelWidth: 99.1, labelHeight: 67.7, gapX: 2.5, gapY: 0, copies: 8, children: [] }),
};

/** The dataset a component's `row.` bindings refer to (nearest enclosing repeater/group/table), if any. */
export function rowDatasetAt(doc: Doc, id: string | undefined): string | undefined {
  let loc = id ? find(doc, id) : undefined;
  let own = loc && ["repeater", "group", "table"].includes(loc.comp.type) && (loc.comp.type !== "table") ? loc.comp.dataset : undefined;
  if (own) return own;
  while (loc && !loc.parent.startsWith("section:")) {
    loc = find(doc, loc.parent);
    if (loc && ["repeater", "group"].includes(loc.comp.type) && loc.comp.dataset) return loc.comp.dataset;
  }
  return undefined;
}

/** Wraps sibling components (same list) in a container; the container takes the first one's slot. */
export function group(doc: Doc, ids: string[]): { doc: Doc; id?: string } {
  const locs = ids.map((id) => find(doc, id)).filter(Boolean) as Located[];
  if (locs.length < 1) return { doc };
  const first = locs[0]!;
  if (!locs.every((l) => l.list === first.list || l.parent === first.parent)) return { doc };
  const next = clone(doc);
  const f = find(next, first.comp.id)!;
  const members = ids.map((id) => find(next, id)!).filter(Boolean);
  const sorted = [...members].sort((a, b) => a.index - b.index);
  const container: Comp = { id: genId(next, "container"), type: "container", children: sorted.map((m) => m.comp) };
  for (const m of [...sorted].reverse()) m.list.splice(m.index, 1);
  const slot = Math.min(f.index, f.list.length);
  f.list.splice(slot, 0, container);
  return { doc: next, id: container.id };
}

export function ungroup(doc: Doc, id: string): { doc: Doc; ids: string[] } {
  const loc = find(doc, id);
  if (!loc || !Array.isArray(loc.comp.children)) return { doc, ids: [] };
  const next = clone(doc);
  const l = find(next, id)!;
  const kids: Comp[] = l.comp.children ?? [];
  l.list.splice(l.index, 1, ...kids);
  return { doc: next, ids: kids.map((k) => k.id) };
}

export type MasterKind = "first" | "last" | "odd" | "even" | "standard";

export function masterSections(doc: Doc, type: "pageHeader" | "pageFooter") {
  return (doc.sections ?? []).map((s: any, index: number) => ({ s, index })).filter((x: any) => x.s.type === type);
}

/** Adds a page master (a header or footer that applies to first/last/odd/even/standard pages). */
export function addMaster(doc: Doc, type: "pageHeader" | "pageFooter", appliesTo: MasterKind, empty = false): Doc {
  const next = clone(doc);
  next.sections ??= [];
  if (next.sections.some((s: any) => s.type === type && s.appliesTo === appliesTo)) return doc;
  const standard = next.sections.find((s: any) => s.type === type && (!s.appliesTo || s.appliesTo === "all" || s.appliesTo === "standard"));
  const children = empty || !standard ? [] : clone(standard.children).map((c: Comp) => reId(next, c));
  // headers go before the detail section, footers after it, so the layer tree reads like the page
  const section = { type, appliesTo, children };
  const detail = next.sections.findIndex((s: any) => s.type === "detail");
  if (type === "pageHeader") next.sections.splice(detail < 0 ? 0 : detail, 0, section);
  else next.sections.push(section);
  return next;
}

export function removeSection(doc: Doc, index: number): Doc {
  const next = clone(doc);
  next.sections.splice(index, 1);
  return next;
}

export function sectionLabel(s: { type: string; appliesTo?: string }): string {
  const base: Record<string, string> = {
    reportHeader: "Report header",
    pageHeader: "Page header",
    detail: "Body",
    pageFooter: "Page footer",
    reportFooter: "Report footer",
    groupHeader: "Group header",
    groupFooter: "Group footer",
  };
  const name = base[s.type] ?? s.type;
  return s.appliesTo && s.appliesTo !== "all" ? `${name} · ${s.appliesTo} page${s.appliesTo === "standard" ? "s" : ""}`.replace("first pages", "first page") : name;
}

/** Friendly layer name: explicit name, else something meaningful from the content. */
export function layerName(c: Comp): string {
  if (c.name) return c.name;
  if (c.type === "text") {
    const t = c.binding ?? c.expression ?? String(c.value ?? "");
    return t.length > 28 ? `${t.slice(0, 26)}…` : t || "Text";
  }
  if (c.type === "table") return c.dataset ? `Table · ${c.dataset}` : "Table";
  if (c.type === "image") return "Image";
  if (c.type === "qrcode") return "QR code";
  if (c.type === "barcode") return "Barcode";
  if (c.type === "chart") return `${c.chartType ?? ""} chart`.trim();
  return c.type.charAt(0).toUpperCase() + c.type.slice(1);
}

export function setHidden(doc: Doc, ids: string[], hidden: boolean): Doc {
  let d = doc;
  for (const id of ids) d = update(d, id, { hidden: hidden ? true : undefined });
  return d;
}

export function setLocked(doc: Doc, ids: string[], locked: boolean): Doc {
  let d = doc;
  for (const id of ids) d = update(d, id, { locked: locked ? true : undefined });
  return d;
}
