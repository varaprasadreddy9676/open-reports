import { styleSchema, type Rule } from "@reporting/schema";
import { Parser, type ExpressionEngine } from "@reporting/expressions";
import type { ResolveContext } from "./context.js";
import type { ResolvedWarning } from "./resolved-report.js";
import { evaluateRule, inferRulePhase, ruleCases, ruleExpressions, ruleRoots, type RuleDecision } from "./rules.js";
import type { ValidationIssue } from "./validator.js";

/**
 * Table rules use the universal rule shape. Row rules (`rowRules`) run once per row and may set `style.*` for the
 * whole row or `visible: false` to leave the row out. Column rules (`columns[].rules`) run once per cell with the
 * cell's raw value as `value`, and may set `style.*` for that cell or `text` to replace what it prints. A column
 * rule that sets `visible` must not depend on the row: it hides or shows the whole column.
 */

interface RuleEnv {
  engine: ExpressionEngine;
  warnings: ResolvedWarning[];
  decisions?: RuleDecision[];
  path: string;
  componentId?: string;
}

const ROW_ROOTS = new Set(["row", "value", "parent", "group"]);
const STYLE_KEYS = (styleSchema as unknown as { shape: Record<string, { safeParse(value: unknown): { success: boolean } }> }).shape;

/** Runs `rules` in order and returns the merged assignments of the rules that applied. Failures warn and apply nothing. */
function runRules(rules: Rule[] | undefined, ctx: ResolveContext, env: RuleEnv, field: string): Record<string, unknown> {
  const applied: Record<string, unknown> = {};
  rules?.forEach((rule, index) => {
    if (rule.disabled) return;
    const outcome = evaluateRule(rule, ctx, env.engine);
    env.decisions?.push({ target: { kind: "component", id: env.componentId, path: `${env.path}.${field}` }, source: "rules", rule: { index, ...(rule.id ? { id: rule.id } : {}), ...(rule.name ? { name: rule.name } : {}) }, phase: inferRulePhase(rule), ...outcome });
    if (outcome.error) {
      env.warnings.push({ code: "RULE_CONDITION_FAILED", path: `${env.path}.${field}[${index}]`, message: outcome.error, componentId: env.componentId });
      return;
    }
    Object.assign(applied, outcome.applied);
  });
  return applied;
}

function styleFrom(applied: Record<string, unknown>): Record<string, unknown> | undefined {
  const entries = Object.entries(applied).filter(([key]) => key.startsWith("style.")).map(([key, value]) => [key.slice("style.".length), value] as const);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

/** Row rules for one row: the style they set and whether the row stays. */
export function applyRowRules(rules: Rule[] | undefined, ctx: ResolveContext, env: RuleEnv): { style?: Record<string, unknown>; hidden: boolean } {
  if (!rules?.length) return { hidden: false };
  const applied = runRules(rules, ctx, env, "rowRules");
  return { style: styleFrom(applied), hidden: applied.visible === false };
}

/** Column rules for one cell: its style and replacement text. Whole-column visibility rules are skipped here. */
export function applyCellRules(rules: Rule[] | undefined, ctx: ResolveContext, value: unknown, env: RuleEnv, columnIndex: number): { style?: Record<string, unknown>; text?: string } {
  const cellRules = rules?.filter((rule) => !setsVisible(rule));
  if (!cellRules?.length) return {};
  const applied = runRules(cellRules, { ...ctx, value } as ResolveContext, env, `columns[${columnIndex}].rules`);
  return { style: styleFrom(applied), ...("text" in applied ? { text: applied.text === null || applied.text === undefined ? "" : String(applied.text) } : {}) };
}

const setsVisible = (rule: Rule) => [...ruleCases(rule).map((c) => c.set), rule.else ?? {}].some((set) => "visible" in set);

/** Indexes of columns whose visibility rules hide them for this report run. */
export function hiddenColumns(columns: { rules?: Rule[] }[], ctx: ResolveContext, env: RuleEnv): Set<number> {
  const hidden = new Set<number>();
  columns.forEach((column, index) => {
    const visibility = column.rules?.filter(setsVisible);
    if (!visibility?.length) return;
    if (runRules(visibility, ctx, env, `columns[${index}].rules`).visible === false) hidden.add(index);
  });
  return hidden;
}

type HeaderCell = { column: number; colSpan?: number; rowSpan?: number; [key: string]: unknown };
type BodySpan = { column: number; colSpan?: number; rowSpan?: number; [key: string]: unknown };

/** Narrows a header cell or merge to the visible columns it covers; undefined when none remain or nothing is merged. */
function remapSpan<T extends { column: number; colSpan?: number; rowSpan?: number }>(cell: T, newIndex: (number | undefined)[], keepSingle: boolean): T | undefined {
  const covered = Array.from({ length: cell.colSpan ?? 1 }, (_, offset) => newIndex[cell.column + offset]).filter((index): index is number => index !== undefined);
  if (!covered.length) return undefined;
  const next = { ...cell, column: covered[0]!, colSpan: covered.length };
  if (!keepSingle && next.colSpan === 1 && (next.rowSpan ?? 1) === 1) return undefined;
  return next;
}

/** A copy of the table definition without the hidden columns; header groups and merges keep pointing at the right columns. */
export function withoutColumns<T extends { columns: unknown[]; headerRows?: HeaderCell[][]; cellSpans?: BodySpan[] }>(table: T, hidden: Set<number>): T {
  if (!hidden.size) return table;
  let next = 0;
  const newIndex = table.columns.map((_, index) => (hidden.has(index) ? undefined : next++));
  return {
    ...table,
    columns: table.columns.filter((_, index) => !hidden.has(index)),
    ...(table.headerRows ? { headerRows: table.headerRows.map((row) => row.map((cell) => remapSpan(cell, newIndex, true)).filter((cell): cell is HeaderCell => Boolean(cell))) } : {}),
    ...(table.cellSpans ? { cellSpans: table.cellSpans.map((span) => remapSpan(span, newIndex, false)).filter((span): span is BodySpan => Boolean(span)) } : {}),
  };
}

/** Targets, values and expressions of a table's row and column rules. */
export function validateTableRules(table: { rowRules?: Rule[]; columns?: { rules?: Rule[] }[] }, path: string, issues: ValidationIssue[], componentId?: string): void {
  validateRuleList(table.rowRules, `${path}.rowRules`, "row", issues, componentId);
  table.columns?.forEach((column, index) => validateRuleList(column.rules, `${path}.columns[${index}].rules`, "column", issues, componentId));
}

function validateRuleList(rules: Rule[] | undefined, path: string, kind: "row" | "column", issues: ValidationIssue[], componentId?: string): void {
  const push = (code: string, where: string, message: string) => issues.push({ severity: "error", code, path: where, message, ...(componentId ? { componentId } : {}) });
  rules?.forEach((rule, index) => {
    const rulePath = `${path}[${index}]`;
    for (const { expression, where } of ruleExpressions(rule)) {
      try {
        Parser.parse(expression);
      } catch (err) {
        push("INVALID_EXPRESSION", `${rulePath}.${where}`, err instanceof Error ? err.message : String(err));
      }
    }
    if (inferRulePhase(rule) !== "data") push("RULE_PHASE_UNSUPPORTED", rulePath, "Table rules are decided before pagination, so they cannot use page.*, renderer.* or print.* values.");
    if (kind === "column" && setsVisible(rule) && [...ruleRoots(rule)].some((root) => ROW_ROOTS.has(root))) {
      push("COLUMN_VISIBILITY_PER_ROW", rulePath, "A column rule that sets visible hides the whole column, so its condition cannot use row, value, parent or group. Use text: \"\" to blank single cells.");
    }
    const sets: [string, Record<string, unknown>][] = ruleCases(rule).map((c, caseIndex) => ["cases" in rule ? `cases[${caseIndex}].set` : "set", c.set]);
    if (rule.else) sets.push(["else", rule.else]);
    for (const [where, set] of sets) for (const [key, value] of Object.entries(set)) {
      const keyPath = `${rulePath}.${where}.${key}`;
      const computed = typeof value === "object" && value !== null && "expr" in value;
      if (key === "visible") {
        if (!computed && typeof value !== "boolean") push("RULE_INVALID_VALUE", keyPath, `"visible" must be true or false.`);
      } else if (key === "text" && kind === "column") {
        if (!computed && typeof value !== "string" && typeof value !== "number") push("RULE_INVALID_VALUE", keyPath, `"text" must be a string.`);
      } else if (key.startsWith("style.") && STYLE_KEYS[key.slice("style.".length).split(".")[0]!]) {
        const styleKey = key.slice("style.".length);
        const schema = STYLE_KEYS[styleKey];
        if (schema && !computed && !schema.safeParse(value).success) push("RULE_INVALID_VALUE", keyPath, `${JSON.stringify(value)} is not a valid value for "${key}".`);
      } else {
        const allowed = kind === "row" ? "style.* or visible" : "style.*, text or visible";
        push("RULE_UNKNOWN_TARGET", keyPath, `A table ${kind} rule can set ${allowed}, not "${key}".`);
      }
    }
  });
}
