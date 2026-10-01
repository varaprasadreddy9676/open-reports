import { walkAll, type Doc } from "../model/ops";

export interface Change {
  kind: "added" | "removed" | "changed" | "moved";
  id: string;
  type: string;
  detail: string;
}

const SKIP = new Set(["children", "header", "footer", "otherwise", "id"]);

function props(c: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(c).filter(([k]) => !SKIP.has(k)));
}

function label(c: Record<string, any>): string {
  return c.name ?? (c.type === "text" ? String(c.value ?? c.binding ?? c.expression ?? "").slice(0, 24) || "text" : c.type);
}

/** Structural diff between two report definitions, matched by component id. Used for undo history labels and version comparison. */
export function diffDocs(a: Doc, b: Doc): Change[] {
  const changes: Change[] = [];
  const A = new Map([...walkAll(a)].map((l) => [l.comp.id, l]));
  const B = new Map([...walkAll(b)].map((l) => [l.comp.id, l]));

  for (const [id, l] of B) {
    const before = A.get(id);
    if (!before) {
      changes.push({ kind: "added", id, type: l.comp.type, detail: `Added ${label(l.comp)}` });
      continue;
    }
    const pa = props(before.comp);
    const pb = props(l.comp);
    const keys = new Set([...Object.keys(pa), ...Object.keys(pb)]);
    const diffs: string[] = [];
    for (const k of keys) {
      if (JSON.stringify(pa[k]) !== JSON.stringify(pb[k])) diffs.push(describeProp(k, pa[k], pb[k]));
    }
    if (diffs.length) changes.push({ kind: "changed", id, type: l.comp.type, detail: `${label(l.comp)}: ${diffs.join(", ")}` });
    if (before.parent !== l.parent || before.index !== l.index) {
      if (!diffs.length || before.parent !== l.parent) changes.push({ kind: "moved", id, type: l.comp.type, detail: `Moved ${label(l.comp)}` });
    }
  }
  for (const [id, l] of A) if (!B.has(id)) changes.push({ kind: "removed", id, type: l.comp.type, detail: `Removed ${label(l.comp)}` });

  for (const k of ["name", "page", "theme", "datasets", "parameters", "variables", "locale", "print", "fragments"]) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) changes.push({ kind: "changed", id: k, type: "report", detail: `Report ${k} changed` });
  }
  const sa = (a.sections ?? []).map((s: any) => s.type).join(",");
  const sb = (b.sections ?? []).map((s: any) => s.type).join(",");
  if (sa !== sb) changes.push({ kind: "changed", id: "sections", type: "report", detail: "Sections changed" });
  return changes;
}

function describeProp(key: string, from: unknown, to: unknown): string {
  const short = (v: unknown) => (v === undefined ? "none" : typeof v === "object" ? "…" : String(v).slice(0, 18));
  if (key === "style") return "style changed";
  if (key === "columns") return "columns changed";
  return `${key} ${short(from)} → ${short(to)}`;
}

/** One-line summary for the history list. */
export function summarize(changes: Change[]): string {
  if (changes.length === 0) return "Edited";
  if (changes.length === 1) return changes[0]!.detail;
  const added = changes.filter((c) => c.kind === "added").length;
  const removed = changes.filter((c) => c.kind === "removed").length;
  const changed = changes.length - added - removed;
  const parts = [added && `added ${added}`, removed && `removed ${removed}`, changed && `changed ${changed}`].filter(Boolean);
  return parts.join(", ").replace(/^./, (c) => c.toUpperCase());
}
