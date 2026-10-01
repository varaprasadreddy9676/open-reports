import type { Expr, PathSegment } from "./ast.js";
import { Parser } from "./parser.js";
import { ExpressionError, closestMatch } from "./errors.js";
import { buildDefaultFunctions, type ExpressionFunction } from "./functions.js";

export interface ExpressionContext {
  params?: Record<string, unknown>;
  data?: Record<string, unknown>;
  row?: Record<string, unknown>;
  parent?: Record<string, unknown>;
  vars?: Record<string, unknown>;
  page?: { number?: number; total?: number };
  report?: Record<string, unknown>;
}

/** Property names that are never resolvable, even if present on the underlying
 * JS object, to keep expression evaluation from ever reaching into the
 * prototype chain or constructors (defense in depth -- there is no eval or
 * Function here to begin with, but this blocks prototype-pollution-style
 * property walks too). */
const BLOCKED_PROPERTY_NAMES = new Set(["__proto__", "prototype", "constructor"]);

export interface EvaluateOptions {
  locale?: string;
  currency?: string;
  functions?: Record<string, ExpressionFunction>;
  maxDepth?: number;
}

const astCache = new Map<string, Expr>();

function parseCached(expression: string): Expr {
  let ast = astCache.get(expression);
  if (!ast) {
    ast = Parser.parse(expression);
    astCache.set(expression, ast);
  }
  return ast;
}

export class ExpressionEngine {
  private functions: Record<string, ExpressionFunction>;
  private maxDepth: number;

  constructor(options: EvaluateOptions = {}) {
    this.functions = { ...buildDefaultFunctions({ locale: options.locale, currency: options.currency }), ...options.functions };
    this.maxDepth = options.maxDepth ?? 64;
  }

  evaluate(expression: string, context: ExpressionContext): unknown {
    const ast = parseCached(expression);
    return this.evalNode(ast, context, expression, 0);
  }

  private evalNode(node: Expr, ctx: ExpressionContext, source: string, depth: number): unknown {
    if (depth > this.maxDepth) {
      throw new ExpressionError("Expression nesting exceeds the maximum allowed depth.", { expression: source });
    }

    switch (node.kind) {
      case "number":
      case "string":
      case "boolean":
        return node.value;
      case "null":
        return null;
      case "path":
        return this.resolvePath(node.segments, ctx, source, depth);
      case "unary": {
        const v = this.evalNode(node.expr, ctx, source, depth + 1);
        return node.op === "!" ? !truthy(v) : -toNum(v);
      }
      case "binary":
        return this.evalBinary(node, ctx, source, depth);
      case "conditional": {
        const cond = this.evalNode(node.cond, ctx, source, depth + 1);
        return truthy(cond) ? this.evalNode(node.then, ctx, source, depth + 1) : this.evalNode(node.else, ctx, source, depth + 1);
      }
      case "call": {
        const fn = this.functions[node.name];
        if (!fn) {
          const suggestion = closestMatch(node.name, Object.keys(this.functions));
          throw new ExpressionError(`Unknown function "${node.name}".`, { expression: source, suggestion });
        }
        const args = node.args.map((a) => this.evalNode(a, ctx, source, depth + 1));
        return fn(...args);
      }
    }
  }

  private evalBinary(node: Extract<Expr, { kind: "binary" }>, ctx: ExpressionContext, source: string, depth: number): unknown {
    if (node.op === "&&") {
      const l = this.evalNode(node.left, ctx, source, depth + 1);
      return truthy(l) ? this.evalNode(node.right, ctx, source, depth + 1) : l;
    }
    if (node.op === "||") {
      const l = this.evalNode(node.left, ctx, source, depth + 1);
      return truthy(l) ? l : this.evalNode(node.right, ctx, source, depth + 1);
    }
    if (node.op === "??") {
      const l = this.evalNode(node.left, ctx, source, depth + 1);
      return l === null || l === undefined ? this.evalNode(node.right, ctx, source, depth + 1) : l;
    }

    const l = this.evalNode(node.left, ctx, source, depth + 1);
    const r = this.evalNode(node.right, ctx, source, depth + 1);

    switch (node.op) {
      case "+":
        return typeof l === "string" || typeof r === "string" ? toStrVal(l) + toStrVal(r) : toNum(l) + toNum(r);
      case "-":
        return toNum(l) - toNum(r);
      case "*":
        return toNum(l) * toNum(r);
      case "/":
        return toNum(l) / toNum(r);
      case "%":
        return toNum(l) % toNum(r);
      case "==":
        return l === r;
      case "!=":
        return l !== r;
      case ">":
        return toNum(l) > toNum(r);
      case ">=":
        return toNum(l) >= toNum(r);
      case "<":
        return toNum(l) < toNum(r);
      case "<=":
        return toNum(l) <= toNum(r);
    }
  }

  private resolvePath(segments: PathSegment[], ctx: ExpressionContext, source: string, depth: number): unknown {
    const first = segments[0];
    if (!first || first.type !== "prop") {
      throw new ExpressionError("Invalid path expression.", { expression: source });
    }

    if (!(first.name in ctx)) {
      const suggestion = closestMatch(first.name, Object.keys(ctx));
      throw new ExpressionError(`Unknown field "${first.name}".`, { expression: source, suggestion });
    }

    let current: unknown = (ctx as Record<string, unknown>)[first.name];
    const pathSoFar = [first.name];

    for (const segment of segments.slice(1)) {
      if (segment.type === "index") {
        const idx = this.evalNode(segment.expr, ctx, source, depth + 1);
        current = Array.isArray(current) ? current[toNum(idx)] : undefined;
        pathSoFar.push(`[${String(idx)}]`);
        continue;
      }

      if (BLOCKED_PROPERTY_NAMES.has(segment.name)) {
        throw new ExpressionError(`Access to "${segment.name}" is not allowed.`, { expression: source });
      }

      if (current === null || current === undefined) {
        current = undefined;
        pathSoFar.push(segment.name);
        continue;
      }

      if (typeof current !== "object") {
        throw new ExpressionError(`Cannot read property "${segment.name}" of ${typeof current}.`, { expression: source });
      }

      if (!(segment.name in (current as Record<string, unknown>))) {
        const suggestion = closestMatch(segment.name, Object.keys(current as Record<string, unknown>));
        const fullPath = [...pathSoFar, segment.name].join(".");
        throw new ExpressionError(`Unknown field "${fullPath}".`, {
          expression: source,
          suggestion: suggestion ? [...pathSoFar, suggestion].join(".") : undefined,
        });
      }

      current = (current as Record<string, unknown>)[segment.name];
      pathSoFar.push(segment.name);
    }

    return current;
  }
}

function truthy(v: unknown): boolean {
  return Boolean(v);
}

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function toStrVal(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}
