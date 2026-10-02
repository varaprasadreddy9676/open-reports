export interface HeaderCell {
  column: number;
  text: string;
  colSpan?: number;
  rowSpan?: number;
  align?: "left" | "center" | "right";
}

export type HeaderGrid = HeaderCell[][];
export type HeaderPoint = { row: number; column: number };

export function defaultHeaderGrid(columns: { header?: string; align?: HeaderCell["align"] }[]): HeaderGrid {
  return [columns.map((column, index) => ({ column: index, text: column.header ?? "", align: column.align }))];
}

export function addHeaderLevel(rows: HeaderGrid, columnCount: number): HeaderGrid {
  if (columnCount < 1) return rows;
  return [[{ column: 0, text: "Group", colSpan: columnCount }], ...rows];
}

export function appendHeaderColumn(rows: HeaderGrid, column: number, text: string): HeaderGrid {
  return rows.map((cells, row) => row === 0 ? [...cells, { column, text, rowSpan: rows.length }] : [...cells]);
}

export function removeHeaderColumn(rows: HeaderGrid, column: number): HeaderGrid {
  return rows.map((cells) => cells.flatMap((cell) => {
    const width = cell.colSpan ?? 1;
    if (column < cell.column) return [{ ...cell, column: cell.column - 1 }];
    if (column >= cell.column + width) return [{ ...cell }];
    if (width === 1) return [];
    return [{ ...cell, colSpan: width - 1 }];
  }));
}

export function headerCellAt(rows: HeaderGrid, point: HeaderPoint): HeaderCell | undefined {
  for (let row = 0; row <= point.row; row++) {
    for (const cell of rows[row] ?? []) {
      if (point.row < row + (cell.rowSpan ?? 1) && point.column >= cell.column && point.column < cell.column + (cell.colSpan ?? 1)) return cell;
    }
  }
  return undefined;
}

export function splitHeaderCell(rows: HeaderGrid, point: HeaderPoint): HeaderGrid {
  const ownerRow = rows.findIndex((cells, row) => row <= point.row && cells.some((cell) => point.row < row + (cell.rowSpan ?? 1) && point.column >= cell.column && point.column < cell.column + (cell.colSpan ?? 1)));
  if (ownerRow < 0) return rows;
  const owner = rows[ownerRow]!.find((cell) => point.column >= cell.column && point.column < cell.column + (cell.colSpan ?? 1) && point.row < ownerRow + (cell.rowSpan ?? 1))!;
  const next = rows.map((cells) => cells.filter((cell) => cell !== owner).map((cell) => ({ ...cell })));
  for (let row = ownerRow; row < ownerRow + (owner.rowSpan ?? 1); row++) for (let col = owner.column; col < owner.column + (owner.colSpan ?? 1); col++) {
    next[row]!.push({ column: col, text: row === ownerRow && col === owner.column ? owner.text : "", align: owner.align });
  }
  return next.map((cells) => cells.sort((a, b) => a.column - b.column));
}

export function mergeHeaderCells(rows: HeaderGrid, first: HeaderPoint, last: HeaderPoint): HeaderGrid | null {
  const top = Math.min(first.row, last.row), bottom = Math.max(first.row, last.row);
  const left = Math.min(first.column, last.column), right = Math.max(first.column, last.column);
  if (top === bottom && left === right) return null;
  const selected: { row: number; cell: HeaderCell }[] = [];
  rows.forEach((cells, row) => cells.forEach((cell) => {
    const cellBottom = row + (cell.rowSpan ?? 1) - 1, cellRight = cell.column + (cell.colSpan ?? 1) - 1;
    if (row <= bottom && cellBottom >= top && cell.column <= right && cellRight >= left) selected.push({ row, cell });
  }));
  if (selected.some(({ row, cell }) => row < top || row + (cell.rowSpan ?? 1) - 1 > bottom || cell.column < left || cell.column + (cell.colSpan ?? 1) - 1 > right)) return null;
  const anchor = selected.find(({ row, cell }) => row === top && cell.column === left)?.cell;
  if (!anchor) return null;
  const next = rows.map((cells) => cells.filter((cell) => !selected.some((item) => item.cell === cell)).map((cell) => ({ ...cell })));
  next[top]!.push({ column: left, text: anchor.text, colSpan: right - left + 1, rowSpan: bottom - top + 1, align: anchor.align });
  return next.map((cells) => cells.sort((a, b) => a.column - b.column));
}
