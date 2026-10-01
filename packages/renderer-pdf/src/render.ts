import PDFDocument from "pdfkit";
import type { RenderInput, RenderResult, RendererCapabilities, ReportRenderer } from "@reporting/core";
import { paginate } from "@reporting/layout";
import { PdfFontRegistry, type FontOptions } from "./fonts.js";
import { drawNode } from "./draw-node.js";

export const pdfRendererCapabilities: RendererCapabilities = {
  id: "pdf",
  mimeType: "application/pdf",
  extension: "pdf",
  supports: ["*"],
};

export interface PdfRenderOptions {
  fonts?: FontOptions;
}

export class PdfRenderer implements ReportRenderer {
  readonly capabilities = pdfRendererCapabilities;

  constructor(private options: PdfRenderOptions = {}) {}

  async render(input: RenderInput): Promise<RenderResult> {
    const paginated = paginate(input.resolved, {
      resolvePageDependentSection: input.resolvePageSection,
    });

    const doc = new PDFDocument({
      autoFirstPage: false,
      margin: 0,
      info: { Title: input.resolved.name },
    });

    const fonts = new PdfFontRegistry(doc, this.options.fonts);
    const warnings = [...paginated.warnings];

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const ended = new Promise<void>((resolve) => doc.on("end", () => resolve()));

    for (const page of paginated.pages) {
      doc.addPage({ size: [paginated.pageSize.width, paginated.pageSize.height], margin: 0 });
      doc.fillColor("#000000");
      for (const node of [...page.header, ...page.content, ...page.footer]) {
        await drawNode({ doc, fonts, warnings }, node);
      }
    }

    if (paginated.pages.length === 0) {
      doc.addPage({ size: [paginated.pageSize.width, paginated.pageSize.height], margin: 0 });
    }

    doc.end();
    await ended;

    return {
      content: Buffer.concat(chunks),
      mimeType: this.capabilities.mimeType,
      extension: this.capabilities.extension,
      warnings,
    };
  }
}
