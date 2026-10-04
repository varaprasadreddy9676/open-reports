import { refreshLinkedBlocks, type BlockLookup } from "./linked-blocks.js";
import { randomUUID } from "node:crypto";
import { parseReportDefinition, type ReportDefinition } from "@reporting/schema";
import { importJrxml } from "@reporting/jrxml-import";
import { DataSourceRegistry, resolveReport, validateReport, type SubreportSource } from "@reporting/core";
import type { RenderResult } from "@reporting/core";
import { createDefaultDataSourceRegistry } from "./datasources.js";
import type { ReportRenderer } from "@reporting/core";
import type { PluginRegistry } from "@reporting/plugin-sdk";
import { isDataLossWarningCode } from "@reporting/layout";
import { createRendererRegistry } from "./renderers.js";
import { materializeChildren, materializeLinkedImages } from "./linked-images.js";
import { RenderPipelineError } from "./render-error.js";

export { RenderPipelineError } from "./render-error.js";

export interface RunRenderInput {
  report: unknown;
  format: string;
  parameters?: Record<string, unknown>;
  /** Inline convenience data (spec section 1): for any key not already
   * declared as a dataset in the report, synthesize an inline dataset from
   * it, so `reporter.render({report, data})` works without pre-wiring
   * datasource config for ad-hoc/local usage. */
  data?: Record<string, unknown>;
  /** Child definitions and their explicit datasets; child saved queries are not run implicitly. */
  subreports?: Record<string, { jrxml?: string; report?: unknown; data?: Record<string, unknown> }>;
  /** Reject PDF/HTML output with pagination warnings that can lose content. Defaults to true. */
  strict?: boolean;
}

export interface RunRenderOutput {
  renderId: string;
  result: RenderResult;
  durationMs: number;
}

/** Everything a render needs that plugins can extend. One per server instance. */
export interface RenderRuntime {
  renderers: Record<string, ReportRenderer>;
  dataSources: DataSourceRegistry;
  functions?: Record<string, (...args: unknown[]) => unknown>;
  customComponents?: ReturnType<PluginRegistry["componentExpanders"]>;
  imageAllowedHosts?: string[];
  /** Server folders whose files linked images may read; empty refuses every local path. */
  imageRoots?: string[];
  /** Latest version of a library block, for linked blocks. */
  getBlock?: BlockLookup;
}

export function createRuntime(plugins?: PluginRegistry): RenderRuntime {
  const renderers: Record<string, ReportRenderer> = { ...createRendererRegistry() };
  const dataSources = createDefaultDataSourceRegistry();
  if (plugins) {
    for (const [format, reg] of plugins.renderers) renderers[format] = reg.renderer;
    for (const [name, ds] of plugins.dataSources) dataSources.register({ id: `plugin:${name}`, execute: ds.execute.bind(ds) });
    return { renderers, dataSources, functions: plugins.expressionFunctions(), customComponents: plugins.componentExpanders() };
  }
  return { renderers, dataSources };
}

const defaultRuntime = createRuntime();

/** Caller-supplied `data` wins: a dataset with the same id is replaced by it (so one template renders any record), and unknown ids become new inline datasets. */
function withInlineData(report: ReportDefinition, data: Record<string, unknown> | undefined): ReportDefinition {
  if (!data) return report;
  const replaced = report.datasets.map((d) => (Object.prototype.hasOwnProperty.call(data, d.id) ? { id: d.id, source: "inline" as const, query: { data: data[d.id] } } : d));
  const existing = new Set(report.datasets.map((d) => d.id));
  const extra = Object.entries(data)
    .filter(([id]) => !existing.has(id))
    .map(([id, value]) => ({ id, source: "inline" as const, query: { data: value } }));
  return { ...report, datasets: [...replaced, ...extra] } as ReportDefinition;
}

export async function runRender(input: RunRenderInput, runtime: RenderRuntime = defaultRuntime): Promise<RunRenderOutput> {
  const renderId = randomUUID();
  const start = Date.now();

  if (!Object.prototype.hasOwnProperty.call(runtime.renderers, input.format)) {
    throw new RenderPipelineError(`Unsupported format "${input.format}". Supported formats: ${Object.keys(runtime.renderers).join(", ")}.`, "UNSUPPORTED_FORMAT", 400);
  }

  const linked = await refreshLinkedBlocks(input.report, runtime.getBlock);
  const parsed = parseReportDefinition(linked.report);
  if (!parsed.valid) {
    throw new RenderPipelineError("Report definition failed schema validation.", "INVALID_REPORT", 400, parsed.issues);
  }

  const validation = validateReport(parsed.report);
  if (!validation.valid) {
    throw new RenderPipelineError("Report definition failed validation.", "VALIDATION_FAILED", 400, validation.issues);
  }

  const report = withInlineData(parsed.report, input.data);
  const subreports: Record<string, SubreportSource> = {};
  for (const [id, source] of Object.entries(input.subreports ?? {})) {
    if (!source || typeof source !== "object") throw new RenderPipelineError(`Invalid subreport source "${id}".`, "INVALID_REPORT", 400);
    if ((source.jrxml === undefined) === (source.report === undefined)) {
      throw new RenderPipelineError(`Subreport "${id}" needs exactly one JRXML source or imported report definition.`, "INVALID_REPORT", 400);
    }
    const imported = source.jrxml === undefined ? undefined : importJrxml(source.jrxml, { id, sourceName: `${id}.jrxml` });
    if (imported && !imported.report) {
      throw new RenderPipelineError(`Subreport "${id}" JRXML could not be imported.`, "INVALID_REPORT", 400, imported.issues);
    }
    const child = parseReportDefinition(imported?.report ?? source.report);
    if (!child.valid) throw new RenderPipelineError(`Subreport "${id}" failed schema validation.`, "INVALID_REPORT", 400, child.issues);
    const childValidation = validateReport(child.report);
    if (!childValidation.valid) throw new RenderPipelineError(`Subreport "${id}" failed validation.`, "VALIDATION_FAILED", 400, childValidation.issues);
    if (source.data !== undefined && (source.data === null || typeof source.data !== "object" || Array.isArray(source.data))) {
      throw new RenderPipelineError(`Subreport "${id}" data must be an object keyed by dataset id.`, "INVALID_REPORT", 400);
    }
    subreports[id] = { report: child.report, data: source.data };
  }

  let pipeline;
  try {
    pipeline = await resolveReport(report, { registry: runtime.dataSources, parameters: input.parameters ?? {}, functions: runtime.functions, customComponents: runtime.customComponents, subreports });
    pipeline.resolved.warnings.push(...linked.warnings);
  } catch (err) {
    throw new RenderPipelineError(describeError(err), "REPORT_RESOLVE_FAILED", 422, { renderId });
  }

  if (pipeline.issues.length > 0) {
    throw new RenderPipelineError("Report could not be resolved: parameter/dataset errors.", "REPORT_RESOLVE_FAILED", 422, {
      renderId,
      issues: pipeline.issues,
    });
  }

  const imageSources = await materializeLinkedImages(pipeline.resolved, { allowedHosts: runtime.imageAllowedHosts, roots: runtime.imageRoots });
  const resolvePageSection = (section: Parameters<typeof pipeline.resolvePageSection>[0], page: Parameters<typeof pipeline.resolvePageSection>[1]) => {
    const children = pipeline.resolvePageSection(section, page);
    materializeChildren(children, imageSources);
    return children;
  };

  const renderer = runtime.renderers[input.format]!;
  let result: RenderResult;
  try {
    result = await renderer.render({ resolved: pipeline.resolved, resolvePageSection });
  } catch (err) {
    throw new RenderPipelineError(describeError(err), "REPORT_RENDER_FAILED", 422, { renderId });
  }

  const dataLossWarnings = result.warnings.filter((warning) => isDataLossWarningCode(warning.code));
  if (input.strict !== false && dataLossWarnings.length > 0) {
    const missingChild = dataLossWarnings.some((warning) => warning.code === "SUBREPORT_NOT_RENDERED");
    throw new RenderPipelineError(missingChild
      ? "A nested report could not be rendered. Supply its JRXML-derived definition and datasets, then retry."
      : "Report content exceeds its layout. Adjust the named component or choose an explicit clipping policy before rendering.",
    "REPORT_RENDER_FAILED", 422, { renderId, warnings: dataLossWarnings });
  }

  return { renderId, result, durationMs: Date.now() - start };
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
