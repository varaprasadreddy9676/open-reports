import type { DatasetShape } from "@reporting/schema";

export type FieldKind = DatasetShape["fields"][number]["kind"];

export interface ShapeIssue {
  code: "ROOT_KIND" | "ROW_KIND" | "MISSING_FIELD" | "FIELD_KIND";
  path: string;
  expected: string;
  actual: string;
  count: number;
  examples: string[];
}

export interface ShapeCheck {
  state: "unavailable" | "no-rows" | "checked";
  totalRows: number;
  checkedRows: number;
  /** False when a limit stopped the check before every value was seen. */
  complete: boolean;
  /** Null or empty values, and nested values skipped by a limit, that could not be checked. */
  uncheckedValues: number;
  omittedIssues: number;
  issues: ShapeIssue[];
}

export interface ShapeCheckLimits {
  maxRows?: number;
  maxNestedItems?: number;
  /** Total values to inspect before stopping (bounds the work on very large responses). */
  maxVisits?: number;
  maxIssues?: number;
}

const DEFAULT_LIMITS: Required<ShapeCheckLimits> = { maxRows: Infinity, maxNestedItems: Infinity, maxVisits: 5_000_000, maxIssues: 100 };

export function inferFieldKind(value: unknown): FieldKind {
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  if (value !== null && typeof value === "object") return "object";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}([T ]|$)/.test(value) && !Number.isNaN(Date.parse(value))) return "date";
  return "string";
}

const kindOf = (value: unknown) => (value === undefined ? "undefined" : value === null ? "null" : inferFieldKind(value));
const matches = (expected: FieldKind, value: unknown) => (expected === "string" ? typeof value === "string" : inferFieldKind(value) === expected);

/** Compares a dataset value with its author-declared fields. Never alters the data. */
export function checkDatasetShape(shape: DatasetShape, value: unknown, limits: ShapeCheckLimits = {}): ShapeCheck {
  const { maxRows, maxNestedItems, maxVisits, maxIssues } = { ...DEFAULT_LIMITS, ...limits };
  const result: ShapeCheck = { state: "checked", totalRows: 0, checkedRows: 0, complete: true, uncheckedValues: 0, omittedIssues: 0, issues: [] };
  if (value === undefined) return { ...result, state: "unavailable", complete: false };

  const grouped = new Map<string, ShapeIssue>();
  let visits = 0;
  const add = (code: ShapeIssue["code"], path: string, expected: string, actual: string, location: string) => {
    const key = `${code}\u0000${path}\u0000${actual}`;
    let issue = grouped.get(key);
    if (!issue) {
      if (grouped.size >= maxIssues) { result.omittedIssues++; return; }
      issue = { code, path, expected, actual, count: 0, examples: [] };
      grouped.set(key, issue);
    }
    issue.count++;
    if (issue.examples.length < 3) issue.examples.push(location);
  };

  if (shape.kind === "array" && !Array.isArray(value)) {
    add("ROOT_KIND", "", "list of records", kindOf(value), "dataset");
  } else if (shape.kind === "object" && (value === null || Array.isArray(value) || typeof value !== "object")) {
    add("ROOT_KIND", "", "object", kindOf(value), "dataset");
  } else {
    const rows = shape.kind === "array" ? (value as unknown[]) : [value];
    result.totalRows = rows.length;
    if (rows.length === 0) result.state = "no-rows";

    const visit = (current: unknown, parts: string[], path: string, expected: FieldKind, location: string, key: string): void => {
      visits++;
      if (parts.length === 0) {
        if (current === null || current === undefined) { result.uncheckedValues++; return; }
        if (!matches(expected, current)) add("FIELD_KIND", path, expected, kindOf(current), location);
        return;
      }
      if (Array.isArray(current)) {
        if (current.length === 0) { result.uncheckedValues++; return; }
        const available = Math.min(current.length, maxNestedItems);
        if (available < current.length) { result.uncheckedValues += current.length - available; result.complete = false; }
        for (let index = 0; index < available; index++) visit(current[index], parts, path, expected, `${location} ${key}[${index + 1}]`, key);
        return;
      }
      if (current === null || current === undefined) { result.uncheckedValues++; return; }
      if (typeof current !== "object") {
        add("MISSING_FIELD", path, expected, kindOf(current), location);
        return;
      }
      const [head, ...tail] = parts;
      if (!Object.hasOwn(current, head!)) {
        add("MISSING_FIELD", path, expected, "missing", location);
        return;
      }
      visit((current as Record<string, unknown>)[head!], tail, path, expected, location, head!);
    };

    for (let index = 0; index < rows.length; index++) {
      if (index >= maxRows || visits >= maxVisits) { result.complete = false; break; }
      const row = rows[index];
      const location = shape.kind === "array" ? `row ${index + 1}` : "object";
      result.checkedRows++;
      if (row === null || Array.isArray(row) || typeof row !== "object") {
        add("ROW_KIND", "", "object", kindOf(row), location);
        continue;
      }
      for (const field of shape.fields) visit(row, field.path.split("."), field.path, field.kind, location, "");
    }
  }

  result.issues = [...grouped.values()];
  return result;
}

export function shapeIssueMessage(issue: ShapeIssue): string {
  const example = issue.examples[0] ?? "the data";
  const more = (noun: string) => (issue.count > 1 ? ` (${issue.count} ${noun})` : "");
  if (issue.code === "ROOT_KIND") return `Expected ${issue.expected}; the data is ${issue.actual}.`;
  if (issue.code === "ROW_KIND") return `${example}: expected an object record; got ${issue.actual}${more("rows")}.`;
  if (issue.code === "MISSING_FIELD") return `${issue.path} is missing at ${example}${more("values")}.`;
  return `${issue.path}: expected ${issue.expected}, got ${issue.actual} at ${example}${more("values")}.`;
}

/** One-paragraph summary of a check for render warnings and errors. */
export function shapeCheckSummary(datasetId: string, check: ShapeCheck): string {
  const scope = check.complete ? `checked ${check.checkedRows} of ${check.totalRows} rows` : `checked ${check.checkedRows} of ${check.totalRows} rows before the check limit`;
  const issues = check.issues.map(shapeIssueMessage).join(" ");
  const omitted = check.omittedIssues ? ` ${check.omittedIssues} more problem${check.omittedIssues === 1 ? "" : "s"} not listed.` : "";
  return `${datasetId} does not match its declared fields (${scope}). ${issues}${omitted}`;
}
