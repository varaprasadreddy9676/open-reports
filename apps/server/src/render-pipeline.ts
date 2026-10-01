import { randomUUID } from "node:crypto";
import { parseReportDefinition, type ReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, resolveReport, validateReport } from "@reporting/core";
import type { RenderResult } from "@reporting/core";
import { createDefaultDataSourceRegistry } from "./datasources.js";
import type { ReportRenderer } from "@reporting/core";
import type { PluginRegistry } from "@reporting/plugin-sdk";
import { createRendererRegistry } from "./renderers.js";

export class RenderPipelineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "RenderPipelineError";
  }
}

export interface RunRenderInput {
  report: unknown;
  format: string;
  parameters?: Record<string, unknown>;
  /** Inline convenience data (spec section 1): for any key not already
   * declared as a dataset in the report, synthesize an inline dataset from
   * it, so `reporter.render({report, data})` works without pre-wiring
   * datasource config for ad-hoc/local usage. */
  data?: Record<string, unknown>;
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

function withInlineData(report: ReportDefinition, data: Record<string, unknown> | undefined): ReportDefinition {
  if (!data) return report;
  const existingIds = new Set(report.datasets.map((d) => d.id));
  const extra = Object.entries(data)
    .filter(([id]) => !existingIds.has(id))
    .map(([id, value]) => ({ id, source: "inline" as const, query: { data: value } }));
  if (extra.length === 0) return report;
  return { ...report, datasets: [...report.datasets, ...extra] };
}

export async function runRender(input: RunRenderInput, runtime: RenderRuntime = defaultRuntime): Promise<RunRenderOutput> {
  const renderId = randomUUID();
  const start = Date.now();

  if (!Object.prototype.hasOwnProperty.call(runtime.renderers, input.format)) {
    throw new RenderPipelineError(`Unsupported format "${input.format}". Supported formats: ${Object.keys(runtime.renderers).join(", ")}.`, "UNSUPPORTED_FORMAT", 400);
  }

  const parsed = parseReportDefinition(input.report);
  if (!parsed.valid) {
    throw new RenderPipelineError("Report definition failed schema validation.", "INVALID_REPORT", 400, parsed.issues);
  }

  const validation = validateReport(parsed.report);
  if (!validation.valid) {
    throw new RenderPipelineError("Report definition failed validation.", "VALIDATION_FAILED", 400, validation.issues);
  }

  const report = withInlineData(parsed.report, input.data);

  let pipeline;
  try {
    pipeline = await resolveReport(report, { registry: runtime.dataSources, parameters: input.parameters ?? {}, functions: runtime.functions, customComponents: runtime.customComponents });
  } catch (err) {
    throw new RenderPipelineError(describeError(err), "REPORT_RESOLVE_FAILED", 422, { renderId });
  }

  if (pipeline.issues.length > 0) {
    throw new RenderPipelineError("Report could not be resolved: parameter/dataset errors.", "REPORT_RESOLVE_FAILED", 422, {
      renderId,
      issues: pipeline.issues,
    });
  }

  const renderer = runtime.renderers[input.format]!;
  let result: RenderResult;
  try {
    result = await renderer.render({ resolved: pipeline.resolved, resolvePageSection: pipeline.resolvePageSection });
  } catch (err) {
    throw new RenderPipelineError(describeError(err), "REPORT_RENDER_FAILED", 422, { renderId });
  }

  return { renderId, result, durationMs: Date.now() - start };
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
