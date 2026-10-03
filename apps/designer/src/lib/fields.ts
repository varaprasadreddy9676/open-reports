import type { DatasetShape } from "@reporting/schema";

/** Field discovery from sample data or a declared dataset schema. */
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

export function fieldDefinitions(nodes: FieldNode[]): DatasetShape["fields"] {
  return nodes.flatMap((node) => [
    { path: node.path, kind: node.kind },
    ...fieldDefinitions(node.children ?? []),
  ]);
}

function valueAtPath(value: unknown, path: string): unknown {
  for (const key of path.split(".")) {
    if (Array.isArray(value)) value = value.find((item) => item && typeof item === "object") ?? value[0];
    if (value === null || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

export function declaredFields(shape: DatasetShape, sample: unknown): FieldNode[] {
  const roots: FieldNode[] = [];
  const nodes = new Map<string, FieldNode>();
  const explicitFields = new Map(shape.fields.map((field) => [field.path, field]));
  for (const field of shape.fields) {
    const parts = field.path.split(".");
    for (let length = 1; length <= parts.length; length++) {
      const path = parts.slice(0, length).join(".");
      const explicit = explicitFields.get(path);
      const existing = nodes.get(path);
      if (existing) continue;
      const node: FieldNode = {
        name: parts[length - 1]!, path,
        kind: explicit?.kind ?? "object",
        sample: valueAtPath(sample, path),
        children: [],
      };
      nodes.set(path, node);
      if (length === 1) roots.push(node);
      else nodes.get(parts.slice(0, length - 1).join("."))?.children?.push(node);
    }
  }
  return roots;
}

/** Declared fields are stable when a live source returns zero rows; older reports infer from samples. */
export function datasetFields(doc: Record<string, any>, sample: Record<string, unknown>, ref: string): FieldNode[] {
  const [root, ...rest] = ref.split(".");
  const ds = (doc.datasets ?? []).find((item: any) => item.id === root);
  if (ds?.schema) {
    const fields = declaredFields(ds.schema, datasetValue(doc, sample, root ?? ""));
    if (!rest.length) return fields;
    const path = rest.join(".");
    const find = (nodes: FieldNode[]): FieldNode | undefined => {
      for (const node of nodes) {
        if (node.path === path) return node;
        const child = find(node.children ?? []);
        if (child) return child;
      }
    };
    const relative = (nodes: FieldNode[]): FieldNode[] => nodes.map((node) => ({
      ...node,
      path: node.path.slice(path.length + 1),
      children: node.children ? relative(node.children) : undefined,
    }));
    return relative(find(fields)?.children ?? []);
  }
  return inferFields(datasetValue(doc, sample, ref));
}

export function datasetIsArray(doc: Record<string, any>, sample: Record<string, unknown>, ref: string): boolean {
  const [root, ...rest] = ref.split(".");
  const ds = (doc.datasets ?? []).find((item: any) => item.id === root);
  if (ds?.schema) {
    if (!rest.length) return ds.schema.kind === "array";
    const path = rest.join(".");
    return ds.schema.fields.some((field: DatasetShape["fields"][number]) => field.path === path && field.kind === "array");
  }
  return Array.isArray(datasetValue(doc, sample, ref));
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

export function scalarFields(nodes: FieldNode[]): FieldNode[] {
  return nodes.flatMap((node) => node.kind === "object" ? scalarFields(node.children ?? []) : node.kind === "array" ? [] : [node]);
}

/** Value of a dataset reference ("invoice" or "invoice.items") from sample data or inline definition data. */
export function datasetValue(doc: Record<string, any>, sample: Record<string, unknown>, ref: string): unknown {
  const [root, ...rest] = ref.split(".");
  if (!root) return undefined;
  let value: unknown = root in sample ? sample[root] : (doc.datasets ?? []).find((d: any) => d.id === root)?.query?.data;
  for (const key of rest) {
    if (Array.isArray(value)) {
      // A path through a list reads that field from every record; nested lists are joined (orders.lines = all order lines).
      value = value.flatMap((item) => {
        const child = item !== null && typeof item === "object" ? (item as Record<string, unknown>)[key] : undefined;
        return child === undefined ? [] : Array.isArray(child) ? child : [child];
      });
      continue;
    }
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
    if (datasetIsArray(doc, sample, ds.id)) refs.push(ds.id);
    if (!datasetIsArray(doc, sample, ds.id) && (ds.schema || (v && typeof v === "object" && !Array.isArray(v)))) {
      const walk = (node: FieldNode[]) => {
        for (const f of node) {
          if (f.kind === "array") refs.push(`${ds.id}.${f.path}`);
          else if (f.kind === "object" && f.children) walk(f.children);
        }
      };
      walk(datasetFields(doc, sample, ds.id));
    } else if (!Array.isArray(v) && ds.source !== "inline") refs.push(ds.id);
  }
  return refs;
}
