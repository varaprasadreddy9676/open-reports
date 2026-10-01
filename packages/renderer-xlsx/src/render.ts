import { PassThrough } from "node:stream";
import ExcelJS from "exceljs";
import type { RenderInput, RenderResult, RendererCapabilities, ReportRenderer, ResolvedTableComponent } from "@reporting/core";
import { findComponentsByType } from "@reporting/core";
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
      const sheet = workbook.addWorksheet(sanitizeSheetName(preferredName ?? `Table ${index + 1}`, index, usedNames), {
        views: t.showHeader ? [{ state: "frozen", ySplit: 1 }] : undefined,
        autoFilter: t.showHeader && t.columns.length > 0 ? { from: { row: 1, column: 1 }, to: { row: 1, column: t.columns.length } } : undefined,
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

function writeTable(sheet: ExcelJS.Worksheet, table: ResolvedTableComponent, warnings: RenderResult["warnings"]): void {
  sheet.columns = table.columns.map((col) => ({
    header: col.header,
    key: col.id,
    width: Math.max(10, col.header.length + 4),
  }));

  if (table.showHeader) {
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = HEADER_FILL;
      cell.border = THIN_BORDER;
    });
    headerRow.commit();
  }

  table.rows.forEach((row, i) => {
    const values: Record<string, unknown> = {};
    table.columns.forEach((col) => {
      values[col.id] = row.raw[col.id];
    });
    const sheetRow = sheet.addRow(values);
    table.columns.forEach((col, ci) => {
      const numFmt = excelNumberFormat(col.format);
      if (numFmt) sheetRow.getCell(ci + 1).numFmt = numFmt;
    });
    if (table.alternateRowStyle && i % 2 === 1) {
      sheetRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
      });
    }
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
    footerRow.commit();
  }

  if (!table.showFooter && !table.showHeader && table.rows.length === 0) {
    warnings.push({ code: "EMPTY_TABLE", path: table.id ?? "table", message: "Table has no rows and no header/footer; worksheet will be empty." });
  }

  sheet.commit();
}
