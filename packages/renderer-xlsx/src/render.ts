import { PassThrough } from "node:stream";
import ExcelJS from "exceljs";
import type { RenderInput, RenderResult, RendererCapabilities, ReportRenderer, ResolvedTableComponent } from "@reporting/core";
import { findComponentsByType, isBold, tableCellSpanGrid, tableHeaderRows, tableRowStyle, type TablePartStyle } from "@reporting/core";
import { excelNumberFormat } from "./formats.js";
import { sanitizeSheetName } from "./sheet-name.js";

export const xlsxRendererCapabilities: RendererCapabilities = {
  id: "xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  extension: "xlsx",
  supports: ["table", "text", "field"],
};

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  bottom: { style: "thin" },
};

export class XlsxRenderer implements ReportRenderer {
  readonly capabilities = xlsxRendererCapabilities;

  async render(input: RenderInput): Promise<RenderResult> {
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<void>((resolve, reject) => {
      stream.on("end", () => resolve());
      stream.on("error", reject);
    });

    // Streaming writer: rows are committed and released as we go, rather
    // than building the whole workbook object graph in memory first -- this
    // is what keeps a 100k-row export from needing 100k rows resident at once.
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true });

    const tables = findComponentsByType(input.resolved, "table");
    const warnings = [...input.resolved.warnings];
    const usedNames = new Set<string>();

    if (tables.length === 0) {
      const sheet = workbook.addWorksheet(sanitizeSheetName(input.resolved.name, 0, usedNames));
      sheet.addRow(["This report has no table component to export as XLSX."]).commit();
      sheet.commit();
    }

    tables.forEach((table, index) => {
      const preferredName = index === 0 ? input.resolved.exports?.xlsx?.sheetName ?? table.id ?? (table as any).dataset : table.id ?? (table as any).dataset;
      const t = table as ResolvedTableComponent;
      const headerCount = t.showHeader ? (t.headerRows?.length ?? 1) : 0;
      const sheet = workbook.addWorksheet(sanitizeSheetName(preferredName ?? `Table ${index + 1}`, index, usedNames), {
        views: headerCount ? [{ state: "frozen", ySplit: headerCount }] : undefined,
        autoFilter: headerCount && t.columns.length > 0 ? { from: { row: headerCount, column: 1 }, to: { row: headerCount, column: t.columns.length } } : undefined,
      } as any);
      writeTable(sheet, t, warnings);
    });

    await workbook.commit();
    stream.end();
    await finished;

    return {
      content: Buffer.concat(chunks),
      mimeType: this.capabilities.mimeType,
      extension: this.capabilities.extension,
      warnings,
    };
  }
}

/** "#rgb" / "#rrggbb" to Excel ARGB; other colour forms are not representable and are skipped. */
function argb(color: unknown): string | undefined {
  if (typeof color !== "string") return undefined;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return undefined;
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  return `FF${full.toUpperCase()}`;
}

/**
 * Paints cells of a styled table as they are written (the streaming writer cannot change committed rows).
 * Returns undefined for tables without table styles, which keep the historical look.
 */
function tablePainter(table: ResolvedTableComponent, headerCount: number) {
  const styles = table.styles;
  if (!styles) return undefined;
  const side = { style: "thin" as const, color: { argb: argb(styles.grid.color) ?? "FF000000" } };
  const all = { top: side, right: side, bottom: side, left: side };
  const lines = styles.grid.lines;
  const paint = (cell: ExcelJS.Cell, style: TablePartStyle & Record<string, unknown>, border: Partial<ExcelJS.Borders>) => {
    const color = argb(style.color);
    cell.font = { ...(cell.font ?? {}), bold: isBold(style), italic: Boolean(style.italic), ...(color ? { color: { argb: color } } : {}) };
    const fill = argb(style.background);
    cell.fill = fill ? { type: "pattern", pattern: "solid", fgColor: { argb: fill } } : { type: "pattern", pattern: "none" };
    cell.border = border;
  };
  const eachCell = (row: ExcelJS.Row, fn: (cell: ExcelJS.Cell) => void) => { for (let column = 1; column <= table.columns.length; column++) fn(row.getCell(column)); };
  return {
    header(row: ExcelJS.Row, headerRow: number) {
      eachCell(row, (cell) => paint(cell, styles.header as Record<string, unknown>, lines === "all" ? all : lines === "none" ? {} : headerRow === headerCount ? { bottom: side } : {}));
    },
    body(row: ExcelJS.Row, index: number) {
      const style = tableRowStyle(styles, index, table.rows[index]!.style as Record<string, unknown> | undefined);
      const border = lines === "all" ? all : lines === "horizontal" && index < table.rows.length - 1 ? { bottom: side } : {};
      eachCell(row, (cell) => paint(cell, style, border));
    },
    footer(row: ExcelJS.Row) {
      eachCell(row, (cell) => paint(cell, styles.footer as Record<string, unknown>, lines === "all" ? all : lines === "none" ? {} : { top: side }));
    },
  };
}

function writeTable(sheet: ExcelJS.Worksheet, table: ResolvedTableComponent, warnings: RenderResult["warnings"]): void {
  const painter = tablePainter(table, table.showHeader ? (table.headerRows?.length ?? 1) : 0);
  sheet.columns = table.columns.map((col) => ({
    header: table.showHeader && !table.headerRows ? col.header : undefined,
    key: col.id,
    width: Math.max(10, col.header.length + 4),
  }));

  if (table.showHeader) {
    if (table.headerRows) {
      const rows = tableHeaderRows(table);
      rows.forEach((cells, row) => cells.forEach((cell) => {
        if ((cell.colSpan ?? 1) > 1 || (cell.rowSpan ?? 1) > 1) sheet.mergeCells(row + 1, cell.column + 1, row + (cell.rowSpan ?? 1), cell.column + (cell.colSpan ?? 1));
      }));
      rows.forEach((cells, row) => {
        const headerRow = sheet.getRow(row + 1);
        cells.forEach((cell) => {
          const x = headerRow.getCell(cell.column + 1);
          x.value = cell.text;
          x.alignment = { horizontal: cell.align ?? "left", vertical: "middle", wrapText: true };
          x.font = { bold: true };
          x.fill = HEADER_FILL;
          x.border = THIN_BORDER;
        });
        painter?.header(headerRow, row + 1);
        headerRow.commit();
      });
    } else {
      const headerRow = sheet.getRow(1);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = HEADER_FILL;
        cell.border = THIN_BORDER;
      });
      painter?.header(headerRow, 1);
      headerRow.commit();
    }
  }

  const headerCount = table.showHeader ? (table.headerRows?.length ?? 1) : 0;
  const spanGrid = tableCellSpanGrid(table.cellSpans ?? []);
  for (const span of table.cellSpans ?? []) {
    if ((span.colSpan ?? 1) > 1 || (span.rowSpan ?? 1) > 1) sheet.mergeCells(headerCount + span.row + 1, span.column + 1, headerCount + span.row + (span.rowSpan ?? 1), span.column + (span.colSpan ?? 1));
  }

  table.rows.forEach((row, i) => {
    const sheetRow = sheet.getRow(headerCount + i + 1);
    table.columns.forEach((col, column) => {
      const slot = spanGrid.get(i)?.get(column);
      if (!slot || slot.anchor) sheetRow.getCell(column + 1).value = row.raw[col.id] as ExcelJS.CellValue;
    });
    table.columns.forEach((col, ci) => {
      const slot = spanGrid.get(i)?.get(ci);
      if (slot && !slot.anchor) return;
      const numFmt = excelNumberFormat(col.format);
      if (numFmt) sheetRow.getCell(ci + 1).numFmt = numFmt;
    });
    if (table.alternateRowStyle && i % 2 === 1) {
      sheetRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
      });
    }
    painter?.body(sheetRow, i);
    sheetRow.commit();
  });

  if (table.showFooter) {
    const footerValues: Record<string, unknown> = {};
    table.columns.forEach((col) => {
      footerValues[col.id] = col.footer?.raw ?? col.footer?.value ?? "";
    });
    const footerRow = sheet.addRow(footerValues);
    footerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.border = { top: { style: "thin" } };
    });
    table.columns.forEach((col, ci) => {
      const numFmt = excelNumberFormat(col.format);
      if (numFmt && typeof col.footer?.raw === "number") footerRow.getCell(ci + 1).numFmt = numFmt;
    });
    painter?.footer(footerRow);
    footerRow.commit();
  }

  if (!table.showFooter && !table.showHeader && table.rows.length === 0) {
    warnings.push({ code: "EMPTY_TABLE", path: table.id ?? "table", message: "Table has no rows and no header/footer; worksheet will be empty." });
  }

  sheet.commit();
}
