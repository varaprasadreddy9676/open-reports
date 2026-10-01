import type { ReportDefinition } from "@reporting/schema";
import { ExpressionEngine } from "@reporting/expressions";
import { DataSourceRegistry } from "./datasource.js";
import { resolveParameters, type ParameterIssue } from "./parameters.js";
import { executeDatasets, type DatasetExecutionIssue } from "./datasets.js";
import { computeReportVariables } from "./variables.js";
import { resolveComponents, type ResolveEnv } from "./resolve-component.js";
import type { ResolvedReport, ResolvedSection, ResolvedWarning } from "./resolved-report.js";
import type { ResolveContext } from "./context.js";

export interface RenderPipelineOptions {
  registry: DataSourceRegistry;
  parameters?: Record<string, unknown>;
  maxRows?: number;
  datasetTimeoutMs?: number;
}

export interface RenderPipelineResult {
  resolved: ResolvedReport;
  issues: (ParameterIssue | DatasetExecutionIssue)[];
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

  const engine = new ExpressionEngine({ locale, currency });

  const baseCtx: ResolveContext = {
    params: parameters,
    data: datasets,
    vars: {},
    report: { id: report.id, name: report.name },
    page: {},
    // `row`/`parent` are always present (even if empty) so a binding like
    // `row.balance` used outside of any row-iteration context evaluates to
    // `undefined` rather than throwing "Unknown field row".
    row: {},
    parent: {},
  };

  const reportVars = computeReportVariables(report.variables, engine, baseCtx);
  baseCtx.vars = reportVars;

  const warnings: ResolvedWarning[] = [];
  const rowVarAccumulator: Record<string, unknown> = {};

  const sections: ResolvedSection[] = report.sections.map((section, index) => {
    const env: ResolveEnv = {
      engine,
      locale,
      currency,
      variables: report.variables,
      rowVarAccumulator,
      warnings,
      path: `sections[${index}]`,
    };

    let children;
    if (section.dataset) {
      const rows = Array.isArray(datasets[section.dataset]) ? (datasets[section.dataset] as unknown[]) : [];
      children = rows.flatMap((row) =>
        resolveComponents(section.children as any, { ...baseCtx, row: row as Record<string, unknown>, vars: { ...baseCtx.vars, ...rowVarAccumulator } }, env)
      );
    } else {
      children = resolveComponents(section.children as any, baseCtx, env);
    }

    return { type: section.type, repeat: section.repeat, children };
  });

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
    warnings,
  };

  return { resolved, issues: [...parameterIssues, ...datasetIssues] };
}
