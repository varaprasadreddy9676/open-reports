import type { ResolvedTableCellSpan } from "@reporting/core";

export type BodyPoint = { row: number; column: number };

export function mergeBodyCells(spans: ResolvedTableCellSpan[], first: BodyPoint, last: BodyPoint, rowCount: number, columnCount: number): ResolvedTableCellSpan[] | null {
  const top = Math.min(first.row, last.row), bottom = Math.max(first.row, last.row);
  const left = Math.min(first.column, last.column), right = Math.max(first.column, last.column);
  if (top === bottom && left === right || top < 0 || left < 0 || bottom >= rowCount || right >= columnCount) return null;
  const intersecting = spans.filter((span) => span.row <= bottom && span.row + (span.rowSpan ?? 1) - 1 >= top && span.column <= right && span.column + (span.colSpan ?? 1) - 1 >= left);
  if (intersecting.some((span) => span.row < top || span.row + (span.rowSpan ?? 1) - 1 > bottom || span.column < left || span.column + (span.colSpan ?? 1) - 1 > right)) return null;
  return [...spans.filter((span) => !intersecting.includes(span)), { row: top, column: left, rowSpan: bottom - top + 1, colSpan: right - left + 1 }];
}

export function splitBodyCell(spans: ResolvedTableCellSpan[], point: BodyPoint): ResolvedTableCellSpan[] {
  return spans.filter((span) => !(point.row >= span.row && point.row < span.row + (span.rowSpan ?? 1) && point.column >= span.column && point.column < span.column + (span.colSpan ?? 1)));
}

export function removeBodyColumn(spans: ResolvedTableCellSpan[], column: number): ResolvedTableCellSpan[] {
  return spans.flatMap((span) => {
    const width = span.colSpan ?? 1;
    if (column < span.column) return [{ ...span, column: span.column - 1 }];
    if (column >= span.column + width) return [{ ...span }];
    if (width === 1) return [];
    return [{ ...span, colSpan: width - 1 }];
  });
}
