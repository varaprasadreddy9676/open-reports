import { ExpressionEngine } from "@reporting/expressions";
import type { ResolveContext } from "./context.js";
import { formatValue } from "./format.js";
import type {
  ResolvedComponent,
  ResolvedGroupInstance,
  ResolvedTableColumn,
  ResolvedTableRow,
  ResolvedWarning,
} from "./resolved-report.js";
import { aggregate } from "./aggregate.js";
import { evaluateRowVariables, computeGroupVariables } from "./variables.js";
import type { VariableDefinition } from "@reporting/schema";

// The schema package intentionally keeps the component tree loosely typed
// (see AnyComponent in @reporting/schema) because it is recursive; the
// resolver works against that same loose shape.
export type Component = Record<string, any> & { type: string };

export interface ResolveEnv {
  engine: ExpressionEngine;
  locale: string;
  currency: string;
  variables: VariableDefinition[];
  rowVarAccumulator: Record<string, unknown>;
  warnings: ResolvedWarning[];
  path: string;
  /** Design-time mode: a component that throws becomes a visible error placeholder + warning instead of failing the whole report. */
  tolerant?: boolean;
}

function resolveValueLike(component: Component, ctx: ResolveContext, env: ResolveEnv): unknown {
  if (component.expression !== undefined) {
    return env.engine.evaluate(component.expression, ctx);
  }
  if (component.binding !== undefined) {
    return env.engine.evaluate(component.binding, ctx);
  }
  return component.value;
}

function isVisible(component: Component, ctx: ResolveContext, env: ResolveEnv): boolean {
  if (!component.visibleWhen) return true;
  try {
    return Boolean(env.engine.evaluate(component.visibleWhen, ctx));
  } catch (err) {
    env.warnings.push({
      code: "VISIBILITY_EXPRESSION_FAILED",
      path: env.path,
      message: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
}

/** Resolves a dataset reference: an exact dataset id, or a dotted path into a
 * dataset's value (e.g. "invoice.items" for an array nested in an object
 * dataset), so master/detail JSON needs no flattening. */
export function lookupDataset(data: Record<string, unknown>, ref: string): unknown {
  if (ref in data) return data[ref];
  return ref.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, data);
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function applyStyleWhen(rules: { when: string; style: Record<string, unknown> }[], base: Record<string, unknown> | undefined, ctx: ResolveContext, env: ResolveEnv): Record<string, unknown> {
  let style: Record<string, unknown> = { ...(base ?? {}) };
  for (const rule of rules) {
    try {
      if (env.engine.evaluate(rule.when, ctx)) style = { ...style, ...rule.style };
    } catch (err) {
      env.warnings.push({ code: "STYLE_EXPRESSION_FAILED", path: env.path, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return style;
}

function toRowContext(ctx: ResolveContext, row: unknown): ResolveContext {
  return { ...ctx, row: row as Record<string, unknown>, parent: ctx.row };
}

export function resolveComponents(components: Component[], ctx: ResolveContext, env: ResolveEnv): ResolvedComponent[] {
  const out: ResolvedComponent[] = [];
  for (const component of components) {
    let resolved: ResolvedComponent | ResolvedComponent[] | null;
    if (env.tolerant) {
      try {
        resolved = resolveComponent(component, ctx, env);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        env.warnings.push({ code: "COMPONENT_ERROR", path: env.path, message, componentId: component.id });
        resolved = { id: component.id, type: "text", text: `\u26a0 ${message.replace(/^Expression error in ".*?": /, "")}`, style: { color: "#b91c1c", fontSize: 8 } } as ResolvedComponent;
      }
    } else {
      resolved = resolveComponent(component, ctx, env);
    }
    if (resolved && !Array.isArray(resolved) && component.styleWhen) {
      resolved = { ...resolved, style: applyStyleWhen(component.styleWhen, resolved.style, ctx, env) } as ResolvedComponent;
    }
    if (resolved) out.push(...(Array.isArray(resolved) ? resolved : [resolved]));
  }
  return out;
}

function base(component: Component) {
  return {
    id: component.id,
    layout: component.layout,
    x: component.x,
    y: component.y,
    width: component.width,
    height: component.height,
    style: component.style,
    pageBreakBefore: component.pageBreakBefore,
    pageBreakAfter: component.pageBreakAfter,
    keepTogether: component.keepTogether,
    exports: component.exports,
  };
}

function resolveComponent(component: Component, ctx: ResolveContext, env: ResolveEnv): ResolvedComponent | ResolvedComponent[] | null {
  if (!isVisible(component, ctx, env)) return null;

  switch (component.type) {
    case "text":
    case "richText":
    case "field": {
      const raw = resolveValueLike(component, ctx, env);
      return { ...base(component), type: component.type, text: formatValue(raw, component.format, env) };
    }
    case "image": {
      const src = component.binding ? env.engine.evaluate(component.binding, ctx) : component.src;
      return { ...base(component), type: "image", src: src as string | undefined, fit: component.fit ?? "contain", alt: component.alt };
    }
    case "line":
      return { ...base(component), type: "line", orientation: component.orientation ?? "horizontal" };
    case "rectangle":
      return { ...base(component), type: "rectangle" };
    case "spacer":
      return { ...base(component), type: "spacer" };
    case "pageBreak":
      return { ...base(component), type: "pageBreak" };
    case "qrcode": {
      const value = String(resolveValueLike(component, ctx, env) ?? "");
      if (!value) env.warnings.push({ code: "EMPTY_QRCODE_VALUE", path: env.path, message: "QR code has no value to encode." });
      return { ...base(component), type: "qrcode", value };
    }
    case "barcode": {
      const value = String(resolveValueLike(component, ctx, env) ?? "");
      if (!value) env.warnings.push({ code: "EMPTY_BARCODE_VALUE", path: env.path, message: "Barcode has no value to encode." });
      return { ...base(component), type: "barcode", value, symbology: component.symbology ?? "code128" };
    }
    case "chart": {
      const dataset = component.dataset ? lookupDataset(ctx.data, component.dataset) : undefined;
      const rows = toArray(dataset);
      const categories = component.categoryBinding
        ? rows.map((row) => String(env.engine.evaluate(component.categoryBinding, toRowContext(ctx, row))))
        : rows.map((_, i) => String(i));
      const series = (component.series ?? []).map((s: { name: string; binding?: string; expression?: string }) => ({
        name: s.name,
        values: rows.map((row) => {
          const rowCtx = toRowContext(ctx, row);
          const v = s.expression ? env.engine.evaluate(s.expression, rowCtx) : env.engine.evaluate(s.binding!, rowCtx);
          return Number(v) || 0;
        }),
      }));
      return { ...base(component), type: "chart", chartType: component.chartType, title: component.title, categories, series };
    }
    case "table":
      return resolveTable(component, ctx, env);
    case "group":
      return resolveGroup(component, ctx, env);
    case "container":
    case "row":
    case "column":
    case "grid":
    case "keepTogether": {
      const children = resolveComponents(component.children ?? [], ctx, env);
      return { ...base(component), type: component.type, columns: component.columns, children };
    }
    case "repeater": {
      const rows = toArray(lookupDataset(ctx.data, component.dataset));
      const children = rows.flatMap((row) => resolveComponents(component.children ?? [], toRowContext(ctx, row), env));
      return { ...base(component), type: "repeater", children };
    }
    case "conditional": {
      const when = Boolean(env.engine.evaluate(component.when, ctx));
      return resolveComponents(when ? component.children ?? [] : component.otherwise ?? [], ctx, env);
    }
    case "subreport":
      // KNOWN LIMITATION (v1): embedding and rendering another report's own
      // datasets recursively is not yet wired up -- the schema supports
      // declaring a subreport (and the validator checks for circular
      // references), but runtime execution of its nested pipeline is left
      // for a follow-up. Flag it so callers see the gap instead of silently
      // dropping content.
      env.warnings.push({
        code: "SUBREPORT_NOT_RENDERED",
        path: env.path,
        message: `Subreport "${component.reportId}" was not rendered: subreport execution is not yet implemented.`,
      });
      return null;
    default:
      env.warnings.push({ code: "UNKNOWN_COMPONENT_TYPE", path: env.path, message: `Unknown component type "${component.type}".` });
      return null;
  }
}

function resolveTable(component: Component, ctx: ResolveContext, env: ResolveEnv): ResolvedComponent {
  const rawRows = toArray(lookupDataset(ctx.data, component.dataset));
  let rows = rawRows.map((row) => row as Record<string, unknown>);

  if (component.filterWhen) {
    rows = rows.filter((row) => {
      try {
        return Boolean(env.engine.evaluate(component.filterWhen, toRowContext(ctx, row)));
      } catch {
        return true;
      }
    });
  }

  if (component.sortBy?.length) {
    const sortBy = component.sortBy as { binding: string; direction: "asc" | "desc" }[];
    rows = [...rows].sort((a, b) => {
      for (const s of sortBy) {
        const av = env.engine.evaluate(s.binding, toRowContext(ctx, a));
        const bv = env.engine.evaluate(s.binding, toRowContext(ctx, b));
        if (av === bv) continue;
        const cmp = (av as any) > (bv as any) ? 1 : -1;
        return s.direction === "desc" ? -cmp : cmp;
      }
      return 0;
    });
  }

  const columns: ResolvedTableColumn[] = (component.columns ?? []).map((col: any) => ({
    id: col.id ?? col.binding ?? col.header ?? Math.random().toString(36).slice(2),
    header: col.header ?? "",
    width: col.width,
    align: col.align,
    format: col.format,
  }));

  const resolvedRows: ResolvedTableRow[] = rows.map((row) => {
    const rowCtx = toRowContext(ctx, row);
    evaluateRowVariables(env.variables, env.engine, rowCtx, env.rowVarAccumulator);
    const raw: Record<string, unknown> = {};
    const formatted: Record<string, string> = {};
    (component.columns ?? []).forEach((col: any, i: number) => {
      const id = columns[i]!.id;
      const value = col.expression
        ? env.engine.evaluate(col.expression, { ...rowCtx, vars: env.rowVarAccumulator })
        : col.binding
          ? env.engine.evaluate(col.binding, rowCtx)
          : undefined;
      raw[id] = value;
      formatted[id] = formatValue(value, col.format, env);
    });
    const style = component.rowStyleWhen?.length ? applyStyleWhen(component.rowStyleWhen, undefined, { ...rowCtx, vars: env.rowVarAccumulator }, env) : undefined;
    return { raw, formatted, style: style && Object.keys(style).length ? style : undefined };
  });

  if (component.showFooter) {
    (component.columns ?? []).forEach((col: any, i: number) => {
      if (!col.footer) return;
      const id = columns[i]!.id;
      const values = resolvedRows.map((r) => r.raw[id]);
      let value: unknown;
      if (col.footer.aggregate) {
        value = aggregate(col.footer.aggregate, values);
      } else if (col.footer.expression) {
        value = env.engine.evaluate(col.footer.expression, { ...ctx, data: { ...ctx.data, [component.dataset]: rows } });
      }
      columns[i]!.footer = { label: col.footer.label, value: formatValue(value, col.format, env), raw: value };
    });
  }

  return {
    ...base(component),
    type: "table",
    columns,
    rows: resolvedRows,
    showHeader: component.showHeader ?? true,
    showFooter: component.showFooter ?? false,
    repeatHeaderOnPageBreak: component.repeatHeaderOnPageBreak ?? true,
    keepRowTogether: component.keepRowTogether ?? true,
    alternateRowStyle: component.alternateRowStyle,
  };
}

function resolveGroup(component: Component, ctx: ResolveContext, env: ResolveEnv): ResolvedComponent {
  const datasetId: string | undefined = component.dataset;
  const rawRows = toArray(datasetId ? lookupDataset(ctx.data, datasetId) : undefined).map((r) => r as Record<string, unknown>);

  const keyed = rawRows.map((row) => ({
    row,
    key: env.engine.evaluate(component.groupBy, toRowContext(ctx, row)),
  }));

  const direction = component.sortDirection === "desc" ? -1 : 1;
  keyed.sort((a, b) => {
    if (a.key === b.key) return 0;
    return (a.key as any) > (b.key as any) ? direction : -direction;
  });

  const groups: ResolvedGroupInstance[] = [];
  let current: { key: unknown; rows: Record<string, unknown>[] } | null = null;
  for (const item of keyed) {
    if (!current || current.key !== item.key) {
      if (current) groups.push(buildGroupInstance(component, ctx, env, datasetId, current.key, current.rows));
      current = { key: item.key, rows: [] };
    }
    current.rows.push(item.row);
  }
  if (current) groups.push(buildGroupInstance(component, ctx, env, datasetId, current.key, current.rows));

  return {
    ...base(component),
    type: "group",
    groupBy: component.groupBy,
    pageBreakBeforeGroup: component.pageBreakBeforeGroup,
    keepGroupTogether: component.keepGroupTogether,
    groups,
  };
}

function buildGroupInstance(
  component: Component,
  ctx: ResolveContext,
  env: ResolveEnv,
  datasetId: string | undefined,
  key: unknown,
  rows: Record<string, unknown>[]
): ResolvedGroupInstance {
  const groupVars = computeGroupVariables(env.variables, env.engine, ctx, datasetId, rows);
  const groupCtx: ResolveContext = { ...ctx, row: rows[0], vars: { ...ctx.vars, ...groupVars } };

  const header = resolveComponents(component.header ?? [], groupCtx, env);
  const children = rows.flatMap((row) => resolveComponents(component.children ?? [], { ...toRowContext(ctx, row), vars: { ...ctx.vars, ...groupVars } }, env));
  const footer = resolveComponents(component.footer ?? [], groupCtx, env);

  return { key, header, children, footer };
}
