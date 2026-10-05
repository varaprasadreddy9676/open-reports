import * as ops from "../model/ops";

const ids = (list: ops.Comp[] | undefined): string[] => (list ?? []).map((comp) => comp.id).filter(Boolean);
const unique = (values: string[]): string[] => [...new Set(values)];

/** Shift+Enter: the containers holding the selection. Band-level elements have no parent to select. */
export function parentSelection(doc: ops.Doc, selection: string[]): string[] {
  return unique(selection.map((id) => ops.find(doc, id)?.parent).filter((parent): parent is string => Boolean(parent) && !parent!.startsWith("section:")));
}

/** Enter: the direct children of the selected containers. */
export function childSelection(doc: ops.Doc, selection: string[]): string[] {
  return unique(selection.flatMap((id) => ids(ops.find(doc, id)?.comp.children)));
}

/**
 * Tab / Shift+Tab: the next or previous element at the same level. Stops at the ends (no wrap-around),
 * so a further Tab leaves the canvas and keyboard users are never trapped.
 */
export function siblingSelection(doc: ops.Doc, id: string, direction: 1 | -1): string | undefined {
  const located = ops.find(doc, id);
  return located?.list[located.index + direction]?.id;
}

/** ⌘A: everything at the selection's level, or the top level of every band when nothing is selected. */
export function levelSelection(doc: ops.Doc, selection: string[]): string[] {
  const located = selection.length ? ops.find(doc, selection[0]!) : undefined;
  if (located) return ids(located.list);
  return (doc.sections ?? []).flatMap((section: { children?: ops.Comp[] }) => ids(section.children));
}

export type ReorderMode = "forward" | "backward" | "front" | "back";

/** Later siblings paint on top, so "forward" moves an element later in its list. */
export function reorder(doc: ops.Doc, selection: string[], mode: ReorderMode): ops.Doc {
  const next = ops.clone(doc);
  let changed = false;
  const byList = new Map<ops.Comp[], number[]>();
  for (const id of selection) {
    const located = ops.find(next, id);
    if (located) byList.set(located.list, [...(byList.get(located.list) ?? []), located.index]);
  }
  for (const [list, indexes] of byList) {
    const before = ids(list).join("|");
    const picked = new Set(indexes);
    if (mode === "front" || mode === "back") {
      const moving = list.filter((_, index) => picked.has(index));
      const staying = list.filter((_, index) => !picked.has(index));
      list.splice(0, list.length, ...(mode === "front" ? [...staying, ...moving] : [...moving, ...staying]));
    } else {
      const step = mode === "forward" ? 1 : -1;
      // Walk from the leading edge so a block of selected elements moves together.
      const sorted = [...indexes].sort((a, b) => (step > 0 ? b - a : a - b));
      const moved = new Set<number>();
      for (const index of sorted) {
        const target = index + step;
        if (target < 0 || target >= list.length || (picked.has(target) && !moved.has(target))) {
          moved.add(index);
          continue;
        }
        [list[index], list[target]] = [list[target]!, list[index]!];
        picked.delete(index);
        picked.add(target);
        moved.add(target);
      }
    }
    if (ids(list).join("|") !== before) changed = true;
  }
  return changed ? next : doc;
}
