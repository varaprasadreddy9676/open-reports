import type { ReportRenderer } from "@reporting/core";
import { HtmlRenderer } from "@reporting/renderer-html";
import { PdfRenderer } from "@reporting/renderer-pdf";
import { XlsxRenderer } from "@reporting/renderer-xlsx";
import { CsvRenderer } from "@reporting/renderer-csv";

export type RenderFormat = "pdf" | "html" | "xlsx" | "csv";

export function createRendererRegistry(): Record<RenderFormat, ReportRenderer> {
  return {
    pdf: new PdfRenderer(),
    html: new HtmlRenderer(),
    xlsx: new XlsxRenderer(),
    csv: new CsvRenderer(),
  };
}

export function isRenderFormat(value: string): value is RenderFormat {
  return value === "pdf" || value === "html" || value === "xlsx" || value === "csv";
}
