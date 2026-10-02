import type { DatasetShape } from "@reporting/schema";
import { inferKind } from "./fields";

const MAX_ROWS = 20;
const MAX_NESTED_ITEMS = 10;
const MAX_NESTED_VISITS = 200;
const MAX_ISSUES = 100;

export interface SchemaPreviewIssue {
  code: "ROOT_KIND" | "ROW_KIND" | "MISSING_FIELD" | "FIELD_KIND";
  path: string;
  expected: string;
  actual: string;
  count: number;
  examples: string[];
}

export interface SchemaPreviewCheck {
  state: "unavailable" | "no-rows" | "checked";
  totalRows: number;
  checkedRows: number;
  uncheckedValues: number;
  omittedIssues: number;
  issues: SchemaPreviewIssue[];
}

function kindOf(value: unknown): string {
  return value === undefined ? "undefined" : value === null ? "null" : inferKind(value);
}

function matches(expected: DatasetShape["fields"][number]["kind"], value: unknown): boolean {
  if (expected === "string") return typeof value === "string";
  return inferKind(value) === expected;
}

/** Compares a bounded preview sample with author-declared fields; never alters source data. */
export function checkSchemaPreview(shape: DatasetShape, value: unknown): SchemaPreviewCheck {
  const result: SchemaPreviewCheck = { state: "checked", totalRows: 0, checkedRows: 0, uncheckedValues: 0, omittedIssues: 0, issues: [] };
  if (value === undefined) return { ...result, state: "unavailable" };

  const grouped = new Map<string, SchemaPreviewIssue>();
  let nestedVisits = 0;
  const add = (code: SchemaPreviewIssue["code"], path: string, expected: string, actual: string, location: string) => {
    const key = `${code}\u0000${path}\u0000${actual}`;
    let issue = grouped.get(key);
    if (!issue) {
      if (grouped.size >= MAX_ISSUES) { result.omittedIssues++; return; }
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
    const rows = shape.kind === "array" ? value as unknown[] : [value];
    result.totalRows = rows.length;
    result.checkedRows = Math.min(rows.length, MAX_ROWS);
    if (rows.length === 0) result.state = "no-rows";

    const visit = (current: unknown, parts: string[], path: string, expected: DatasetShape["fields"][number]["kind"], location: string): void => {
      if (parts.length === 0) {
        if (current === null || current === undefined) { result.uncheckedValues++; return; }
        if (!matches(expected, current)) add("FIELD_KIND", path, expected, kindOf(current), location);
        return;
      }
      if (Array.isArray(current)) {
        if (current.length === 0) { result.uncheckedValues++; return; }
        const available = Math.min(current.length, MAX_NESTED_ITEMS, MAX_NESTED_VISITS - nestedVisits);
        for (const [index, item] of current.slice(0, available).entries()) {
          nestedVisits++;
          visit(item, parts, path, expected, `${location}[${index + 1}]`);
        }
        result.uncheckedValues += current.length - available;
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
      visit((current as Record<string, unknown>)[head!], tail, path, expected, location);
    };

    for (const [index, row] of rows.slice(0, MAX_ROWS).entries()) {
      const location = shape.kind === "array" ? `row ${index + 1}` : "object";
      if (row === null || Array.isArray(row) || typeof row !== "object") {
        add("ROW_KIND", "", "object", kindOf(row), location);
        continue;
      }
      for (const field of shape.fields) visit(row, field.path.split("."), field.path, field.kind, location);
    }
  }

  result.issues = [...grouped.values()];
  return result;
}

export function schemaIssueMessage(issue: SchemaPreviewIssue): string {
  const example = issue.examples[0] ?? "preview";
  if (issue.code === "ROOT_KIND") return `Expected ${issue.expected}; preview is ${issue.actual}.`;
  if (issue.code === "ROW_KIND") return `${example}: expected an object record; got ${issue.actual}${issue.count > 1 ? ` (${issue.count} sampled rows)` : ""}.`;
  if (issue.code === "MISSING_FIELD") return `${issue.path} is missing at ${example}${issue.count > 1 ? ` (${issue.count} sampled values)` : ""}.`;
  return `${issue.path}: expected ${issue.expected}, got ${issue.actual} at ${example}${issue.count > 1 ? ` (${issue.count} sampled values)` : ""}.`;
}
