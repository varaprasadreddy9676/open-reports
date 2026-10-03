import * as ops from "../model/ops";
import { datasetFields, datasetIsArray, type FieldNode } from "./fields";
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
  if (rowDs && /^(row|parent|group)(\.|$)/.test(rowDs)) {
    // A nested list: resolve it through the row contexts around it, and offer the enclosing record as parent.*.
    const chain = tableDataset ? [tableDataset, ...ops.rowContextChain(doc, id)] : ops.rowContextChain(doc, id);
    const absolute = ops.absoluteSource(chain);
    if (absolute) leafPaths(datasetFields(doc, sample, absolute), "row.", "This row", "", out);
    const parent = ops.absoluteSource(chain.slice(1));
    if (parent) leafPaths(datasetFields(doc, sample, parent), "parent.", "Parent row", "Parent › ", out);
  } else if (rowDs) {
    leafPaths(datasetFields(doc, sample, rowDs), "row.", "This row", "", out);
  }
  for (const ds of doc.datasets ?? []) {
    if (!datasetIsArray(doc, sample, ds.id)) leafPaths(datasetFields(doc, sample, ds.id), `data.${ds.id}.`, titleCase(ds.id), `${titleCase(ds.id)} › `, out);
  }
  for (const p of doc.parameters ?? []) out.push({ value: `params.${p.id}`, label: titleCase(p.id), group: "Parameters" });
  for (const v of doc.variables ?? []) out.push({ value: `vars.${v.id}`, label: titleCase(v.id), group: "Variables" });
  out.push({ value: "page.number", label: "Page number", group: "Page" }, { value: "page.total", label: "Total pages", group: "Page" });
  return out;
}

export const FUNCTION_CANDIDATES: Candidate[] = FUNCTIONS.map((f) => ({ value: `${f}(`, label: f, group: "Functions" }));
