import type { ReportDefinition } from "@reporting/schema";
import { importJrxml, type ImportResult, type MigrationIssue } from "./index.js";

export interface JrxmlFolderSource { path: string; xml: string }
export interface JrxmlFolderEntry extends ImportResult { path: string; error?: string }
export interface JrxmlFolderResult { entries: JrxmlFolderEntry[]; converted: number; failed: number }

const normalized = (path: string) => path.replace(/\\/g, "/").replace(/^\.\//, "");
const fileName = (path: string) => normalized(path).split("/").pop() ?? path;
const stem = (path: string) => fileName(path).replace(/\.jrxml$/i, "");
const directory = (path: string) => normalized(path).split("/").slice(0, -1).join("/").toLowerCase();
const slug = (value: string) => value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "report";

function eachSubreport(report: ReportDefinition, visit: (node: Record<string, unknown>) => void): void {
  const walk = (value: unknown): void => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const node = value as Record<string, unknown>;
    if (node.type === "subreport") visit(node);
    if (Array.isArray(node.children)) node.children.forEach(walk);
  };
  report.sections.forEach((section) => section.children.forEach(walk));
}

/** Converts one file; callers may run this in a Worker to report real progress. */
export function importJrxmlFolderFile(source: JrxmlFolderSource, index: number, idPrefix: string): JrxmlFolderEntry {
  const path = normalized(source.path);
  try {
    const result = importJrxml(source.xml, { id: `${slug(idPrefix)}-${index + 1}-${slug(stem(path))}`, sourceName: fileName(path) });
    return { path, ...result, ...(!result.report ? { error: "JRXML could not be converted into a valid report." } : {}) };
  } catch (cause) {
    return { path, issues: [], summary: { converted: 0, "needs-review": 0, unsupported: 0 }, error: cause instanceof Error ? cause.message : String(cause) };
  }
}

/** Links child JRXML sources after every file has been converted. */
export function finishJrxmlFolderImport(entries: JrxmlFolderEntry[]): JrxmlFolderResult {
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = normalized(entry.path).toLowerCase();
    if (seen.has(key)) { entry.report = undefined; entry.error = "Duplicate JRXML path in selected folder."; }
    seen.add(key);
  }
  const byStem = new Map<string, JrxmlFolderEntry[]>();
  for (const entry of entries) {
    if (!entry.report) continue;
    const key = stem(entry.path).toLowerCase();
    byStem.set(key, [...(byStem.get(key) ?? []), entry]);
  }
  for (const entry of entries) {
    if (!entry.report) continue;
    eachSubreport(entry.report, (node) => {
      const childName = String(node.reportId ?? "");
      const candidates = byStem.get(childName.toLowerCase()) ?? [];
      const nearby = candidates.filter((candidate) => directory(candidate.path) === directory(entry.path));
      const matches = nearby.length ? nearby : candidates;
      const existing = entry.issues.find((issue) => issue.feature === "subreport" && issue.targetId === node.id);
      if (matches.length === 1) {
        node.reportId = matches[0]!.report!.id;
        if (existing) existing.message = `${fileName(matches[0]!.path)} linked as child report "${node.reportId}"; bind its data and review nested pagination.`;
      } else {
        const issue: MigrationIssue = {
          status: "needs-review", feature: "subreport source", source: existing?.source ?? entry.path,
          line: existing?.line ?? 0, targetId: String(node.id ?? ""),
          message: matches.length ? `Multiple JRXML files match child "${childName}"; choose the intended source.` : `Child "${childName}.jrxml" was not found in this folder. Add its JRXML source.`,
        };
        entry.issues.push(issue);
        entry.summary["needs-review"]++;
      }
    });
    if (entry.report.migration) {
      entry.report.migration.summary = { ...entry.summary };
      entry.report.migration.issues = entry.issues.filter((issue) => issue.status !== "converted").map(({ status, feature, source, line, message, targetId }) => ({ status: status as "needs-review" | "unsupported", feature, source, line, message, targetId }));
    }
  }
  return { entries, converted: entries.filter((entry) => !!entry.report).length, failed: entries.filter((entry) => !entry.report).length };
}

/** Converts a selected folder in memory. Only JRXML is read; source queries and code are never run. */
export function importJrxmlFolder(sources: JrxmlFolderSource[], options: { idPrefix?: string } = {}): JrxmlFolderResult {
  const prefix = options.idPrefix ?? `jrxml-${Date.now().toString(36)}`;
  return finishJrxmlFolderImport(sources.filter((source) => /\.jrxml$/i.test(source.path)).map((source, index) => importJrxmlFolderFile(source, index, prefix)));
}
