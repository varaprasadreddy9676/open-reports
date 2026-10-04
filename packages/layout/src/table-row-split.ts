import { isBold, tableCellSpanGrid, tableRowStyle, tableStylesOrDefault, type ResolvedTableComponent, type ResolvedTableRow } from "@reporting/core";
import type { ColumnWidth } from "./box-layout.js";
import { wrapTextLines, type TextMeasurer } from "./measure.js";

/** Body cell padding used by measureTableRowHeights: 2pt each side horizontally, 4pt in total vertically. */
const CELL_INSET = 4;
const ROW_PADDING = 4;

/**
 * Splits body row `rowIndex` at a line boundary so its first part fits `room` points: every cell keeps its
 * first lines in the first part and continues in a new row inserted after it. Values that end in the first part
 * (such as an id) are not repeated. Returns undefined when not even one line fits, when the row has a single line,
 * or when a merged cell that must stay whole covers the row.
 */
export function splitTableRow(table: ResolvedTableComponent, rowIndex: number, room: number, columnWidths: ColumnWidth[], measurer: TextMeasurer, fontSize: number): ResolvedTableComponent | undefined {
  const row = table.rows[rowIndex];
  if (!row) return undefined;
  const spans = table.cellSpans ?? [];
  const covering = spans.filter((span) => span.row <= rowIndex && rowIndex < span.row + (span.rowSpan ?? 1));
  if (covering.some((span) => !span.splittable)) return undefined;

  const lineHeight = measurer.lineHeight(fontSize);
  const fit = Math.floor((room - ROW_PADDING + 0.01) / lineHeight);
  if (fit < 1) return undefined;

  const style = tableRowStyle(tableStylesOrDefault(table), stripeOf(row, rowIndex), row.style as Record<string, unknown> | undefined);
  const hint = { bold: isBold(style), italic: Boolean(style.italic) };
  const grid = tableCellSpanGrid(spans);
  const top: Record<string, string> = {};
  const rest: Record<string, string> = {};
  let longest = 0;
  table.columns.forEach((column, columnIndex) => {
    const text = row.formatted[column.id] ?? "";
    // A merged cell is drawn from its anchor row, so only measure cells this row draws itself.
    if (grid.get(rowIndex)?.get(columnIndex)) {
      top[column.id] = text;
      rest[column.id] = "";
      return;
    }
    const lines = wrapTextLines(text, Math.max(1, columnWidths[columnIndex]!.width - CELL_INSET), fontSize, measurer, hint);
    longest = Math.max(longest, lines.length);
    top[column.id] = lines.slice(0, fit).join("\n");
    rest[column.id] = lines.slice(fit).join("\n");
  });
  if (longest <= fit) return undefined;

  const stripe = stripeOf(row, rowIndex);
  const parts: ResolvedTableRow[] = [
    { ...row, formatted: top, stripeIndex: stripe },
    { ...row, formatted: rest, stripeIndex: stripe, continued: true },
  ];
  const rows = table.rows.map((r, i) => (r.stripeIndex === undefined ? { ...r, stripeIndex: i } : r));
  rows.splice(rowIndex, 1, ...parts);
  const cellSpans = spans.map((span) => {
    if (span.row > rowIndex) return { ...span, row: span.row + 1 };
    if (span.row + (span.rowSpan ?? 1) > rowIndex) return { ...span, rowSpan: (span.rowSpan ?? 1) + 1 };
    return span;
  });
  return { ...table, rows, ...(spans.length ? { cellSpans } : {}) };
}

/** Index whose zebra stripe a row uses: its source record, even after earlier rows were split. */
export function stripeOf(row: ResolvedTableRow | undefined, index: number): number {
  return row?.stripeIndex ?? index;
}
