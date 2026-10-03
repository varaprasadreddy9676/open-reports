import { Parser } from "@reporting/expressions";
import type { ResolvedTableCellSpan } from "./resolved-report.js";

export interface TableCellSlot {
  span: ResolvedTableCellSpan;
  anchor: boolean;
}

/** A body merge as written in a report: at a row position, or at the first row whose `match.field` equals `match.value`. */
export interface TableCellSpanDefinition {
  row?: number;
  match?: { field: string; value: string | number | boolean | null };
  column: number;
  colSpan?: number;
  rowSpan?: number;
}

const overlaps = (a: ResolvedTableCellSpan, b: ResolvedTableCellSpan) =>
  a.row < b.row + (b.rowSpan ?? 1) && b.row < a.row + (a.rowSpan ?? 1) && a.column < b.column + (b.colSpan ?? 1) && b.column < a.column + (a.colSpan ?? 1);

/** Validate body merges without expanding potentially large ranges. Record-anchored merges are placed only at render time. */
export function tableCellSpanErrors(columns: number, spans: TableCellSpanDefinition[], rows?: number): string[] {
  const errors: string[] = [];
  spans.forEach((span, index) => {
    const label = `Body merge ${index + 1}`;
    const width = span.colSpan ?? 1, height = span.rowSpan ?? 1;
    if ((span.row === undefined) === (span.match === undefined)) {
      errors.push(`${label} needs either a row position or a record match.`);
      return;
    }
    if (span.match) {
      try {
        Parser.parse(span.match.field);
      } catch (err) {
        errors.push(`${label} record match field is not a valid expression: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    const rowOk = span.row === undefined || (Number.isInteger(span.row) && span.row >= 0 && (rows === undefined || span.row + height <= rows));
    if (!rowOk || !Number.isInteger(span.column) || span.column < 0 || !Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1 || span.column + width > columns) {
      errors.push(`${label} extends outside the table grid.`);
    }
  });
  const positional = spans.map((span, index) => ({ span, index })).filter(({ span }) => span.row !== undefined && span.match === undefined);
  for (let a = 0; a < positional.length; a++) for (let b = a + 1; b < positional.length; b++) {
    if (overlaps(positional[a]!.span as ResolvedTableCellSpan, positional[b]!.span as ResolvedTableCellSpan)) errors.push(`Body merges ${positional[a]!.index + 1} and ${positional[b]!.index + 1} overlap.`);
  }
  return errors;
}

/**
 * Vertical merges of repeated values. Columns are processed left to right; a run ends where the value changes or where a
 * merge in a column to its left ends, so nested categories (region > country > city) merge inside each other. Blank values
 * never merge. The result is ordered by column, then row.
 */
export function repeatedValueSpans(mergeColumns: boolean[], values: string[][]): ResolvedTableCellSpan[] {
  const spans: ResolvedTableCellSpan[] = [];
  const boundaries = new Set<number>();
  mergeColumns.forEach((merge, column) => {
    if (!merge) return;
    let start = 0;
    const close = (end: number) => {
      if (end - start > 1 && (values[start]?.[column] ?? "") !== "") spans.push({ row: start, column, rowSpan: end - start, splittable: true });
      boundaries.add(start);
      start = end;
    };
    for (let row = 1; row <= values.length; row++) {
      if (row === values.length || boundaries.has(row) || values[row]![column] !== values[start]![column]) close(row);
    }
  });
  return spans;
}

/** Explicit merges first (later ones that collide are dropped), then automatic merges that do not overlap them. */
export function combineTableSpans(
  explicit: ResolvedTableCellSpan[],
  automatic: ResolvedTableCellSpan[],
  warn: (code: string, message: string) => void,
): ResolvedTableCellSpan[] {
  const out: ResolvedTableCellSpan[] = [];
  for (const span of explicit) {
    if (out.some((kept) => overlaps(kept, span))) warn("TABLE_SPAN_CONFLICT", `Body merge at row ${span.row + 1}, column ${span.column + 1} overlaps an earlier merge in this output and was skipped.`);
    else out.push(span);
  }
  const explicitCount = out.length;
  for (const span of automatic) {
    if (out.slice(0, explicitCount).some((kept) => overlaps(kept, span))) warn("TABLE_AUTO_MERGE_CONFLICT", `Repeated values from row ${span.row + 1} in column ${span.column + 1} were not merged because an explicit merge covers part of them.`);
    else out.push(span);
  }
  return out;
}

/** Materialize only cells covered by explicit merges. Ordinary cells stay implicit. */
export function tableCellSpanGrid(spans: ResolvedTableCellSpan[]): Map<number, Map<number, TableCellSlot>> {
  const grid = new Map<number, Map<number, TableCellSlot>>();
  for (const span of spans) for (let row = span.row; row < span.row + (span.rowSpan ?? 1); row++) {
    let cells = grid.get(row);
    if (!cells) grid.set(row, (cells = new Map()));
    for (let column = span.column; column < span.column + (span.colSpan ?? 1); column++) {
      cells.set(column, { span, anchor: row === span.row && column === span.column });
    }
  }
  return grid;
}

/**
 * The spans of one page slice (rows `start` to `end`): spans outside are dropped, and a splittable span that continues
 * across the slice edge is clipped and re-anchored on the slice's first row, so its value prints again on the new page.
 */
export function sliceTableSpans(spans: ResolvedTableCellSpan[], start: number, end: number): ResolvedTableCellSpan[] {
  const out: ResolvedTableCellSpan[] = [];
  for (const span of spans) {
    const spanEnd = span.row + (span.rowSpan ?? 1);
    if (spanEnd <= start || span.row >= end) continue;
    if (span.row >= start && spanEnd <= end) out.push(span);
    else if (span.splittable) {
      const row = Math.max(span.row, start);
      const rowSpan = Math.min(spanEnd, end) - row;
      if (rowSpan > 1 || (span.colSpan ?? 1) > 1) out.push({ ...span, row, rowSpan });
    }
  }
  return out;
}
