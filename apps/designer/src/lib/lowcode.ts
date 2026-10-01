import { Parser } from "@reporting/expressions";

/** ---- Conditions: "[field] [is greater than] [value]" <-> expression ---- */
export const OPERATORS = [
  { id: "eq", label: "is equal to", op: "==" },
  { id: "ne", label: "is not equal to", op: "!=" },
  { id: "gt", label: "is greater than", op: ">" },
  { id: "gte", label: "is at least", op: ">=" },
  { id: "lt", label: "is less than", op: "<" },
  { id: "lte", label: "is at most", op: "<=" },
  { id: "contains", label: "contains", op: "contains" },
  { id: "empty", label: "is empty", op: "empty" },
  { id: "notempty", label: "is not empty", op: "notempty" },
] as const;

export interface Condition {
  field: string;
  operator: (typeof OPERATORS)[number]["id"];
  value: string;
}

function literal(value: string): string {
  if (value !== "" && !Number.isNaN(Number(value))) return String(Number(value));
  if (value === "true" || value === "false") return value;
  return JSON.stringify(value);
}

export function conditionToExpression(c: Condition): string {
  switch (c.operator) {
    case "contains":
      return `contains(${c.field}, ${literal(c.value)})`;
    case "empty":
      return `(${c.field} == null || ${c.field} == "")`;
    case "notempty":
      return `(${c.field} != null && ${c.field} != "")`;
    default: {
      const op = OPERATORS.find((o) => o.id === c.operator)!.op;
      return `${c.field} ${op} ${literal(c.value)}`;
    }
  }
}

/** Returns a Condition when the expression is one the builder can express, else undefined (show raw fx). */
export function expressionToCondition(expr: string): Condition | undefined {
  const e = expr.trim();
  let m = /^contains\(([\w.\[\]]+),\s*(.+)\)$/.exec(e);
  if (m) return { field: m[1]!, operator: "contains", value: unquote(m[2]!) };
  m = /^\(([\w.\[\]]+) == null \|\| \1 == ""\)$/.exec(e);
  if (m) return { field: m[1]!, operator: "empty", value: "" };
  m = /^\(([\w.\[\]]+) != null && \1 != ""\)$/.exec(e);
  if (m) return { field: m[1]!, operator: "notempty", value: "" };
  m = /^([\w.\[\]]+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/.exec(e);
  if (m) {
    const op = OPERATORS.find((o) => o.op === m![2]);
    if (op && !/[&|?]/.test(m[3]!)) return { field: m[1]!, operator: op.id, value: unquote(m[3]!) };
  }
  return undefined;
}

function unquote(v: string): string {
  const t = v.trim();
  if (t.startsWith('"') && t.endsWith('"')) {
    try {
      return JSON.parse(t);
    } catch {
      return t.slice(1, -1);
    }
  }
  return t;
}

/** ---- Friendly reading of formulas: row.quantity * row.rate -> "Quantity × Rate" ---- */
export function describeFormula(expr: string): string {
  return expr
    .replace(/\b(?:row|data|params|vars|parent)\.([\w.]+)/g, (_m, p: string) => titleCase(p.split(".").pop()!))
    .replace(/\*/g, "×")
    .replace(/\//g, "÷")
    .replace(/&&/g, " and ")
    .replace(/\|\|/g, " or ")
    .replace(/\s+/g, " ")
    .trim();
}

const ACRONYMS = new Set(["id", "mrn", "dob", "uhid", "sku", "url", "qr", "gst", "uom", "pdf", "csv", "api", "pan", "upi", "ifsc", "hsn"]);

export function titleCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export function checkExpression(expr: string): string | undefined {
  if (!expr.trim()) return undefined;
  try {
    Parser.parse(expr);
    return undefined;
  } catch (e) {
    return (e as Error).message.replace(/^Expression error in ".*?": /, "");
  }
}

/** ---- Number/date formats as pickers, stored as the engine's "kind:arg" strings ---- */
export interface FormatSpec {
  kind: "" | "currency" | "number" | "percent" | "date";
  arg: string;
}
export function parseFormat(f: string | undefined): FormatSpec {
  if (!f) return { kind: "", arg: "" };
  const [kind, ...rest] = f.split(":");
  return { kind: (kind as FormatSpec["kind"]) ?? "", arg: rest.join(":") };
}
export function buildFormat(s: FormatSpec): string | undefined {
  if (!s.kind) return undefined;
  return s.arg ? `${s.kind}:${s.arg}` : s.kind;
}

export const FUNCTIONS = [
  "upper", "lower", "trim", "concat", "substring", "replace", "contains", "startsWith", "endsWith",
  "round", "ceil", "floor", "abs", "min", "max", "formatDate", "addDays", "difference", "now",
  "formatCurrency", "formatNumber", "formatPercent", "sum", "avg", "count", "first", "last", "sumBy", "sumProduct", "avgBy", "minBy", "maxBy",
];
