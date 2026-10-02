import type { ReportDefinition } from "@reporting/schema";
import { ExpressionEngine } from "@reporting/expressions";
import { DataSourceRegistry } from "./datasource.js";
import { resolveParameters, type ParameterIssue } from "./parameters.js";
import { executeDatasets, type DatasetExecutionIssue } from "./datasets.js";
import { computeReportVariables } from "./variables.js";
import { PAGE_BAND_TYPES } from "@reporting/schema";
import { expandBodyBands } from "./bands.js";
import { lookupDataset, resolveComponents, type CustomComponentExpander, type ResolveEnv } from "./resolve-component.js";
import type { ResolvedComponent, ResolvedReport, ResolvedSection, ResolvedWarning } from "./resolved-report.js";
import type { ResolveContext } from "./context.js";

/** Re-resolves one section (by type) with a page-number-aware context. Used
 * for pageHeader/pageFooter (and reportFooter) content that references
 * `page.number`/`page.total` -- those can't be known until @reporting/layout
 * has paginated the report once, so the main pipeline pass above resolves
 * them with `page.number`/`total` as `undefined` and the layout engine calls
 * this afterwards, once per page, with the real values. */
export type PageSectionResolver = (section: ResolvedSection, page: { number: number; total: number }) => ResolvedComponent[];

export interface RenderPipelineOptions {
  registry: DataSourceRegistry;
  parameters?: Record<string, unknown>;
  maxRows?: number;
  datasetTimeoutMs?: number;
  /** See ResolveEnv.tolerant -- used by the designer so one bad binding doesn't blank the canvas. */
  tolerant?: boolean;
  /** Extra expression functions (from plugins). They cannot shadow built-ins. */
  functions?: Record<string, (...args: unknown[]) => unknown>;
  /** Plugin component expanders keyed by `custom.kind`. */
  customComponents?: Map<string, CustomComponentExpander>;
  /** Design view: expand each band once instead of per record/group (used by the designer's structure canvas). */
  design?: { ghosts: number };
}

export interface RenderPipelineResult {
  resolved: ResolvedReport;
  issues: (ParameterIssue | DatasetExecutionIssue)[];
  resolvePageSection: PageSectionResolver;
}

/**
 * Runs the full staged pipeline described in the spec:
 * schema validation (assumed already done by the caller) -> parameter
 * resolution -> dataset execution -> expression evaluation -> component
 * resolution -> Resolved Report Tree. Every renderer consumes only the
 * output of this function.
 */
export async function resolveReport(report: ReportDefinition, options: RenderPipelineOptions): Promise<RenderPipelineResult> {
  const locale = report.locale ?? report.theme?.locale ?? "en-US";
  const currency = report.theme?.currency ?? "USD";

  const { values: parameters, issues: parameterIssues } = resolveParameters(report.parameters, options.parameters ?? {});

  const { datasets, issues: datasetIssues } = await executeDatasets(report.datasets, options.registry, parameters, {
    maxRows: options.maxRows,
    timeoutMs: options.datasetTimeoutMs,
  });

  const engine = new ExpressionEngine({ locale, currency, functions: options.functions });

  const baseCtx: ResolveContext = {
    params: parameters,
    data: datasets,
    vars: {},
    report: { id: report.id, name: report.name },
    // `number`/`total` are not known until layout/pagination runs; keeping the
    // keys present (rather than an empty object) means `page.number` reads as
    // `undefined` instead of throwing "Unknown field page". The layout engine
    // re-resolves pageHeader/pageFooter/reportFooter per page with real values.
    page: { number: undefined, total: undefined },
    // `row`/`parent` are always present (even if empty) so a binding like
    // `row.balance` used outside of any row-iteration context evaluates to
    // `undefined` rather than throwing "Unknown field row".
    row: {},
    parent: {},
  };

  const reportVars = computeReportVariables(report.variables, engine, baseCtx);
  baseCtx.vars = reportVars;

  const fragments = new Map<string, any[]>(report.fragments.map((f) => [f.id, f.children as any[]]));
  const warnings: ResolvedWarning[] = [];
  const rowVarAccumulator: Record<string, unknown> = {};

  const makeEnv = (path: string): ResolveEnv => ({
    engine,
    locale,
    currency,
    variables: report.variables,
    rowVarAccumulator,
    warnings,
    path,
    tolerant: options.tolerant,
    fragments,
    customComponents: options.customComponents,
  });

  // Page-level bands (page header/footer masters, backgrounds) keep their own resolved section so they can be
  // re-resolved per page; every other band is expanded into printed band instances (see bands.ts).
  const pageSections: ResolvedSection[] = [];
  report.sections.forEach((section, index) => {
    if (!PAGE_BAND_TYPES.includes(section.type as any)) return;
    if (section.hidden && !options.design) return;
    pageSections.push({
      type: section.type,
      repeat: section.repeat,
      sourceIndex: index,
      appliesTo: section.appliesTo,
      children: resolveComponents(section.children as any, baseCtx, makeEnv(`sections[${index}]`)),
    });
  });
  const bodyChildren = expandBodyBands({ report, engine, baseCtx, datasets, rowVarAccumulator, makeEnv, design: options.design });
  const sections: ResolvedSection[] = [...pageSections, { type: "body", sourceIndex: -1, children: bodyChildren }];

  if (report.variables.some((v) => v.scope === "page")) {
    warnings.push({
      code: "PAGE_VARIABLES_REQUIRE_LAYOUT",
      path: "variables",
      message: "Page-scoped variables (page totals, running page balances) are resolved during layout/pagination, not in this pipeline stage.",
    });
  }

  const resolved: ResolvedReport = {
    id: report.id,
    name: report.name,
    locale,
    page: report.page,
    theme: report.theme,
    sections,
    exports: report.exports,
    print: report.print,
    watermark: report.watermark,
    warnings,
  };

  const resolvePageSection: PageSectionResolver = (section, page) => {
    const raw = report.sections[section.sourceIndex];
    if (!raw) return section.children;
    const env: ResolveEnv = {
      engine,
      locale,
      currency,
      variables: report.variables,
      rowVarAccumulator: { ...rowVarAccumulator },
      warnings,
      path: `sections[${section.sourceIndex}]`,
      tolerant: options.tolerant,
      fragments,
      customComponents: options.customComponents,
    };
    return resolveComponents(raw.children as any, { ...baseCtx, page }, env);
  };

  return { resolved, issues: [...parameterIssues, ...datasetIssues], resolvePageSection };
}
