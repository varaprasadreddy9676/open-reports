import type { ResolvedTableCellSpan } from "./resolved-report.js";

export interface TableCellSlot {
  span: ResolvedTableCellSpan;
  anchor: boolean;
}

/** Validate positional body merges without expanding potentially large ranges. */
export function tableCellSpanErrors(columns: number, spans: ResolvedTableCellSpan[], rows?: number): string[] {
  const errors: string[] = [];
  spans.forEach((span, index) => {
    const width = span.colSpan ?? 1, height = span.rowSpan ?? 1;
    if (!Number.isInteger(span.row) || span.row < 0 || !Number.isInteger(span.column) || span.column < 0 || !Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1 || span.column + width > columns || (rows !== undefined && span.row + height > rows)) {
      errors.push(`Body merge ${index + 1} extends outside the table grid.`);
    }
  });
  for (let a = 0; a < spans.length; a++) for (let b = a + 1; b < spans.length; b++) {
    const x = spans[a]!, y = spans[b]!;
    if (x.row < y.row + (y.rowSpan ?? 1) && y.row < x.row + (x.rowSpan ?? 1) && x.column < y.column + (y.colSpan ?? 1) && y.column < x.column + (x.colSpan ?? 1)) {
      errors.push(`Body merges ${a + 1} and ${b + 1} overlap.`);
    }
  }
  return errors;
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
