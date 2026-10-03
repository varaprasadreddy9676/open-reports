import type { Doc } from "../model/ops";

export interface RowCoveragePlan {
  field: string;
  markers: string[];
  componentId?: string;
  bandIndex: number;
}

/** Adds temporary IDs to a plain text table column in disposable test data. */
export function markTableRows(doc: Doc, scenario: Record<string, unknown>, ref: string): RowCoveragePlan | undefined {
  const [root, ...parts] = ref.split(".");
  let value: unknown = scenario[root!];
  for (const part of parts) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    value = (value as Record<string, unknown>)[part];
  }
  if (!Array.isArray(value) || !value.length) return;
  const rows = value as unknown[];
  const findField = (children: any[]): { field: string; componentId?: string } | undefined => {
    for (const child of children) {
      if (child.hidden || child.visibleWhen) continue;
      if (child.type === "table" && child.dataset === ref && !child.filterWhen && !child.groupBy && !child.cellSpans?.length) {
        for (const column of child.columns ?? []) {
          const match = /^row\.([A-Za-z_$][\w$]*)$/.exec(column.binding ?? "");
          if (match && !column.expression && rows.some((row) => row && typeof row === "object" && typeof (row as Record<string, unknown>)[match[1]!] === "string")) return { field: match[1]!, componentId: child.id };
        }
      }
      const nested = findField(child.children ?? []);
      if (nested) return nested;
    }
  };
  const source = (doc.sections ?? []).flatMap((section: any, bandIndex: number) => {
    if (section.hidden || section.visibleWhen) return [];
    const found = findField(section.children ?? []);
    return found ? [{ ...found, bandIndex }] : [];
  })[0];
  if (!source) return;
  const { field, componentId, bandIndex } = source;
  const markers: string[] = [];
  rows.forEach((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return;
    const record = row as Record<string, unknown>;
    if (typeof record[field] !== "string") return;
    const marker = `ORROW${String(index + 1).padStart(5, "0")}`;
    record[field] = `${record[field]} ${marker}`;
    markers.push(marker);
  });
  return markers.length ? { field, markers, componentId, bandIndex } : undefined;
}

export function compareRowMarkers(pageTexts: string[], plan: RowCoveragePlan): { found: number; total: number; missing: string[] } {
  const text = pageTexts.join("").replace(/\s+/g, "");
  const missing = plan.markers.filter((marker) => !text.includes(marker));
  return { found: plan.markers.length - missing.length, total: plan.markers.length, missing };
}
