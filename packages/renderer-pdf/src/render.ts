import PDFDocument from "pdfkit";
import type { RenderInput, RenderResult, RendererCapabilities, ReportRenderer } from "@reporting/core";
import { paginate, type TextMeasurer } from "@reporting/layout";
import { PdfFontRegistry, discoverFonts, type FontOptions } from "./fonts.js";
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

  private fontOptions: FontOptions;

  constructor(options: PdfRenderOptions = {}) {
    // Embed real Unicode fonts when available (Noto), instead of the 14 standard
    // PDF fonts, which have no Indic/Arabic glyphs and mangle symbols like the rupee sign.
    this.fontOptions = options.fonts ?? discoverFonts();
  }

  async render(input: RenderInput): Promise<RenderResult> {
    const doc = new PDFDocument({
      autoFirstPage: false,
      margin: 0,
      info: { Title: input.resolved.name },
    });

    const fonts = new PdfFontRegistry(doc, this.fontOptions);
    const defaultFamily = input.resolved.theme?.fonts?.body;

    // Paginate with the real font metrics of the fonts that will actually be
    // embedded, so line wrapping and page breaks match what gets drawn.
    const measurer = createPdfMeasurer(doc, fonts, defaultFamily);
    const paginated = paginate(input.resolved, {
      resolvePageDependentSection: input.resolvePageSection,
      measurer,
    });
    const warnings = [...paginated.warnings];

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const ended = new Promise<void>((resolve) => doc.on("end", () => resolve()));

    for (const page of paginated.pages) {
      doc.addPage({ size: [paginated.pageSize.width, paginated.pageSize.height], margin: 0 });
      doc.fillColor("#000000");
      for (const node of [...page.header, ...page.content, ...page.footer]) {
        await drawNode({ doc, fonts, warnings, defaultFamily, measurer }, node);
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

export function createPdfMeasurer(doc: PDFKit.PDFDocument, fonts: PdfFontRegistry, defaultFamily?: string): TextMeasurer {
  return {
    widthOf(text, fontSize, hint) {
      let width = 0;
      for (const run of fonts.runs(text, hint?.family ?? defaultFamily, Boolean(hint?.bold), Boolean(hint?.italic))) {
        width += doc.font(run.font).fontSize(fontSize).widthOfString(run.text);
      }
      return width;
    },
    lineHeight(fontSize, hint) {
      return doc.font(fonts.resolve(hint?.family ?? defaultFamily, Boolean(hint?.bold), Boolean(hint?.italic))).fontSize(fontSize).currentLineHeight(true);
    },
  };
}
