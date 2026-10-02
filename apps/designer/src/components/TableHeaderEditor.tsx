import { useState } from "react";
import { addHeaderLevel, defaultHeaderGrid, headerCellAt, mergeHeaderCells, splitHeaderCell, type HeaderGrid, type HeaderPoint } from "../lib/table-header";

export function TableHeaderEditor({ columns, headerRows, onChange }: { columns: { header?: string; align?: "left" | "center" | "right" }[]; headerRows?: HeaderGrid; onChange: (rows?: HeaderGrid) => void }) {
  const [first, setFirst] = useState<HeaderPoint | null>(null);
  const [last, setLast] = useState<HeaderPoint | null>(null);
  const [error, setError] = useState("");
  const rows = headerRows ?? defaultHeaderGrid(columns);
  const cell = first ? headerCellAt(rows, first) : undefined;
  const pick = (point: HeaderPoint) => {
    setError("");
    if (!first || last) { setFirst(point); setLast(null); }
    else setLast(point);
  };
  const merge = () => {
    if (!first || !last) return;
    const next = mergeHeaderCells(rows, first, last);
    if (!next) { setError("Select a complete rectangle of cells. Split any merged cell that crosses its edge first."); return; }
    onChange(next);
    setFirst({ row: Math.min(first.row, last.row), column: Math.min(first.column, last.column) });
    setLast(null);
  };
  const split = () => {
    if (!first || !cell) return;
    onChange(splitHeaderCell(rows, first));
    setFirst(null);
    setLast(null);
  };
  const setText = (text: string) => {
    if (!first) return;
    onChange(rows.map((cells, row) => cells.map((entry) => row === first.row && entry.column === first.column ? { ...entry, text } : entry)));
  };
  if (!columns.length) return <p className="muted small">Add table columns before editing the header.</p>;
  return <div data-testid="table-header-editor">
    <p className="muted small">Select two cells to merge a rectangle. Select a merged cell to split it.</p>
    <div className="table-header-grid" role="grid" aria-label="Table header grid" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows.length}, minmax(34px, auto))` }}>
      {rows.flatMap((cells, row) => cells.map((entry) => {
        const selected = (first?.row === row && first.column === entry.column) || (last?.row === row && last.column === entry.column);
        return <button key={`${row}-${entry.column}`} type="button" role="gridcell" aria-selected={selected} data-testid={`header-cell-${row}-${entry.column}`} className={selected ? "selected" : ""} style={{ gridColumn: `${entry.column + 1} / span ${entry.colSpan ?? 1}`, gridRow: `${row + 1} / span ${entry.rowSpan ?? 1}` }} onClick={() => pick({ row, column: entry.column })}>{entry.text || "(empty)"}</button>;
      }))}
    </div>
    {first && cell && <label className="field"><span className="field-label">Selected header text</span><input aria-label="Selected header text" value={cell.text} onChange={(event) => setText(event.target.value)} /></label>}
    <div className="table-header-actions">
      <button type="button" className="btn" data-testid="header-add-level" onClick={() => { onChange(addHeaderLevel(rows, columns.length)); setFirst(null); setLast(null); }}>+ Header level</button>
      <button type="button" className="btn" data-testid="header-merge" disabled={!first || !last} onClick={merge}>Merge cells</button>
      <button type="button" className="btn" data-testid="header-split" disabled={!first || !cell || ((cell.colSpan ?? 1) === 1 && (cell.rowSpan ?? 1) === 1)} onClick={split}>Split cell</button>
      {headerRows && <button type="button" className="btn" data-testid="header-reset" onClick={() => { onChange(undefined); setFirst(null); setLast(null); }}>Reset header</button>}
    </div>
    {error && <p className="danger small" role="alert">{error}</p>}
  </div>;
}
