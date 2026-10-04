import type { ReportDefinition, ReportSection } from "@reporting/schema";
import type { ResolveContext } from "./context.js";
import { expandBodyBands } from "./bands.js";
import { resolveParameters } from "./parameters.js";
import { computeReportVariables } from "./variables.js";
import { sourceRows, type Component, type ResolveEnv } from "./resolve-component.js";
import type { ResolvedComponent } from "./resolved-report.js";

/** Child datasets are supplied explicitly; their saved SQL/REST sources are not run from a parent report. */
export interface SubreportSource {
  report: ReportDefinition;
  data?: Record<string, unknown>;
}

const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

export function resolveNestedReport(
  component: Component,
  parentCtx: ResolveContext,
  env: ResolveEnv,
  sources: Record<string, SubreportSource> | undefined,
): ResolvedComponent {
  const id = String(component.reportId ?? "");
  const placeholder = (reason: string): ResolvedComponent => {
    env.warnings.push({ code: "SUBREPORT_NOT_RENDERED", path: env.path, componentId: component.id, message: `Subreport "${id}" was not rendered: ${reason}` });
    return {
      id: component.id, type: "text", text: `[Subreport ${id}: ${reason}]`,
      x: component.x, y: component.y, width: component.width, height: component.height,
      style: { ...component.style, color: "#b91c1c" },
    };
  };

  if (!sources || !own(sources, id)) return placeholder("child definition is missing");
  const source = sources[id]!;
  const child = source.report;
  if ((env.subreportStack ?? []).includes(id) || (env.subreportStack?.length ?? 0) >= 8) return placeholder("nested report cycle or depth limit");

  const childData = { ...(source.data ?? {}) };
  if (component.dataset) {
    if (child.datasets.length !== 1) return placeholder("dataset binding requires exactly one child dataset");
    const rows = component.dataset.startsWith("params.")
      ? env.engine.evaluate(component.dataset, parentCtx)
      : sourceRows(component.dataset, parentCtx, env);
    if (!Array.isArray(rows)) return placeholder(`parent dataset "${component.dataset}" is not an array`);
    childData[child.datasets[0]!.id] = rows;
  }
  const missing = child.datasets.find((dataset) => !own(childData, dataset.id));
  if (missing) return placeholder(`child dataset "${missing.id}" has no supplied data`);

  let childCtx: ResolveContext;
  try {
    const supplied: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(component.parameters ?? {})) {
      if (value && typeof value === "object" && own(value, "expression") && typeof (value as { expression: unknown }).expression === "string") {
        supplied[name] = env.engine.evaluate((value as { expression: string }).expression, parentCtx);
      } else supplied[name] = value;
    }
    const params = resolveParameters(child.parameters, supplied);
    if (params.issues.length) return placeholder(`parameter binding failed (${params.issues.map((issue) => issue.code).join(", ")})`);
    childCtx = {
      ...parentCtx,
      params: params.values,
      data: childData,
      row: {},
      parent: parentCtx.row,
      vars: {},
      report: { id: child.id, name: child.name },
    };
    childCtx.vars = computeReportVariables(child.variables, env.engine, childCtx);
  } catch (error) {
    return placeholder(`binding failed (${error instanceof Error ? error.message : String(error)})`);
  }

  // A Jasper child report is embedded inside its parent's band. Page masters
  // become one-time bands here; repeating them at child page breaks still needs
  // a dedicated nested paginator, so that difference is explicitly reported.
  const sections: ReportSection[] = child.sections.filter((section) => section.type !== "background").map((section) => ({
    ...section,
    type: (section.type === "pageHeader" ? "reportHeader" : section.type === "pageFooter" ? "reportFooter" : section.type) as ReportSection["type"],
  }));
  if (child.sections.some((section) => (section.type === "pageHeader" || section.type === "pageFooter") && section.children.length)) {
    env.warnings.push({ code: "SUBREPORT_PAGINATION_APPROXIMATE", path: env.path, componentId: component.id, message: `Subreport "${id}" page bands print once; repetition across nested page breaks needs PDF comparison.` });
  }
  const ignoredBackground = child.sections.some((section) => section.type === "background" && section.children.length);
  if (ignoredBackground) env.warnings.push({ code: "SUBREPORT_BACKGROUND_UNSUPPORTED", path: env.path, componentId: component.id, message: `Subreport "${id}" has a background that needs manual placement.` });

  const accumulator: Record<string, unknown> = {};
  const nested: ReportDefinition = { ...child, sections };
  const childEnv = (path: string): ResolveEnv => ({
    ...env,
    path: `${env.path}.subreports.${id}.${path}`,
    variables: child.variables,
    rowVarAccumulator: accumulator,
    fragments: new Map(child.fragments.map((fragment) => [fragment.id, fragment.children as Component[]])),
    fragmentStack: [],
    theme: child.theme ?? env.theme,
    subreportStack: [...(env.subreportStack ?? []), id],
  });
  const children = expandBodyBands({
    report: nested, engine: env.engine, baseCtx: childCtx, datasets: childData,
    rowVarAccumulator: accumulator, makeEnv: childEnv,
  });
  if (ignoredBackground) children.unshift({ type: "text", text: `[Subreport ${id} background needs review]`, style: { color: "#b91c1c" } });
  return {
    id: component.id, type: "container", layout: "flow",
    x: component.x, y: component.y, width: component.width,
    minHeight: component.height, style: component.style,
    keepTogether: component.keepTogether,
    children,
  };
}
