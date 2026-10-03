import type { ResolvedTableCellSpan, ResolvedTableRow, TableCellSpanDefinition } from "@reporting/core";

export type BodyPoint = { row: number; column: number };
/** Where a new merge is kept: at a row position, or with the record whose `field` has `value`. */
export type MergeAnchor = { kind: "position" } | { kind: "record"; field: string; value: string | number | boolean | null };
/** The table's configured merges plus where the engine placed them in the sample (resolved spans carry `source`). */
export interface BodyMerges {
  config: TableCellSpanDefinition[];
  resolved: ResolvedTableCellSpan[];
}
type ColumnLike = { id?: string; header?: string; binding?: string; expression?: string };
export interface AnchorOption {
  field: string;
  value: string | number | boolean | null;
  unique: boolean;
  columnId: string;
}

const columnId = (column: ColumnLike) => column.id ?? column.binding ?? column.header ?? "";
const covers = (span: ResolvedTableCellSpan, point: BodyPoint) =>
  point.row >= span.row && point.row < span.row + (span.rowSpan ?? 1) && point.column >= span.column && point.column < span.column + (span.colSpan ?? 1);
const isPrimitive = (value: unknown): value is string | number | boolean | null => value === null || ["string", "number", "boolean"].includes(typeof value);

/** Merges the selected rectangle. Explicit merges wholly inside it are replaced; a merge crossing its edge blocks it. */
export function mergeBodyCells(merges: BodyMerges, first: BodyPoint, last: BodyPoint, rowCount: number, columnCount: number, anchor: MergeAnchor): TableCellSpanDefinition[] | null {
  const top = Math.min(first.row, last.row), bottom = Math.max(first.row, last.row);
  const left = Math.min(first.column, last.column), right = Math.max(first.column, last.column);
  if ((top === bottom && left === right) || top < 0 || left < 0 || bottom >= rowCount || right >= columnCount) return null;
  const intersecting = merges.resolved.filter((span) => span.source !== undefined && span.row <= bottom && span.row + (span.rowSpan ?? 1) - 1 >= top && span.column <= right && span.column + (span.colSpan ?? 1) - 1 >= left);
  if (intersecting.some((span) => span.row < top || span.row + (span.rowSpan ?? 1) - 1 > bottom || span.column < left || span.column + (span.colSpan ?? 1) - 1 > right)) return null;
  const replaced = new Set(intersecting.map((span) => span.source));
  const size = { column: left, rowSpan: bottom - top + 1, colSpan: right - left + 1 };
  const added: TableCellSpanDefinition = anchor.kind === "record" ? { match: { field: anchor.field, value: anchor.value }, ...size } : { row: top, ...size };
  return [...merges.config.filter((_, index) => !replaced.has(index)), added];
}

/** Removes the explicit merge covering `point`; null when there is nothing to split or the merge is automatic. */
export function splitBodyCell(merges: BodyMerges, point: BodyPoint): TableCellSpanDefinition[] | null {
  const span = merges.resolved.find((candidate) => covers(candidate, point));
  if (!span || span.source === undefined) return null;
  return merges.config.filter((_, index) => index !== span.source);
}

/** Column values of one sample row that can identify its record, flagged when the value is unique in the sample. */
export function anchorOptions(columns: ColumnLike[], rows: ResolvedTableRow[], rowIndex: number): AnchorOption[] {
  const row = rows[rowIndex];
  if (!row) return [];
  return columns.flatMap((column) => {
    const field = column.binding ?? column.expression;
    const id = columnId(column);
    const value = row.raw[id];
    if (!field || !isPrimitive(value)) return [];
    const unique = value !== null && rows.filter((other) => other.raw[id] === value).length === 1;
    return [{ field, value, unique, columnId: id }];
  });
}

export function describeAnchor(span: TableCellSpanDefinition, headers: string[], columns: ColumnLike[]): string {
  if (!span.match) return `Fixed at row ${(span.row ?? 0) + 1}`;
  const index = columns.findIndex((column) => (column.binding ?? column.expression) === span.match!.field);
  const name = index >= 0 ? headers[index] || columnId(columns[index]!) : span.match.field;
  return `Follows the record where ${name} = ${JSON.stringify(span.match.value)}`;
}

export function removeBodyColumn<T extends { column: number; colSpan?: number }>(spans: T[], column: number): T[] {
  return spans.flatMap((span) => {
    const width = span.colSpan ?? 1;
    if (column < span.column) return [{ ...span, column: span.column - 1 }];
    if (column >= span.column + width) return [{ ...span }];
    if (width === 1) return [];
    return [{ ...span, colSpan: width - 1 }];
  });
}
