import { useEffect, useMemo, useState } from "react";
import { tableCellSpanGrid, type ResolvedTableRow, type TableCellSpanDefinition } from "@reporting/core";
import { anchorOptions, describeAnchor, mergeBodyCells, splitBodyCell, type BodyMerges, type BodyPoint, type MergeAnchor } from "../lib/table-body";

const WINDOW = 8;
type ConfigColumn = { id?: string; header?: string; binding?: string; expression?: string };

export function TableBodyEditor({ columns, configColumns, rows, merges, onChange }: {
  columns: { id: string; header: string }[];
  configColumns: ConfigColumn[];
  rows: ResolvedTableRow[];
  merges: BodyMerges;
  onChange: (spans: TableCellSpanDefinition[]) => void;
}) {
  const [startInput, setStartInput] = useState(1);
  const [first, setFirst] = useState<BodyPoint | null>(null);
  const [last, setLast] = useState<BodyPoint | null>(null);
  const [anchorChoice, setAnchorChoice] = useState<string | null>(null);
  const [error, setError] = useState("");
  const start = Math.max(0, Math.min(Math.max(0, rows.length - 1), startInput - 1));
  const end = Math.min(rows.length, start + WINDOW);
  const grid = useMemo(() => tableCellSpanGrid(merges.resolved), [merges.resolved]);
  const headers = configColumns.map((column, index) => columns[index]?.header || column.header || "");
  const top = first && last ? Math.min(first.row, last.row) : first?.row;
  const options = useMemo(() => (top === undefined ? [] : anchorOptions(configColumns, rows, top)), [configColumns, rows, top]);
  const defaultChoice = options.findIndex((option) => option.unique);
  const choice = anchorChoice ?? (defaultChoice >= 0 ? `record:${defaultChoice}` : "position");

  const reset = () => { setFirst(null); setLast(null); setAnchorChoice(null); };
  // A selection made on an earlier row layout (before sorting, filtering or a data change) no longer means anything.
  const layoutKey = JSON.stringify(merges.resolved);
  useEffect(reset, [layoutKey, rows]);
  const pick = (point: BodyPoint) => {
    setError("");
    setAnchorChoice(null);
    if (!first || last) { setFirst(point); setLast(null); }
    else setLast(point);
  };
  const merge = () => {
    if (!first || !last) return;
    const option = choice.startsWith("record:") ? options[Number(choice.slice(7))] : undefined;
    const anchor: MergeAnchor = option ? { kind: "record", field: option.field, value: option.value } : { kind: "position" };
    const next = mergeBodyCells(merges, first, last, rows.length, columns.length, anchor);
    if (!next) { setError("Select a complete rectangle within the sample rows. Split any merge crossing its edge first."); return; }
    onChange(next);
    reset();
  };
  const split = () => {
    if (!first) return;
    const next = splitBodyCell(merges, first);
    if (next) onChange(next);
    reset();
  };
  if (!rows.length || !columns.length) return <p className="muted small">Add sample rows and columns to edit body cells.</p>;
  const selectedSlot = first ? grid.get(first.row)?.get(first.column) : undefined;
  const selectedConfig = selectedSlot?.span.source !== undefined ? merges.config[selectedSlot.span.source] : undefined;
  return <div data-testid="table-body-editor">
    <p className="muted small">Merges are placed on the sorted and filtered rows. Keep a merge with a record so it follows that record when the data changes. The top-left value prints; covered values are hidden. Turn on <strong>Merge repeated values</strong> for a column to merge equal values automatically.</p>
    <label className="field"><span className="field-label">Start at row</span><input aria-label="Start at row" type="number" min={1} max={rows.length} value={startInput} onChange={(event) => setStartInput(Math.max(1, Number(event.target.value) || 1))} /></label>
    <div className="table-body-grid" role="grid" aria-label="Sample table body" data-testid="body-grid" style={{ gridTemplateColumns: `48px repeat(${columns.length}, minmax(0, 1fr))`, gridTemplateRows: `28px repeat(${end - start}, minmax(32px, auto))` }}>
      <span className="table-body-corner" />
      {columns.map((column, index) => <strong key={index} style={{ gridColumn: index + 2, gridRow: 1 }}>{column.header || column.id}</strong>)}
      {rows.slice(start, end).flatMap((row, relativeRow) => {
        const rowIndex = start + relativeRow;
        const items = [<span key={`row-${rowIndex}`} className="table-body-row-number" style={{ gridColumn: 1, gridRow: relativeRow + 2 }}>{rowIndex + 1}</span>];
        columns.forEach((column, columnIndex) => {
          const slot = grid.get(rowIndex)?.get(columnIndex);
          if (slot && !slot.anchor && !(slot.span.row < start && rowIndex === start && slot.span.column === columnIndex)) return;
          const point = slot ? { row: slot.span.row, column: slot.span.column } : { row: rowIndex, column: columnIndex };
          const selected = (first?.row === point.row && first.column === point.column) || (last?.row === point.row && last.column === point.column);
          const rowSpan = slot ? Math.min(slot.span.row + (slot.span.rowSpan ?? 1), end) - rowIndex : 1;
          const automatic = slot?.span.source === undefined && Boolean(slot);
          const text = slot && !slot.anchor ? `↳ row ${slot.span.row + 1}` : row.formatted[column.id] ?? "";
          items.push(<button key={`${rowIndex}-${columnIndex}`} type="button" role="gridcell" aria-selected={selected} data-testid={`body-cell-${rowIndex}-${columnIndex}`}
            className={[selected ? "selected" : "", automatic ? "auto-merged" : ""].filter(Boolean).join(" ")}
            style={{ gridColumn: `${columnIndex + 2} / span ${slot?.span.colSpan ?? 1}`, gridRow: `${relativeRow + 2} / span ${rowSpan}` }}
            onClick={() => pick(point)} title={automatic ? `${text} (merged automatically: repeated values)` : text}>{text || "(empty)"}</button>);
        });
        return items;
      })}
    </div>
    {first && last && <label className="field"><span className="field-label">Keep this merge</span>
      <select data-testid="merge-anchor" aria-label="Keep this merge" value={choice} onChange={(event) => setAnchorChoice(event.target.value)}>
        {options.map((option, index) => {
          const header = headers[configColumns.findIndex((column) => (column.binding ?? column.expression) === option.field)] || option.field;
          return <option key={index} value={`record:${index}`}>{`With the record where ${header} = ${JSON.stringify(option.value)}${option.unique ? "" : " (not unique in the sample)"}`}</option>;
        })}
        <option value="position">{`At row ${(top ?? 0) + 1}, whatever record is there`}</option>
      </select>
    </label>}
    {selectedConfig && <p className="muted small" data-testid="merge-anchor-info">{describeAnchor(selectedConfig, headers, configColumns)}</p>}
    {selectedSlot && selectedSlot.span.source === undefined && <p className="muted small" data-testid="merge-anchor-info">Merged automatically because this column merges repeated values. Change it in the column settings.</p>}
    <div className="table-header-actions">
      <button type="button" className="btn" data-testid="body-merge" disabled={!first || !last} onClick={merge}>Merge cells</button>
      <button type="button" className="btn" data-testid="body-split" disabled={!selectedConfig} onClick={split}>Split cell</button>
    </div>
    {error && <p className="danger small" role="alert">{error}</p>}
  </div>;
}
