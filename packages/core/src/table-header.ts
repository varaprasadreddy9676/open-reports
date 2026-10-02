import type { ResolvedTableComponent, ResolvedTableHeaderCell } from "./resolved-report.js";

/** The optional grid replaces, rather than augments, the legacy header row. */
export function tableHeaderRows(table: Pick<ResolvedTableComponent, "columns" | "headerRows">): ResolvedTableHeaderCell[][] {
  return table.headerRows ?? [table.columns.map((column, index) => ({ column: index, text: column.header, align: column.align as ResolvedTableHeaderCell["align"] }))];
}

/** Reject gaps and overlaps so every renderer can consume the same grid. */
export function tableHeaderGridErrors(columns: number, rows: ResolvedTableHeaderCell[][]): string[] {
  const errors: string[] = [];
  if (columns === 0) return ["A table header needs at least one column."];
  const occupied = rows.map(() => Array<boolean>(columns).fill(false));
  rows.forEach((cells, row) => cells.forEach((cell) => {
    const colSpan = cell.colSpan ?? 1;
    const rowSpan = cell.rowSpan ?? 1;
    if (!Number.isInteger(cell.column) || cell.column < 0 || !Number.isInteger(colSpan) || colSpan < 1 || !Number.isInteger(rowSpan) || rowSpan < 1 || cell.column + colSpan > columns || row + rowSpan > rows.length) {
      errors.push(`Header cell at row ${row + 1}, column ${cell.column + 1} extends outside the header grid.`);
      return;
    }
    for (let y = row; y < row + rowSpan; y++) for (let x = cell.column; x < cell.column + colSpan; x++) {
      if (occupied[y]![x]) errors.push(`Header cells overlap at row ${y + 1}, column ${x + 1}.`);
      occupied[y]![x] = true;
    }
  }));
  occupied.forEach((cells, row) => cells.forEach((filled, column) => {
    if (!filled) errors.push(`Header grid has no cell at row ${row + 1}, column ${column + 1}.`);
  }));
  return errors;
}
