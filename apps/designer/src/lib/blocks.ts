import * as ops from "../model/ops";
import type { Comp, Doc } from "../model/ops";

export type BlockMode = "linked" | "pinned" | "detached";
export interface LibraryBlock {
  id: string;
  name: string;
  version: number;
  children: Comp[];
}
type Fragment = { id: string; name?: string; source?: { block: string; version: number; mode: "linked" | "pinned" }; children: Comp[] };

const fragmentsOf = (doc: Doc): Fragment[] => (doc.fragments ?? []) as Fragment[];

function uniqueFragmentId(doc: Doc, base: string): string {
  const taken = new Set(fragmentsOf(doc).map((f) => f.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Number of fragment components in the report that use a fragment definition. */
export function fragmentUses(doc: Doc, fragmentId: string): number {
  return [...ops.walkAll(doc)].filter((l) => l.comp.type === "fragment" && l.comp.ref === fragmentId).length;
}

/**
 * Places a library block. Detached copies its components; linked and pinned reuse (or add) a report fragment that keeps
 * the block's source and a snapshot, and insert a reference to it.
 */
export function placeBlock(doc: Doc, block: LibraryBlock, mode: BlockMode, targetId?: string): { doc: Doc; ids: string[] } {
  if (mode === "detached") {
    let next = doc;
    let target = targetId;
    const ids: string[] = [];
    for (const component of block.children) {
      const copy = ops.reId(next, structuredClone(component));
      next = ops.insert(next, copy, target, "after");
      target = copy.id;
      ids.push(copy.id);
    }
    return { doc: next, ids };
  }
  const existing = fragmentsOf(doc).find((f) => f.source?.block === block.id && f.source.mode === mode && (mode === "linked" || f.source.version === block.version));
  let next = doc;
  let ref = existing?.id;
  if (!ref) {
    ref = uniqueFragmentId(doc, mode === "pinned" ? `${block.id}-v${block.version}` : block.id);
    const fragment: Fragment = { id: ref, name: block.name, source: { block: block.id, version: block.version, mode }, children: structuredClone(block.children) };
    next = { ...doc, fragments: [...fragmentsOf(doc), fragment] };
  }
  const component = { type: "fragment", ref, name: block.name };
  const inserted = ops.insert(next, component, targetId, "after");
  const id = [...ops.walkAll(inserted)].map((l) => l.comp).find((c) => c.type === "fragment" && c.ref === ref && ![...ops.walkAll(next)].some((l) => l.comp.id === c.id))?.id;
  return { doc: inserted, ids: id ? [id] : [] };
}

/** Brings linked fragments up to the library's latest versions; returns the names of the blocks that changed. */
export function syncLinkedBlocks(doc: Doc, library: LibraryBlock[]): { doc: Doc; updated: string[] } {
  const updated: string[] = [];
  const fragments = fragmentsOf(doc).map((fragment) => {
    if (fragment.source?.mode !== "linked") return fragment;
    const latest = library.find((block) => block.id === fragment.source!.block);
    if (!latest || latest.version <= fragment.source.version) return fragment;
    updated.push(latest.name);
    return { ...fragment, children: structuredClone(latest.children), source: { ...fragment.source, version: latest.version } };
  });
  return updated.length ? { doc: { ...doc, fragments }, updated } : { doc, updated };
}

/** Switches every use of a fragment between linked (following the latest version) and pinned (staying on its version). */
export function setFragmentMode(doc: Doc, fragmentId: string, mode: "linked" | "pinned", latest?: LibraryBlock): Doc {
  return {
    ...doc,
    fragments: fragmentsOf(doc).map((fragment) => {
      if (fragment.id !== fragmentId || !fragment.source) return fragment;
      if (mode === "linked" && latest && latest.version > fragment.source.version) {
        return { ...fragment, children: structuredClone(latest.children), source: { ...fragment.source, mode, version: latest.version } };
      }
      return { ...fragment, source: { ...fragment.source, mode } };
    }),
  };
}

/** Moves a pinned fragment to a library version (usually the latest), keeping it pinned. */
export function pinToVersion(doc: Doc, fragmentId: string, block: LibraryBlock): Doc {
  return {
    ...doc,
    fragments: fragmentsOf(doc).map((fragment) => (fragment.id === fragmentId && fragment.source
      ? { ...fragment, children: structuredClone(block.children), source: { ...fragment.source, version: block.version } }
      : fragment)),
  };
}

/** Replaces one fragment use with independent copies of its components; the fragment is removed when nothing uses it. */
export function detachFragmentUse(doc: Doc, componentId: string): { doc: Doc; ids: string[] } {
  const located = ops.find(doc, componentId);
  if (!located || located.comp.type !== "fragment") return { doc, ids: [] };
  const fragment = fragmentsOf(doc).find((f) => f.id === located.comp.ref);
  if (!fragment) return { doc, ids: [] };
  let next = doc;
  let target = componentId;
  const ids: string[] = [];
  for (const component of fragment.children) {
    const copy = ops.reId(next, structuredClone(component));
    next = ops.insert(next, copy, target, "after");
    target = copy.id;
    ids.push(copy.id);
  }
  next = ops.remove(next, [componentId]);
  if (fragmentUses(next, fragment.id) === 0) next = { ...next, fragments: fragmentsOf(next).filter((f) => f.id !== fragment.id) };
  return { doc: next, ids };
}
