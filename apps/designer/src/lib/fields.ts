/** Field discovery from sample data, for the Data panel and autocomplete. */
export interface FieldNode {
  name: string;
  /** dotted path relative to the dataset root */
  path: string;
  kind: "string" | "number" | "boolean" | "date" | "object" | "array";
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
    return { name, path, kind, children: kind === "object" || kind === "array" ? inferFields(v, path, depth + 1) : undefined };
  });
}

export function flatFieldPaths(nodes: FieldNode[]): string[] {
  return nodes.flatMap((n) => (n.children && n.kind === "object" ? flatFieldPaths(n.children) : n.kind === "array" ? [] : [n.path]));
}
