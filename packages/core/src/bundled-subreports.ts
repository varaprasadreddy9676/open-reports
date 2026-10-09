import { parseReportDefinition, type ReportDefinition } from "@reporting/schema";
import type { SubreportSource } from "./subreports.js";

/** Resolve the child definitions saved by the designer's file picker. Request resources take precedence. */
export function bundledSubreports(report: ReportDefinition, overrides: Record<string, SubreportSource> = {}): Record<string, SubreportSource> {
  const sources: Record<string, SubreportSource> = Object.assign(Object.create(null), overrides);
  const pending = [report, ...Object.values(overrides).map((source) => source.report)];
  const visited = new Set<ReportDefinition>();
  while (pending.length) {
    const parent = pending.pop()!;
    if (visited.has(parent)) continue;
    visited.add(parent);
    for (const [id, definition] of Object.entries(parent.subreports ?? {})) {
      if (Object.prototype.hasOwnProperty.call(sources, id)) continue;
      const child = parseReportDefinition(definition);
      if (!child.valid) throw new Error(`Bundled subreport "${id}" is invalid: ${child.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
      sources[id] = { report: child.report };
      pending.push(child.report);
    }
  }
  return sources;
}
