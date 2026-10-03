import * as ops from "../model/ops";
import type { ExplorerNode } from "./explorer-tree";

/** Search the report hierarchy without changing its expanded state or definition. */
export function searchExplorer(doc: ops.Doc, tree: ExplorerNode[], rawQuery: string) {
  const query = rawQuery.trim().toLocaleLowerCase();
  const groups = new Set<string>();
  const bands = new Set<number>();
  const components = new Set<string>();
  const matchedGroups = new Set<string>();
  const matchedBands = new Set<number>();
  const matchedComponents = new Set<string>();
  let count = 0;
  const matches = (...values: unknown[]) => values.some((value) => value != null && String(value).toLocaleLowerCase().includes(query));

  const visitComponent = (comp: ops.Comp): boolean => {
    const direct = matches(comp.name, ops.layerName(comp), comp.type, comp.binding, comp.dataset, comp.value, comp.expression);
    if (direct) { matchedComponents.add(comp.id); count += 1; }
    let child = false;
    for (const key of ops.CHILD_LISTS) for (const nested of Array.isArray(comp[key]) ? comp[key] : []) if (visitComponent(nested)) child = true;
    if (direct || child) components.add(comp.id);
    return direct || child;
  };

  const visitNode = (node: ExplorerNode): boolean => {
    if (node.kind === "band") {
      const band = doc.sections?.[node.index];
      if (!band) return false;
      const direct = matches(band.name, ops.bandDisplayName(doc, band), band.type, ops.BAND_CODES[band.type]);
      if (direct) { matchedBands.add(node.index); count += 1; }
      let child = false;
      for (const comp of band.children ?? []) if (visitComponent(comp)) child = true;
      if (direct || child) bands.add(node.index);
      return direct || child;
    }
    const group = (doc.groups ?? []).find((entry: { id: string }) => entry.id === node.id);
    const direct = !!group && matches(group.name, group.id, group.by, group.dataset);
    if (direct) { matchedGroups.add(node.id); count += 1; }
    let child = false;
    for (const nested of node.children) if (visitNode(nested)) child = true;
    if (direct || child) groups.add(node.id);
    return direct || child;
  };

  tree.forEach(visitNode);
  return { groups, bands, components, matchedGroups, matchedBands, matchedComponents, count };
}

export type ExplorerSearch = ReturnType<typeof searchExplorer>;
