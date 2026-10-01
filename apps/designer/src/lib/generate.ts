import { inferFields, inferKind, type FieldNode } from "./fields";
import { titleCase } from "./lowcode";
import type { Comp, Doc } from "../model/ops";

const MONEY = /amount|price|total|rate|cost|balance|fee|tax|charge/i;

function formatFor(node: FieldNode): string | undefined {
  if (node.kind === "date") return "date:dd MMM yyyy";
  if (node.kind === "number" && MONEY.test(node.name)) return "currency";
  return undefined;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report";
}

/** Data -> report: infers datasets, label/value blocks for objects, and tables for arrays. No AI involved -- deterministic heuristics. */
export function generateReportFromJson(json: unknown, name = "New report"): Doc {
  const datasets: any[] = [];
  const body: Comp[] = [{ type: "text", value: name, style: { fontSize: 20, fontWeight: "bold" } }, { type: "spacer", height: 10 }];

  const roots: Record<string, unknown> = Array.isArray(json) ? { data: json } : json && typeof json === "object" ? (json as Record<string, unknown>) : { data: [] };

  for (const [key, value] of Object.entries(roots)) {
    if (inferKind(value) === "object" || inferKind(value) === "array") {
      datasets.push({ id: key, source: "inline", query: { data: value } });
    }
  }

  for (const [key, value] of Object.entries(roots)) {
    const kind = inferKind(value);
    if (kind === "array") {
      body.push(...tableFor(key, key, value));
    } else if (kind === "object") {
      body.push({ type: "text", value: titleCase(key), style: { fontSize: 12, fontWeight: "bold", color: "#374151" }, keepWithNext: true });
      for (const f of inferFields(value).filter((x) => x.kind !== "array" && x.kind !== "object").slice(0, 14)) {
        body.push({
          type: "row",
          children: [
            { type: "text", value: titleCase(f.name), width: 110, style: { color: "#6b7280" } },
            { type: "text", binding: `data.${key}.${f.path}`, format: formatFor(f) },
          ],
        });
      }
      for (const f of inferFields(value).filter((x) => x.kind === "array")) body.push({ type: "spacer", height: 8 }, ...tableFor(`${key}.${f.path}`, f.name, (value as any)[f.path]));
      for (const f of inferFields(value).filter((x) => x.kind === "object")) {
        body.push({ type: "text", value: titleCase(f.name), style: { fontWeight: "bold", color: "#374151" }, keepWithNext: true });
        for (const c of (f.children ?? []).filter((x) => x.kind !== "array" && x.kind !== "object").slice(0, 10)) {
          body.push({ type: "row", children: [{ type: "text", value: titleCase(c.name), width: 110, style: { color: "#6b7280" } }, { type: "text", binding: `data.${key}.${c.path}` }] });
        }
      }
      body.push({ type: "spacer", height: 10 });
    }
  }

  return {
    schemaVersion: "1.0",
    id: slug(name),
    name,
    page: { size: "A4", orientation: "portrait", unit: "mm", margin: { top: 15, right: 15, bottom: 18, left: 15 } },
    datasets,
    sections: [
      { type: "detail", children: body },
      { type: "pageFooter", children: [{ type: "text", expression: '"Page " + page.number + " of " + page.total', style: { align: "right", fontSize: 8, color: "#6b7280" } }] },
    ],
  };
}

export function tableFor(datasetRef: string, title: string, rows: unknown): Comp[] {
  const fields = inferFields(rows).filter((f) => f.kind !== "array" && f.kind !== "object");
  return [
    { type: "text", value: titleCase(title), style: { fontSize: 12, fontWeight: "bold", color: "#374151" }, keepWithNext: true },
    {
      type: "table",
      dataset: datasetRef,
      alternateRowStyle: true,
      columns: fields.slice(0, 8).map((f) => ({
        id: f.name,
        header: titleCase(f.name),
        binding: `row.${f.path}`,
        format: formatFor(f),
        align: f.kind === "number" ? "right" : undefined,
        width: f === fields[0] ? "*" : undefined,
      })),
    },
  ];
}
