import { parseReportDefinition } from "@reporting/schema";
import type { SubreportSource } from "@reporting/core";
import type { Doc } from "../model/ops";

/** Child definitions are kept with the parent JSON so a chosen file remains available after reopening it. */
export function subreportSources(doc: Doc): Record<string, SubreportSource> {
  const sources: Record<string, SubreportSource> = {};
  const pending = [doc.subreports ?? {}];
  const visited = new Set<string>();
  while (pending.length) {
    const definitions = pending.pop()!;
    for (const [id, value] of Object.entries(definitions)) {
      if (visited.has(id)) continue;
      const parsed = parseReportDefinition(value);
      if (!parsed.valid) continue;
      visited.add(id);
      sources[id] = { report: parsed.report };
      const nested = (parsed.report as typeof parsed.report & { subreports?: Record<string, unknown> }).subreports;
      if (nested) pending.push(nested);
    }
  }
  return sources;
}

export function parseSubreportFile(text: string): { id: string; name: string; definition: Record<string, unknown> } {
  const value: unknown = JSON.parse(text);
  const parsed = parseReportDefinition(value);
  if (!parsed.valid) {
    const issue = parsed.issues[0];
    throw new Error(issue ? `${issue.path ? `${issue.path}: ` : ""}${issue.message}` : "This file is not an Open Reports definition.");
  }
  return {
    id: parsed.report.id,
    name: parsed.report.name,
    definition: parsed.report as unknown as Record<string, unknown>,
  };
}
