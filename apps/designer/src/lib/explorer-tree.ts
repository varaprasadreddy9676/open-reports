export type ExplorerNode =
  | { kind: "band"; index: number }
  | { kind: "group"; id: string; children: ExplorerNode[] };

interface GroupSpan {
  id: string;
  order: number;
  start: number;
  end: number;
  node: Extract<ExplorerNode, { kind: "group" }>;
  parent?: GroupSpan;
}

const ROOT_BANDS = new Set(["reportHeader", "reportFooter", "pageHeader", "pageFooter", "background", "dataHeader", "dataFooter", "noData", "columnHeader", "columnFooter"]);
const END_OF_REGION = new Set(["reportHeader", "dataHeader", "dataFooter", "noData", "reportFooter"]);

/** Groups bands under their owning group without changing report section order. */
export function explorerTree(sections: { type: string; groupId?: string }[], groups: { id: string }[]): ExplorerNode[] {
  const spans: GroupSpan[] = groups.map((group, order) => {
    const headers = sections.flatMap((section, index) => section.type === "groupHeader" && section.groupId === group.id ? [index] : []);
    const footers = sections.flatMap((section, index) => section.type === "groupFooter" && section.groupId === group.id ? [index] : []);
    const own = [...headers, ...footers];
    let start = own.length ? Math.min(...own) : sections.length + order;
    let end = own.length ? Math.max(...own) : start;
    if (headers.length && !footers.length) {
      const boundary = sections.findIndex((section, index) => index > start && END_OF_REGION.has(section.type));
      end = boundary < 0 ? sections.length - 1 : boundary - 1;
    } else if (footers.length && !headers.length) {
      for (let index = start - 1; index >= 0; index--) {
        if (END_OF_REGION.has(sections[index]!.type)) { start = index + 1; break; }
        start = index;
      }
    }
    return { id: group.id, order, start, end, node: { kind: "group", id: group.id, children: [] } };
  });

  for (const span of spans) {
    const containers = spans.filter((outer) => outer !== span && outer.order < span.order && outer.start <= span.start && outer.end >= span.end && (outer.start < span.start || outer.end > span.end));
    span.parent = containers.sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
  }

  const entries = new Map<ExplorerNode[], { key: number; order: number; node: ExplorerNode }[]>();
  const root: ExplorerNode[] = [];
  const add = (parent: ExplorerNode[], key: number, order: number, node: ExplorerNode) => entries.set(parent, [...(entries.get(parent) ?? []), { key, order, node }]);
  for (const span of spans) add(span.parent?.node.children ?? root, span.start, span.order, span.node);

  sections.forEach((section, index) => {
    const explicit = spans.find((span) => span.id === section.groupId);
    const owner = explicit ?? (!ROOT_BANDS.has(section.type) ? spans
      .filter((span) => span.start <= index && index <= span.end)
      .sort((a, b) => (a.end - a.start) - (b.end - b.start) || b.order - a.order)[0] : undefined);
    add(owner?.node.children ?? root, index, groups.length + index, { kind: "band", index });
  });

  const fill = (target: ExplorerNode[]) => {
    target.push(...(entries.get(target) ?? []).sort((a, b) => a.key - b.key || a.order - b.order).map((entry) => entry.node));
    for (const node of target) if (node.kind === "group") fill(node.children);
  };
  fill(root);
  return root;
}
