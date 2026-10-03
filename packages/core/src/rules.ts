import type { Condition, Rule, RuleAssignments, RulePhase } from "@reporting/schema";
import { Parser, type Expr, type ExpressionEngine } from "@reporting/expressions";
import type { ResolveContext } from "./context.js";
import type { ResolvedWarning } from "./resolved-report.js";

/** How one condition (or clause of a structured condition) evaluated, for the condition debugger. */
export interface ConditionTrace {
  kind: "expression" | "compare" | "all" | "any" | "not";
  /** Readable form, e.g. `row.flag == "H"`. */
  label: string;
  /** The value the expression or compared field had. */
  value?: unknown;
  /** null when the condition could not be evaluated. */
  result: boolean | null;
  error?: string;
  children?: ConditionTrace[];
}

/** One evaluation of one rule against one component or band instance. */
export interface RuleDecision {
  target: { kind: "component" | "band"; id?: string; path: string };
  /** `rules`, or a legacy field evaluated by the same engine. */
  source: "rules" | "visibleWhen" | "styleWhen";
  rule: { index: number; id?: string; name?: string };
  phase: RulePhase;
  page?: { number: number; total: number };
  cases: { condition: ConditionTrace }[];
  /** Index of the case that applied, "else", or null when nothing applied. */
  matched: number | "else" | null;
  /** Property values that were set (expressions already computed). */
  applied: Record<string, unknown>;
  error?: string;
}

export const RULE_PHASES: readonly RulePhase[] = ["data", "preLayout", "layout", "postLayout", "output", "print"];
const ROOT_PHASES: Record<string, RulePhase> = { page: "postLayout", renderer: "output", print: "print" };
/** The resolve stage decides these phases; page headers, footers and backgrounds are resolved again per page for postLayout. */
export const RESOLVE_PHASES = new Set<RulePhase>(["data", "preLayout"]);

/** Content properties replace each other: setting one clears the other two. */
const CONTENT_PROPERTIES = ["value", "binding", "expression"];

export const phaseRank = (phase: RulePhase) => RULE_PHASES.indexOf(phase);

function isExprValue(value: unknown): value is { expr: string } {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 1 && typeof (value as { expr?: unknown }).expr === "string";
}

/** Every expression string a condition contains. */
export function conditionExpressions(condition: Condition): string[] {
  if (typeof condition === "string") return [condition];
  if ("all" in condition) return condition.all.flatMap(conditionExpressions);
  if ("any" in condition) return condition.any.flatMap(conditionExpressions);
  if ("not" in condition) return conditionExpressions(condition.not);
  return [condition.field];
}

export function ruleCases(rule: Rule): { when: Condition; set: RuleAssignments }[] {
  return "cases" in rule ? rule.cases : [{ when: rule.when, set: rule.set }];
}

/** Condition and computed-value expressions of a rule, with the location of each (for validation messages). */
export function ruleExpressions(rule: Rule): { expression: string; where: string }[] {
  const out: { expression: string; where: string }[] = [];
  const cases = ruleCases(rule);
  cases.forEach((c, index) => {
    const where = "cases" in rule ? `cases[${index}]` : "";
    for (const expression of conditionExpressions(c.when)) out.push({ expression, where: where ? `${where}.when` : "when" });
    for (const [key, value] of Object.entries(c.set)) if (isExprValue(value)) out.push({ expression: value.expr, where: where ? `${where}.set.${key}` : `set.${key}` });
  });
  for (const [key, value] of Object.entries(rule.else ?? {})) if (isExprValue(value)) out.push({ expression: value.expr, where: `else.${key}` });
  return out;
}

function rootsOf(expr: Expr, roots: Set<string>): void {
  switch (expr.kind) {
    case "path": {
      const first = expr.segments[0];
      if (first?.type === "prop") roots.add(first.name);
      for (const segment of expr.segments) if (segment.type === "index") rootsOf(segment.expr, roots);
      return;
    }
    case "call": return expr.args.forEach((arg) => rootsOf(arg, roots));
    case "unary": return rootsOf(expr.expr, roots);
    case "binary": rootsOf(expr.left, roots); return rootsOf(expr.right, roots);
    case "conditional": rootsOf(expr.cond, roots); rootsOf(expr.then, roots); return rootsOf(expr.else, roots);
    default: return;
  }
}

/** The earliest phase at which everything the rule references is known. Unparseable expressions count as data. */
export function inferRulePhase(rule: Rule): RulePhase {
  let phase: RulePhase = "data";
  for (const { expression } of ruleExpressions(rule)) {
    const roots = new Set<string>();
    try { rootsOf(Parser.parse(expression), roots); } catch { continue; }
    for (const root of roots) {
      const needed = ROOT_PHASES[root];
      if (needed && phaseRank(needed) > phaseRank(phase)) phase = needed;
    }
  }
  return phase;
}

export const rulePhase = (rule: Rule): RulePhase => rule.phase ?? inferRulePhase(rule);

const isEmptyValue = (value: unknown) => value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);

function compare(op: string, left: unknown, right: unknown): boolean {
  switch (op) {
    case "==": return left === right;
    case "!=": return left !== right;
    case ">": case ">=": case "<": case "<=": {
      const comparable = (typeof left === "number" && typeof right === "number") || (typeof left === "string" && typeof right === "string");
      if (!comparable) return false;
      const l = left as number | string;
      const r = right as number | string;
      return op === ">" ? l > r : op === ">=" ? l >= r : op === "<" ? l < r : l <= r;
    }
    case "contains": return typeof left === "string" ? typeof right === "string" && left.includes(right) : Array.isArray(left) && left.includes(right);
    case "notContains": return !compare("contains", left, right);
    case "startsWith": return typeof left === "string" && typeof right === "string" && left.startsWith(right);
    case "endsWith": return typeof left === "string" && typeof right === "string" && left.endsWith(right);
    case "in": return Array.isArray(right) && right.includes(left);
    case "notIn": return !compare("in", left, right);
    case "isEmpty": return isEmptyValue(left);
    case "isNotEmpty": return !isEmptyValue(left);
    default: return false;
  }
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Evaluates every clause (no short-circuit) so the trace explains the whole condition. */
export function evaluateCondition(condition: Condition, ctx: ResolveContext, engine: ExpressionEngine): ConditionTrace {
  if (typeof condition === "string") {
    try {
      const value = engine.evaluate(condition, ctx);
      return { kind: "expression", label: condition, value, result: Boolean(value) };
    } catch (err) {
      return { kind: "expression", label: condition, result: null, error: message(err) };
    }
  }
  if ("all" in condition || "any" in condition) {
    const all = "all" in condition;
    const children = (all ? (condition as { all: Condition[] }).all : (condition as { any: Condition[] }).any).map((c) => evaluateCondition(c, ctx, engine));
    const decisive = children.some((c) => c.result === !all);
    const result = decisive ? !all : children.some((c) => c.result === null) ? null : all;
    return { kind: all ? "all" : "any", label: all ? "all of" : "any of", result, children };
  }
  if ("not" in condition) {
    const child = evaluateCondition(condition.not, ctx, engine);
    return { kind: "not", label: "not", result: child.result === null ? null : !child.result, children: [child] };
  }
  const label = condition.op === "isEmpty" || condition.op === "isNotEmpty" ? `${condition.field} ${condition.op}` : `${condition.field} ${condition.op} ${JSON.stringify(condition.value)}`;
  try {
    const value = engine.evaluate(condition.field, ctx);
    return { kind: "compare", label, value, result: compare(condition.op, value, condition.value) };
  } catch (err) {
    return { kind: "compare", label, result: null, error: message(err) };
  }
}

function firstError(trace: ConditionTrace): string | undefined {
  return trace.error ?? trace.children?.map(firstError).find(Boolean);
}

/** Decides which case of a rule applies and computes its values. A failure applies nothing. */
export function evaluateRule(rule: Rule, ctx: ResolveContext, engine: ExpressionEngine): Pick<RuleDecision, "cases" | "matched" | "applied" | "error"> {
  const cases: { condition: ConditionTrace }[] = [];
  let chosen: RuleAssignments | undefined;
  let matched: RuleDecision["matched"] = null;
  for (const [index, c] of ruleCases(rule).entries()) {
    const condition = evaluateCondition(c.when, ctx, engine);
    cases.push({ condition });
    if (condition.result === null) return { cases, matched: null, applied: {}, error: firstError(condition) ?? "The condition could not be evaluated." };
    if (condition.result) {
      chosen = c.set;
      matched = index;
      break;
    }
  }
  if (matched === null && rule.else) {
    chosen = rule.else;
    matched = "else";
  }
  const applied: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(chosen ?? {})) {
    if (!isExprValue(value)) {
      applied[key] = value;
      continue;
    }
    try {
      applied[key] = engine.evaluate(value.expr, ctx);
    } catch (err) {
      return { cases, matched: null, applied: {}, error: `${key}: ${message(err)}` };
    }
  }
  return { cases, matched, applied };
}

function setPath(target: Record<string, unknown>, path: string[], value: unknown): Record<string, unknown> {
  const [head, ...rest] = path;
  if (head === undefined) return target;
  if (rest.length === 0) return { ...target, [head]: value };
  const child = target[head];
  return { ...target, [head]: setPath(child && typeof child === "object" && !Array.isArray(child) ? (child as Record<string, unknown>) : {}, rest, value) };
}

/** Returns a copy of `target` with the values applied. `visible` maps to `hidden`; content properties replace each other. */
export function applyAssignments<T extends object>(target: T, applied: Record<string, unknown>): T {
  let out = { ...target } as Record<string, unknown>;
  for (const [key, value] of Object.entries(applied)) {
    if (key === "visible") {
      out.hidden = !value;
      continue;
    }
    if (CONTENT_PROPERTIES.includes(key)) {
      out = Object.fromEntries(Object.entries(out).filter(([name]) => !CONTENT_PROPERTIES.includes(name)));
      out[key] = value;
      continue;
    }
    out = setPath(out, key.split("."), value);
  }
  return out as T;
}

export interface RuleRunOptions {
  engine: ExpressionEngine;
  warnings: ResolvedWarning[];
  /** Collects decisions when rule tracing is on. */
  decisions?: RuleDecision[];
  target: RuleDecision["target"];
}

/**
 * Applies a component's or band's own conditions for the phase being resolved and returns the effective object.
 * Legacy `visibleWhen` runs first with its historical failure policy (`visibleWhenErrors`), then `rules` in order.
 * Rules for a later phase are left for that phase; postLayout rules run when `ctx.page.number` is known.
 */
type RuleOwner = { rules?: Rule[]; visibleWhen?: string; hidden?: boolean };

export function applyOwnRules<T extends object>(
  target: T,
  ctx: ResolveContext,
  options: RuleRunOptions & { visibleWhenErrors: "show" | "throw"; visibleWhenWarningCode?: string },
): T {
  const object = target as T & RuleOwner;
  let effective: T = target;
  const page = ctx.page.number !== undefined && ctx.page.total !== undefined ? { number: ctx.page.number, total: ctx.page.total } : undefined;
  const record = (decision: Omit<RuleDecision, "target" | "page">) => options.decisions?.push({ target: options.target, ...(page ? { page } : {}), ...decision });

  if (object.visibleWhen && !object.hidden) {
    const condition = evaluateCondition(object.visibleWhen, ctx, options.engine);
    if (condition.result === null) {
      if (options.visibleWhenErrors === "throw") throw new Error(condition.error);
      options.warnings.push({ code: options.visibleWhenWarningCode ?? "VISIBILITY_EXPRESSION_FAILED", path: options.target.path, message: condition.error ?? "", componentId: options.target.id });
    }
    const hidden = condition.result === false;
    record({ source: "visibleWhen", rule: { index: 0 }, phase: inferRulePhase({ when: object.visibleWhen, set: {} }), cases: [{ condition }], matched: condition.result === null ? null : hidden ? "else" : 0, applied: hidden ? { visible: false } : {}, ...(condition.error ? { error: condition.error } : {}) });
    if (hidden) effective = { ...effective, hidden: true };
  }

  const resolvingPages = page !== undefined;
  object.rules?.forEach((rule, index) => {
    if (rule.disabled) return;
    const phase = rulePhase(rule);
    if (!RESOLVE_PHASES.has(phase) && !(phase === "postLayout" && resolvingPages)) return;
    const outcome = evaluateRule(rule, ctx, options.engine);
    record({ source: "rules", rule: { index, ...(rule.id ? { id: rule.id } : {}), ...(rule.name ? { name: rule.name } : {}) }, phase, ...outcome });
    if (outcome.error) {
      options.warnings.push({ code: "RULE_CONDITION_FAILED", path: `${options.target.path}.rules[${index}]`, message: outcome.error, componentId: options.target.id });
      return;
    }
    effective = applyAssignments(effective, outcome.applied);
  });
  return effective;
}

/** Legacy `styleWhen`: evaluated by the rules engine but merged into the already-resolved style, as before. */
export function applyLegacyStyleWhen(
  rules: { when: string; style: Record<string, unknown> }[],
  base: Record<string, unknown> | undefined,
  ctx: ResolveContext,
  options: RuleRunOptions,
): Record<string, unknown> {
  let style: Record<string, unknown> = { ...(base ?? {}) };
  const page = ctx.page.number !== undefined && ctx.page.total !== undefined ? { page: { number: ctx.page.number, total: ctx.page.total } } : {};
  rules.forEach((rule, index) => {
    const condition = evaluateCondition(rule.when, ctx, options.engine);
    if (condition.result === null) options.warnings.push({ code: "STYLE_EXPRESSION_FAILED", path: options.target.path, message: condition.error ?? "" });
    if (condition.result) style = { ...style, ...rule.style };
    options.decisions?.push({
      target: options.target, ...page, source: "styleWhen", rule: { index }, phase: inferRulePhase({ when: rule.when, set: {} }),
      cases: [{ condition }], matched: condition.result ? 0 : null,
      applied: condition.result ? Object.fromEntries(Object.entries(rule.style).map(([key, value]) => [`style.${key}`, value])) : {},
      ...(condition.error ? { error: condition.error } : {}),
    });
  });
  return style;
}
