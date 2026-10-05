import type { ReportRenderer } from "@reporting/core";
import { HtmlRenderer } from "@reporting/renderer-html";
import { PdfRenderer } from "@reporting/renderer-pdf";
import { XlsxRenderer } from "@reporting/renderer-xlsx";
import { CsvRenderer } from "@reporting/renderer-csv";
import { ZplRenderer } from "@reporting/renderer-zpl";
import { EscPosRenderer } from "@reporting/renderer-escpos";
import { DocxRenderer } from "@reporting/renderer-docx";

export type RenderFormat = "pdf" | "html" | "xlsx" | "csv" | "docx" | "zpl" | "escpos";

export function createRendererRegistry(): Record<RenderFormat, ReportRenderer> {
  return {
    pdf: new PdfRenderer(),
    html: new HtmlRenderer(),
    xlsx: new XlsxRenderer(),
    csv: new CsvRenderer(),
    docx: new DocxRenderer(),
    zpl: new ZplRenderer(),
    escpos: new EscPosRenderer(),
  };
}

export function isRenderFormat(value: string): value is RenderFormat {
  return value === "pdf" || value === "html" || value === "xlsx" || value === "csv" || value === "docx" || value === "zpl" || value === "escpos";
}
