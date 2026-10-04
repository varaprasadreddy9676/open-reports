import { resolveBandRef, summarizeBandChanges } from "./bands.js";

/** RFC 6902 JSON Patch with one extension that makes it safe for AI: paths may start with `#<componentId>` instead of array indexes.
 *  `#company/style/color` addresses the component whose id is "company". Indexes shift when anything is inserted; ids do not. */

export type PatchOp =
  | { op: "add" | "replace" | "test"; path: string; value: unknown }
  | { op: "remove"; path: string }
  | { op: "move" | "copy"; from: string; path: string };

export interface PatchResult {
  ok: boolean;
  doc: any;
  /** One entry per failed op (patching stops at the first failure and returns the ORIGINAL document). */
  errors: { index: number; message: string }[];
  /** Human-readable list of what changed. */
  changes: string[];
}

const LISTS = ["children", "header", "footer", "otherwise", "sections"];

function findById(node: any, id: string, pointer: string): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  if (typeof node.id === "string" && node.id === id && pointer !== "") return pointer;
  for (const key of LISTS) {
    const list = node[key];
    if (!Array.isArray(list)) continue;
    for (let i = 0; i < list.length; i++) {
      const found = findById(list[i], id, `${pointer}/${key}/${i}`);
      if (found) return found;
    }
  }
  // sections may carry ids too; fragments hold component lists
  if (Array.isArray(node.fragments)) {
    for (let i = 0; i < node.fragments.length; i++) {
      const f = node.fragments[i];
      for (let j = 0; j < (f.children ?? []).length; j++) {
        const found = findById(f.children[j], id, `${pointer}/fragments/${i}/children/${j}`);
        if (found) return found;
      }
    }
  }
  return undefined;
}

/** `#id/rest` -> `/sections/0/children/2/rest`; `@groupFooter:byRegion/rest` -> `/sections/6/rest` (see bands.ts). Plain pointers pass through unchanged. */
export function resolvePointer(doc: unknown, path: string): string {
  if (path.startsWith("@")) {
    const slash = path.indexOf("/");
    const ref = decodeURIComponent(slash < 0 ? path : path.slice(0, slash));
    const index = resolveBandRef(((doc as any)?.sections ?? []) as any[], ref);
    return `/sections/${index}${slash < 0 ? "" : path.slice(slash)}`;
  }
  if (!path.startsWith("#")) return path;
  const slash = path.indexOf("/");
  const id = decodeURIComponent(slash < 0 ? path.slice(1) : path.slice(1, slash));
  const base = findById(doc, id, "");
  if (base === undefined) throw new Error(`No component with id "${id}".`);
  return base + (slash < 0 ? "" : path.slice(slash));
}

function parse(pointer: string): string[] {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) throw new Error(`Invalid path "${pointer}" (must start with "/" or "#id").`);
  return pointer.slice(1).split("/").map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
}

const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);

function walk(doc: any, segments: string[], create = false): { parent: any; key: string } {
  let cur = doc;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    if (FORBIDDEN.has(seg)) throw new Error(`Path segment "${seg}" is not allowed.`);
    const next = Array.isArray(cur) ? cur[Number(seg)] : cur?.[seg];
    if (next === undefined || next === null) {
      if (!create) throw new Error(`Path does not exist at "${segments.slice(0, i + 1).join("/")}".`);
      cur[seg] = {};
      cur = cur[seg];
    } else cur = next;
  }
  const key = segments[segments.length - 1]!;
  if (FORBIDDEN.has(key)) throw new Error(`Path segment "${key}" is not allowed.`);
  return { parent: cur, key };
}

function get(doc: any, pointer: string): unknown {
  let cur = doc;
  for (const seg of parse(pointer)) cur = Array.isArray(cur) ? cur[Number(seg)] : cur?.[seg];
  return cur;
}

function addAt(parent: any, key: string, value: unknown) {
  if (Array.isArray(parent)) {
    const idx = key === "-" ? parent.length : Number(key);
    if (!Number.isInteger(idx) || idx < 0 || idx > parent.length) throw new Error(`Index "${key}" is out of range.`);
    parent.splice(idx, 0, value);
  } else parent[key] = value;
}

function removeAt(parent: any, key: string): unknown {
  if (Array.isArray(parent)) {
    const idx = Number(key);
    if (!Number.isInteger(idx) || idx < 0 || idx >= parent.length) throw new Error(`Index "${key}" is out of range.`);
    return parent.splice(idx, 1)[0];
  }
  if (!(key in parent)) throw new Error(`Property "${key}" does not exist.`);
  const v = parent[key];
  delete parent[key];
  return v;
}

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export function applyPatch(original: unknown, ops: PatchOp[]): PatchResult {
  const doc: any = clone(original);
  const changes: string[] = [];
  try {
    ops.forEach((op, index) => {
      try {
        const path = resolvePointer(doc, op.path);
        const segs = parse(path);
        if (segs.length === 0) throw new Error("Replacing the whole document is not allowed; patch specific paths.");
        const { parent, key } = walk(doc, segs, op.op === "add" || op.op === "replace");
        switch (op.op) {
          case "add":
            addAt(parent, key, clone(op.value));
            changes.push(`add ${path}`);
            break;
          case "replace": {
            if (Array.isArray(parent) ? Number(key) >= parent.length : !(key in parent)) throw new Error(`Cannot replace "${path}": it does not exist (use add).`);
            parent[Array.isArray(parent) ? Number(key) : key] = clone(op.value);
            changes.push(`replace ${path}`);
            break;
          }
          case "remove":
            removeAt(parent, key);
            changes.push(`remove ${path}`);
            break;
          case "test":
            if (JSON.stringify(get(doc, path)) !== JSON.stringify(op.value)) throw new Error(`Test failed at "${path}".`);
            break;
          case "copy":
          case "move": {
            const from = resolvePointer(doc, op.from);
            const value = clone(get(doc, from));
            if (value === undefined) throw new Error(`"from" path "${from}" does not exist.`);
            if (op.op === "move") {
              const f = walk(doc, parse(from));
              removeAt(f.parent, f.key);
            }
            const t = walk(doc, parse(resolvePointer(doc, op.path)), true);
            addAt(t.parent, t.key, value);
            changes.push(`${op.op} ${from} -> ${path}`);
            break;
          }
          default:
            throw new Error(`Unknown op "${(op as any).op}".`);
        }
      } catch (e) {
        throw Object.assign(new Error((e as Error).message), { index });
      }
    });
  } catch (e) {
    return { ok: false, doc: original, errors: [{ index: (e as any).index ?? 0, message: (e as Error).message }], changes: [] };
  }
  assignMissingIds(doc);
  return { ok: true, doc, errors: [], changes };
}

/** New components added by a patch get stable ids so later patches can address them. */
export function assignMissingIds(doc: any): void {
  const seen = new Set<string>();
  const collect = (n: any) => {
    if (!n || typeof n !== "object") return;
    if (typeof n.id === "string") seen.add(n.id);
    for (const k of LISTS) if (Array.isArray(n[k])) n[k].forEach(collect);
  };
  collect(doc);
  for (const f of doc.fragments ?? []) (f.children ?? []).forEach(collect);
  let counter = 1;
  const fix = (n: any) => {
    if (!n || typeof n !== "object") return;
    if (typeof n.type === "string" && n.type !== "detail" && !n.id && !String(n.type).startsWith("page") && !String(n.type).endsWith("Header") && !String(n.type).endsWith("Footer")) {
      let id: string;
      do id = `${n.type}-${counter++}`;
      while (seen.has(id));
      n.id = id;
      seen.add(id);
    }
    for (const k of ["children", "header", "footer", "otherwise"]) if (Array.isArray(n[k])) n[k].forEach(fix);
  };
  for (const s of doc.sections ?? []) (s.children ?? []).forEach(fix);
  for (const f of doc.fragments ?? []) (f.children ?? []).forEach(fix);
}

/** Component-level summary of two documents, for showing "what the AI changed". */
export function summarizeChanges(before: any, after: any): string[] {
  // Components only: bands are compared by reference below.
  const index = (doc: any) => {
    const m = new Map<string, any>();
    const walkNode = (n: any) => {
      if (!n || typeof n !== "object") return;
      if (typeof n.id === "string" && n.type) m.set(n.id, n);
      for (const k of LISTS) if (Array.isArray(n[k])) n[k].forEach(walkNode);
    };
    for (const section of doc?.sections ?? []) (section.children ?? []).forEach(walkNode);
    for (const fragment of doc?.fragments ?? []) (fragment.children ?? []).forEach(walkNode);
    return m;
  };
  const a = index(before);
  const b = index(after);
  const out: string[] = [];
  for (const [id, n] of b) {
    const old = a.get(id);
    if (!old) out.push(`added ${n.type} "${id}"`);
    else {
      const props = new Set([...Object.keys(old), ...Object.keys(n)]);
      const diff = [...props].filter((k) => !LISTS.includes(k) && JSON.stringify(old[k]) !== JSON.stringify(n[k]));
      if (diff.length) out.push(`changed ${n.type} "${id}": ${diff.join(", ")}`);
    }
  }
  for (const [id, n] of a) if (!b.has(id)) out.push(`removed ${n.type} "${id}"`);
  out.push(...summarizeBandChanges(before, after));
  for (const k of ["name", "page", "theme", "datasets", "parameters", "variables", "groups", "locale", "print", "fragments"]) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) out.push(`changed report ${k}`);
  }
  return out;
}
