import type { ReportDefinition } from "@reporting/schema";
import { Parser } from "@reporting/expressions";
import type { Component } from "./resolve-component.js";

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
  componentId?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface RendererCapability {
  id: string;
  supports: string[];
}

export interface ValidateOptions {
  /** Resolves another report definition by id, used to walk subreport chains for cycle detection. */
  resolveReport?: (id: string) => ReportDefinition | undefined;
  /** When provided, components whose type isn't in a target renderer's `supports` list produce a warning. */
  targetRenderers?: RendererCapability[];
}

const EXPRESSION_FIELDS = ["binding", "expression", "visibleWhen", "filterWhen", "groupBy"] as const;

/** Central, beyond-schema validator: duplicate ids, missing dataset references,
 * invalid expression syntax, circular subreports, and (optionally) renderer
 * capability warnings. Schema-shape errors themselves are caught earlier by
 * @reporting/schema's parseReportDefinition -- this operates on an already
 * schema-valid ReportDefinition. */
export function validateReport(report: ReportDefinition, options: ValidateOptions = {}): ValidationResult {
  const issues: ValidationIssue[] = [];
  const datasetIds = new Set(report.datasets.map((d) => d.id));
  const fragmentIds = new Set(report.fragments.map((f) => f.id));
  const parameterIds = new Set<string>();
  const seenComponentIds = new Set<string>();

  checkDuplicates(report.datasets.map((d) => d.id), "datasets", issues);
  checkDuplicates(report.parameters.map((p) => p.id), "parameters", issues);
  checkDuplicates(report.variables.map((v) => v.id), "variables", issues);
  for (const p of report.parameters) parameterIds.add(p.id);

  report.sections.forEach((section, sIndex) => {
    const sectionPath = `sections[${sIndex}]`;
    if (section.dataset && !datasetIds.has(section.dataset.split(".")[0]!)) {
      issues.push(missingDataset(section.dataset, sectionPath, Array.from(datasetIds)));
    }
    walkComponents(section.children as Component[], sectionPath, {
      fragmentIds,
      datasetIds,
      issues,
      seenComponentIds,
      targetRenderers: options.targetRenderers,
    });
  });

  validateBands(report, issues);

  for (const f of report.fragments) {
    walkComponents(f.children as Component[], `fragments.${f.id}`, { fragmentIds, datasetIds, issues, seenComponentIds: new Set(), targetRenderers: options.targetRenderers });
  }

  if (options.resolveReport) {
    checkCircularSubreports(report, options.resolveReport, issues);
  }

  return { valid: !issues.some((i) => i.severity === "error"), issues };
}

function checkDuplicates(ids: string[], label: string, issues: ValidationIssue[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      issues.push({ severity: "error", code: "DUPLICATE_ID", path: label, message: `Duplicate ${label.slice(0, -1)} id "${id}".` });
    }
    seen.add(id);
  }
}

function missingDataset(datasetId: string, path: string, known: string[]): ValidationIssue {
  const suggestion = closest(datasetId, known);
  return {
    severity: "error",
    code: "UNKNOWN_DATASET",
    path,
    message: `Dataset "${datasetId}" does not exist.${suggestion ? ` Did you mean "${suggestion}"?` : ""}`,
  };
}

function closest(target: string, candidates: string[]): string | undefined {
  let best: string | undefined;
  let bestScore = Infinity;
  for (const c of candidates) {
    const score = Math.abs(c.length - target.length) + (c[0] === target[0] ? 0 : 1);
    if (c.includes(target) || target.includes(c)) {
      return c;
    }
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return candidates.length > 0 ? best : undefined;
}

interface WalkCtx {
  fragmentIds: Set<string>;
  datasetIds: Set<string>;
  issues: ValidationIssue[];
  seenComponentIds: Set<string>;
  targetRenderers?: RendererCapability[];
}

function walkComponents(components: Component[] | undefined, path: string, ctx: WalkCtx): void {
  (components ?? []).forEach((component, index) => {
    const compPath = `${path}.children[${index}]`;
    validateComponent(component, compPath, ctx);
  });
}

function validateComponent(component: Component, path: string, ctx: WalkCtx): void {
  if (component.id) {
    if (ctx.seenComponentIds.has(component.id)) {
      ctx.issues.push({ severity: "error", code: "DUPLICATE_ID", path, message: `Duplicate component id "${component.id}".`, componentId: component.id });
    }
    ctx.seenComponentIds.add(component.id);
  }

  if (component.type === "fragment" && !ctx.fragmentIds.has(component.ref)) {
    ctx.issues.push({ severity: "error", code: "UNKNOWN_FRAGMENT", path, message: `Reusable block "${component.ref}" does not exist.`, componentId: component.id });
  }

  const datasetRef: string | undefined = component.dataset;
  if (datasetRef && !ctx.datasetIds.has(datasetRef.split(".")[0]!)) {
    ctx.issues.push(missingDataset(datasetRef, path, Array.from(ctx.datasetIds)));
  }

  for (const field of EXPRESSION_FIELDS) {
    const expr = component[field];
    if (typeof expr === "string") {
      try {
        Parser.parse(expr);
      } catch (err) {
        ctx.issues.push({
          severity: "error",
          code: "INVALID_EXPRESSION",
          path: `${path}.${field}`,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  if (component.type === "table") {
    for (const col of component.columns ?? []) {
      for (const field of ["binding", "expression"] as const) {
        if (typeof col[field] === "string") {
          try {
            Parser.parse(col[field]);
          } catch (err) {
            ctx.issues.push({ severity: "error", code: "INVALID_EXPRESSION", path: `${path}.columns`, message: err instanceof Error ? err.message : String(err) });
          }
        }
      }
    }
  }

  if (ctx.targetRenderers) {
    for (const renderer of ctx.targetRenderers) {
      if (!renderer.supports.includes(component.type) && !renderer.supports.includes("*")) {
        ctx.issues.push({
          severity: "warning",
          code: "UNSUPPORTED_RENDERER_FEATURE",
          path,
          message: `${renderer.id} renderer does not support component "${component.type}". Component will be skipped.`,
        });
      }
    }
  }

  for (const key of ["children", "header", "footer", "otherwise"] as const) {
    if (Array.isArray(component[key])) {
      walkComponents(component[key], path, ctx);
    }
  }
}

function checkCircularSubreports(
  report: ReportDefinition,
  resolveReport: (id: string) => ReportDefinition | undefined,
  issues: ValidationIssue[]
): void {
  const visit = (current: ReportDefinition, chain: string[]): void => {
    const subreportIds = collectSubreportIds(current);
    for (const id of subreportIds) {
      if (chain.includes(id)) {
        issues.push({
          severity: "error",
          code: "CIRCULAR_SUBREPORT",
          path: "sections",
          message: `Circular subreport reference detected: ${[...chain, id].join(" -> ")}.`,
        });
        continue;
      }
      const next = resolveReport(id);
      if (next) visit(next, [...chain, id]);
    }
  };
  visit(report, [report.id]);
}

function collectSubreportIds(report: ReportDefinition): string[] {
  const ids: string[] = [];
  const walk = (components: Component[] | undefined) => {
    for (const c of components ?? []) {
      if (c.type === "subreport" && typeof c.reportId === "string") ids.push(c.reportId);
      for (const key of ["children", "header", "footer", "otherwise"] as const) {
        if (Array.isArray(c[key])) walk(c[key]);
      }
    }
  };
  for (const section of report.sections) walk(section.children as Component[]);
  return ids;
}

/** Structural rules for bands and groups (see packages/schema/src/sections.ts). */
function validateBands(report: ReportDefinition, issues: ValidationIssue[]): void {
  const groupIds = new Set(report.groups.map((g) => g.id));
  checkDuplicates(report.groups.map((g) => g.id), "groups", issues);
  const datasetIds = new Set(report.datasets.map((d) => d.id));
  const sectionIds = new Map<string, number>();
  const parse = (expr: string, path: string) => {
    try {
      Parser.parse(expr);
    } catch (err) {
      issues.push({ severity: "error", code: "INVALID_EXPRESSION", path, message: err instanceof Error ? err.message : String(err) });
    }
  };

  report.groups.forEach((g, i) => {
    parse(g.by, `groups[${i}].by`);
    if (g.dataset && !datasetIds.has(g.dataset.split(".")[0]!)) issues.push(missingDataset(g.dataset, `groups[${i}]`, Array.from(datasetIds)));
  });

  report.sections.forEach((s, i) => {
    const path = `sections[${i}]`;
    if (s.id) {
      if (sectionIds.has(s.id)) issues.push({ severity: "error", code: "DUPLICATE_ID", path, message: `Duplicate band id "${s.id}".` });
      sectionIds.set(s.id, i);
    }
    if (s.groupBy) parse(s.groupBy, `${path}.groupBy`);
    if (s.visibleWhen) parse(s.visibleWhen, `${path}.visibleWhen`);
    if ((s.type === "groupHeader" || s.type === "groupFooter") && s.groupId && !groupIds.has(s.groupId)) {
      issues.push({ severity: "error", code: "UNKNOWN_GROUP", path, message: `Band refers to group "${s.groupId}", which is not declared in "groups".` });
    }
    if ((s.type === "groupHeader" || s.type === "groupFooter") && !s.groupId && !s.groupBy && s.type === "groupHeader") {
      issues.push({ severity: "warning", code: "GROUP_BAND_WITHOUT_GROUP", path, message: "A group header needs a group: choose one in the band's properties (or add one under Groups)." });
    }
    if (s.type === "child" && !(s.parent && report.sections.some((o) => o.id === s.parent))) {
      issues.push({ severity: "error", code: "UNKNOWN_PARENT_BAND", path, message: `Child band refers to parent "${s.parent ?? ""}", which is not a band id.` });
    }
    if (s.type === "child" && s.parent === s.id) issues.push({ severity: "error", code: "UNKNOWN_PARENT_BAND", path, message: "A child band cannot be its own parent." });
    if ((s.type === "pageHeader" || s.type === "pageFooter" || s.type === "background") && (s.dataset || s.groupId)) {
      issues.push({ severity: "warning", code: "PAGE_BAND_WITH_DATA", path, message: `A ${s.type} band cannot be bound to a dataset or group; the binding is ignored.` });
    }
    if (s.repeatEveryPage && s.type !== "groupHeader") {
      issues.push({ severity: "warning", code: "REPEAT_ON_NON_GROUP_HEADER", path, message: "\"Repeat on every page\" only applies to group headers (use page headers for page-level repetition)." });
    }
  });

  // a group declared but used by no band is almost certainly a mistake
  for (const g of report.groups) {
    if (!report.sections.some((s) => s.groupId === g.id)) issues.push({ severity: "warning", code: "UNUSED_GROUP", path: `groups.${g.id}`, message: `Group "${g.id}" has no header or footer band, so it only sorts and subdivides records.` });
  }
}
