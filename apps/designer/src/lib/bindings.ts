import * as ops from "../model/ops";
import { datasetValue, inferFields, type FieldNode } from "./fields";
import { FUNCTIONS, titleCase } from "./lowcode";

export interface Candidate {
  value: string;
  label: string;
  group: string;
  kind?: string;
}

function leafPaths(nodes: FieldNode[], prefix: string, group: string, label: string, out: Candidate[]) {
  for (const n of nodes) {
    if (n.kind === "object" && n.children) leafPaths(n.children, prefix, group, label, out);
    else if (n.kind !== "array") out.push({ value: `${prefix}${n.path}`, label: `${label}${titleCase(n.name)}`, group, kind: n.kind });
  }
}

/** Everything a binding or formula at component `id` may legally reference, with friendly labels. */
export function candidatesFor(doc: ops.Doc, sample: Record<string, unknown>, id?: string, tableDataset?: string): Candidate[] {
  const out: Candidate[] = [];
  const rowDs = tableDataset ?? ops.rowDatasetAt(doc, id);
  if (rowDs) {
    const rows = datasetValue(doc, sample, rowDs);
    leafPaths(inferFields(rows), "row.", "This row", "", out);
  }
  for (const ds of doc.datasets ?? []) {
    const v = datasetValue(doc, sample, ds.id);
    if (v && typeof v === "object" && !Array.isArray(v)) leafPaths(inferFields(v), `data.${ds.id}.`, titleCase(ds.id), `${titleCase(ds.id)} › `, out);
  }
  for (const p of doc.parameters ?? []) out.push({ value: `params.${p.id}`, label: titleCase(p.id), group: "Parameters" });
  for (const v of doc.variables ?? []) out.push({ value: `vars.${v.id}`, label: titleCase(v.id), group: "Variables" });
  out.push({ value: "page.number", label: "Page number", group: "Page" }, { value: "page.total", label: "Total pages", group: "Page" });
  return out;
}

export const FUNCTION_CANDIDATES: Candidate[] = FUNCTIONS.map((f) => ({ value: `${f}(`, label: f, group: "Functions" }));
