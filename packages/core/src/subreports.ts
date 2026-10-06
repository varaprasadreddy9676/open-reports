import type { ReportDefinition, ReportSection } from "@reporting/schema";
import type { ResolveContext } from "./context.js";
import { expandBodyBands } from "./bands.js";
import { resolveParameters } from "./parameters.js";
import { computeReportVariables } from "./variables.js";
import { resolveComponents, sourceRows, themeStyle, type Component, type ResolveEnv } from "./resolve-component.js";
import type { ResolvedComponent, ResolvedSection } from "./resolved-report.js";
import { applyOwnRules } from "./rules.js";

let nextSubreportInstance = 1;

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

  // Child page masters travel as frame metadata; the layout engine applies
  // them only to pages occupied by this child instance.
  const subreportInstance = nextSubreportInstance++;
  const frameId = `subreport-${subreportInstance}`;
  const headerIds = new Set<string>();
  const sections: ReportSection[] = child.sections.filter((section) => section.type !== "background" && section.type !== "pageFooter").map((section, index) => {
    const nestedId = section.id ?? `__subreport_${frameId}_${index}`;
    if (section.type === "pageHeader") headerIds.add(nestedId);
    return {
      ...section,
      id: nestedId,
      type: (section.type === "pageHeader" ? "reportHeader" : section.type) as ReportSection["type"],
    };
  });

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

  const pageMasters = (type: "pageFooter" | "background"): ResolvedSection[] => child.sections.flatMap((section, index) => {
    if (section.type !== type || section.hidden) return [];
    const path = `sections[${index}]`;
    const masterEnv = childEnv(path);
    const effective = applyOwnRules(section, childCtx, {
      engine: env.engine, warnings: masterEnv.warnings, decisions: masterEnv.decisions,
      target: { kind: "band", id: section.id, path }, visibleWhenErrors: "show",
    });
    if (effective.hidden) return [];
    const children = resolveComponents(effective.children as Component[], childCtx, masterEnv);
    const root = type === "background" || effective.layout !== "absolute"
      ? children
      : [{ type: "container", layout: effective.layout, height: effective.height || undefined, children } as ResolvedComponent];
    return [{ type, sourceIndex: index, appliesTo: effective.appliesTo, style: themeStyle(effective.style, masterEnv, effective.id), children: root }];
  });
  const footerMasters = pageMasters("pageFooter");
  const backgrounds = pageMasters("background");

  const children = expandBodyBands({
    report: nested, engine: env.engine, baseCtx: childCtx, datasets: childData,
    rowVarAccumulator: accumulator, makeEnv: childEnv,
  });
  // Child page headers participate in the existing continuation-header stack.
  // The close marker scopes that stack to this subreport, so a header never
  // leaks into the parent's bands when the child has no page footer.
  // Keep the nested stack above ordinary report group levels so closing a
  // child cannot accidentally close a group's own repeated header.
  const level = 100_000 + (env.subreportStack?.length ?? 1);
  const scopedChildren = children.map((resolved) => {
    const band = resolved.band;
    if (!band?.sectionId) return resolved;
    if (headerIds.has(band.sectionId)) return { ...resolved, band: { ...band, type: "groupHeader", level, instance: subreportInstance, repeatEveryPage: true, allowSplit: false } };
    return resolved;
  });
  scopedChildren.unshift({ type: "spacer", height: 0, subreportFrame: { action: "start", id: frameId, footerMasters, backgrounds } } as ResolvedComponent);
  scopedChildren.push({
    type: "spacer", height: 0,
    band: { sectionIndex: -1, type: "groupFooter", level, instance: subreportInstance, allowSplit: false },
    subreportFrame: { action: "end", id: frameId },
  } as ResolvedComponent);
  return {
    id: component.id, type: "container", layout: "flow",
    x: component.x, y: component.y, width: component.width,
    minHeight: component.height, style: component.style,
    keepTogether: component.keepTogether,
    subreportFrameContainer: footerMasters.length > 0 || backgrounds.length > 0,
    children: scopedChildren,
  } as ResolvedComponent;
}
