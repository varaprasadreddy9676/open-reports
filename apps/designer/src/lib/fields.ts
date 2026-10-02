/** Field discovery from sample data, for the Data panel and autocomplete. */
export interface FieldNode {
  name: string;
  /** dotted path relative to the dataset root */
  path: string;
  kind: "string" | "number" | "boolean" | "date" | "object" | "array";
  sample?: unknown;
  children?: FieldNode[];
}

export function inferKind(v: unknown): FieldNode["kind"] {
  if (Array.isArray(v)) return "array";
  if (v !== null && typeof v === "object") return "object";
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}([T ]|$)/.test(v) && !Number.isNaN(Date.parse(v))) return "date";
  return "string";
}

export function inferFields(value: unknown, basePath = "", depth = 0): FieldNode[] {
  let sample: unknown = value;
  if (Array.isArray(value)) sample = value.find((v) => v && typeof v === "object") ?? value[0];
  if (!sample || typeof sample !== "object" || depth > 4) return [];
  return Object.entries(sample as Record<string, unknown>).map(([name, v]) => {
    const path = basePath ? `${basePath}.${name}` : name;
    const kind = inferKind(v);
    return { name, path, kind, sample: v, children: kind === "object" || kind === "array" ? inferFields(v, path, depth + 1) : undefined };
  });
}

/** Keep the ancestors of matching fields so a search result retains its data path. */
export function filterFields(nodes: FieldNode[], query: string, ancestorMatches = false): FieldNode[] {
  const term = query.trim().toLowerCase();
  if (!term || ancestorMatches) return nodes;
  return nodes.flatMap((node) => {
    const matches = `${node.name} ${node.path} ${node.kind}`.toLowerCase().includes(term);
    if (matches) return [node];
    const children = filterFields(node.children ?? [], term);
    return children.length ? [{ ...node, children }] : [];
  });
}

/** Short sample for the narrow data rail; the complete value stays in the title. */
export function fieldSample(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} row${value.length === 1 ? "" : "s"}`;
  if (value !== null && typeof value === "object") return "";
  if (value === undefined) return "";
  return String(value);
}

export function flatFieldPaths(nodes: FieldNode[]): string[] {
  return nodes.flatMap((n) => (n.children && n.kind === "object" ? flatFieldPaths(n.children) : n.kind === "array" ? [] : [n.path]));
}

/** Value of a dataset reference ("invoice" or "invoice.items") from sample data or inline definition data. */
export function datasetValue(doc: Record<string, any>, sample: Record<string, unknown>, ref: string): unknown {
  const [root, ...rest] = ref.split(".");
  if (!root) return undefined;
  let value: unknown = root in sample ? sample[root] : (doc.datasets ?? []).find((d: any) => d.id === root)?.query?.data;
  for (const key of rest) {
    if (value === null || value === undefined || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

/** Every dataset reference usable by a table/repeater: each array dataset plus arrays nested inside object datasets. */
export function arrayRefs(doc: Record<string, any>, sample: Record<string, unknown>): string[] {
  const refs: string[] = [];
  for (const ds of doc.datasets ?? []) {
    const v = datasetValue(doc, sample, ds.id);
    if (Array.isArray(v)) refs.push(ds.id);
    else if (v && typeof v === "object") {
      const walk = (node: FieldNode[]) => {
        for (const f of node) {
          if (f.kind === "array") refs.push(`${ds.id}.${f.path}`);
          else if (f.kind === "object" && f.children) walk(f.children);
        }
      };
      walk(inferFields(v));
    } else if (ds.source !== "inline") refs.push(ds.id);
  }
  return refs;
}
