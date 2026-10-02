import type { Doc } from "../model/ops";
import { arrayRefs, datasetFields, datasetValue, type FieldNode } from "./fields";

export interface StressOptions {
  longText?: boolean;
  nulls?: boolean;
  negativeNumbers?: boolean;
  multilingual?: boolean;
  manyGroups?: boolean;
}

const sampleValue = (kind: FieldNode["kind"]): unknown => {
  if (kind === "number") return 1;
  if (kind === "boolean") return false;
  if (kind === "date") return "2026-01-01";
  if (kind === "array") return [];
  return kind === "object" ? {} : "Sample";
};

function seedFromFields(fields: FieldNode[]): Record<string, unknown> | undefined {
  if (!fields.length) return undefined;
  const create = (nodes: FieldNode[]): Record<string, unknown> => Object.fromEntries(nodes.map((node) => [
    node.name, node.kind === "object" ? create(node.children ?? []) : sampleValue(node.kind),
  ]));
  return create(fields);
}

function stressRow(row: unknown, index: number, opts: StressOptions): unknown {
  if (Array.isArray(row)) return row.map((value) => stressRow(value, index, opts));
  if (!row || typeof row !== "object") {
    if (typeof row === "string") return index % 3 === 0 ? `${row}${opts.multilingual ? " తెలుగు हिन्दी ಕನ್ನಡ தமிழ் العربية" : ""}${opts.longText ? ` — ${"Long clinical description. ".repeat(8)}` : ""}` : row;
    if (typeof row === "number" && opts.negativeNumbers && index % 3 === 0) return -Math.max(1, Math.abs(row));
    return row;
  }
  let nulled = false;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
    if (opts.manyGroups && /^(department|group|category)$/i.test(key) && typeof value === "string") {
      result[key] = `Group ${index % 12 + 1}`;
    } else if (opts.nulls && index % 7 === 1 && !nulled && value !== null && typeof value !== "object") {
      result[key] = null;
      nulled = true;
    } else {
      result[key] = stressRow(value, index, opts);
    }
  }
  return result;
}

/** Builds disposable scenario data. The report definition and the editor's sample remain untouched. */
export function makeScenarioSample(doc: Doc, sample: Record<string, unknown>, ref: string, count: number, stress: StressOptions = {}): Record<string, unknown> {
  if (!Number.isInteger(count) || count < 0 || count > 1000) throw new Error("Choose between 0 and 1,000 records.");
  if (!arrayRefs(doc, sample).includes(ref)) throw new Error(`"${ref}" is not an array dataset in this report.`);
  const [root, ...parts] = ref.split(".");
  const original = datasetValue(doc, sample, root!);
  const rootValue: unknown = structuredClone(original ?? (parts.length ? {} : []));
  let parent: Record<string, unknown> | undefined;
  let current = rootValue;
  for (const [position, part] of parts.entries()) {
    if (!current || typeof current !== "object" || Array.isArray(current)) throw new Error(`Cannot reach "${ref}" in the sample data.`);
    parent = current as Record<string, unknown>;
    current = parent[part];
    if (current === undefined && position < parts.length - 1) parent[part] = current = {};
  }
  if (current !== undefined && !Array.isArray(current)) throw new Error(`"${ref}" is not an array in the sample data.`);
  const sourceRows = (current ?? []) as unknown[];
  const seed = sourceRows[0] ?? seedFromFields(datasetFields(doc, sample, ref));
  if (count > 0 && seed === undefined) throw new Error("Add one sample record or define dataset fields before generating records.");
  const rows = Array.from({ length: count }, (_, index) => stressRow(structuredClone(sourceRows[index % Math.max(1, sourceRows.length)] ?? seed), index, stress));
  if (parent) parent[parts.at(-1)!] = rows;
  return { ...sample, [root!]: parent ? rootValue : rows };
}
