import { parseReportDefinition } from "@reporting/schema";
import {
  DataSourceRegistry,
  InlineDataSource,
  resolveReport,
  validateReport,
  type PageSectionResolver,
  type ResolvedReport,
} from "@reporting/core";
import { paginate, type PaginatedReport } from "@reporting/layout";
import { findByPath, type Doc } from "./model/ops";

export interface Problem {
  severity: "error" | "warning" | "suggestion";
  code: string;
  message: string;
  componentId?: string;
  path?: string;
}

export interface EngineResult {
  resolved?: ResolvedReport;
  paginated?: PaginatedReport;
  resolvePageSection?: PageSectionResolver;
  problems: Problem[];
}

/** Turns every dataset into an inline dataset, using sample data where provided.
 * The designer renders and previews entirely against inline data, so the canvas
 * never depends on a live REST/SQL source being reachable. */
export function withSampleData(doc: Doc, sample: Record<string, unknown>): Doc {
  const next = structuredClone(doc);
  next.datasets = (next.datasets ?? []).map((ds: any) => {
    if (ds.id in sample) return { id: ds.id, source: "inline", query: { data: sample[ds.id] } };
    if (ds.source === "inline") return ds;
    return { id: ds.id, source: "inline", query: { data: null } };
  });
  return next;
}

const registry = new DataSourceRegistry();
registry.register(new InlineDataSource());

export async function runEngine(doc: Doc, sample: Record<string, unknown>, parameters: Record<string, unknown>): Promise<EngineResult> {
  const problems: Problem[] = [];
  const parsed = parseReportDefinition(doc);
  if (!parsed.valid) {
    for (const i of parsed.issues) problems.push({ severity: "error", code: i.code, message: `${i.path ? i.path + ": " : ""}${i.message}`, path: i.path });
    return { problems };
  }

  for (const ds of parsed.report.datasets) {
    if (ds.source !== "inline" && !(ds.id in sample)) {
      problems.push({ severity: "suggestion", code: "NO_SAMPLE_DATA", message: `Dataset "${ds.id}" (${ds.source}) has no sample data yet. Use Data > Test to load a preview.` });
    }
  }

  const validation = validateReport(parsed.report);
  for (const i of validation.issues) {
    const loc = findByPath(doc, i.path);
    problems.push({ severity: i.severity, code: i.code, message: i.message, path: i.path, componentId: i.componentId ?? loc?.comp.id });
  }

  const effective = withSampleData(doc, sample);
  const reparsed = parseReportDefinition(effective);
  if (!reparsed.valid) return { problems };

  try {
    const pipeline = await resolveReport(reparsed.report, { registry, parameters, tolerant: true });
    for (const issue of pipeline.issues) problems.push({ severity: "error", code: issue.code, message: issue.message, path: issue.path });
    for (const w of pipeline.resolved.warnings) {
      problems.push({ severity: w.code === "COMPONENT_ERROR" ? "error" : "warning", code: w.code, message: w.message, path: w.path, componentId: w.componentId });
    }
    const paginated = paginate(pipeline.resolved, { resolvePageDependentSection: pipeline.resolvePageSection });
    for (const w of paginated.warnings) {
      if (!pipeline.resolved.warnings.some((x) => x.code === w.code && x.message === w.message)) {
        problems.push({ severity: "warning", code: w.code, message: w.message, path: w.path, componentId: w.path });
      }
    }
    addSuggestions(doc, paginated, problems);
    return { resolved: pipeline.resolved, paginated, resolvePageSection: pipeline.resolvePageSection, problems };
  } catch (err) {
    problems.push({ severity: "error", code: "ENGINE_FAILED", message: err instanceof Error ? err.message : String(err) });
    return { problems };
  }
}

function addSuggestions(doc: Doc, paginated: PaginatedReport, problems: Problem[]): void {
  const pageCount = paginated.pages.length;
  const walk = (list: any[]) => {
    for (const c of list ?? []) {
      if (c.type === "table" && pageCount > 1 && c.repeatHeaderOnPageBreak === false) {
        problems.push({ severity: "suggestion", code: "REPEAT_HEADER", message: `Table "${c.id}" spans ${pageCount} pages; enable "Repeat header on every page".`, componentId: c.id });
      }
      for (const k of ["children", "header", "footer", "otherwise"]) if (Array.isArray(c[k])) walk(c[k]);
    }
  };
  for (const s of doc.sections ?? []) walk(s.children);
  const contentWidth = paginated.pageSize.width - paginated.margin.left - paginated.margin.right;
  for (const page of paginated.pages) {
    for (const n of page.content) {
      if (n.box.width > contentWidth + 0.5) {
        problems.push({ severity: "warning", code: "WIDER_THAN_PAGE", message: `"${(n.component as any).id ?? n.component.type}" is wider than the printable area.`, componentId: (n.component as any).id });
      }
    }
  }
}
