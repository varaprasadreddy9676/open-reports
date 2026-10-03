import PDFDocument from "pdfkit";
import type { RenderInput, RenderResult, RendererCapabilities, ReportRenderer } from "@reporting/core";
import { paginate, type PaginatedReport, type TextMeasurer } from "@reporting/layout";
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

  /** Pagination only (no drawing), using the same font metrics as render(): what the designer's analyzer and AI tools use. */
  paginateOnly(input: RenderInput): PaginatedReport {
    const doc = new PDFDocument({ autoFirstPage: false, margin: 0 });
    const fonts = new PdfFontRegistry(doc, this.fontOptions);
    const measurer = createPdfMeasurer(doc, fonts, input.resolved.theme?.fonts?.body);
    return paginate(input.resolved, { resolvePageDependentSection: input.resolvePageSection, measurer });
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
    const warnings = [...input.resolved.warnings, ...paginated.warnings];

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const ended = new Promise<void>((resolve) => doc.on("end", () => resolve()));

    const drawCtx = { doc, fonts, warnings, defaultFamily, measurer };
    for (const page of paginated.pages) {
      doc.addPage({ size: [paginated.pageSize.width, paginated.pageSize.height], margin: 0 });
      doc.fillColor("#000000");
      for (const node of [...page.background, ...page.header, ...page.content, ...page.footer]) {
        await drawNode(drawCtx, node);
      }
      const wm = input.resolved.watermark;
      if (wm && (wm.pages !== "first" || page.number === 1)) drawWatermark(doc, fonts, wm, paginated.pageSize.width, paginated.pageSize.height, defaultFamily);
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
      if (hint?.lineHeight && hint.lineHeight > 0) return fontSize * hint.lineHeight;
      return doc.font(fonts.resolve(hint?.family ?? defaultFamily, Boolean(hint?.bold), Boolean(hint?.italic))).fontSize(fontSize).currentLineHeight(true);
    },
  };
}

/** Diagonal watermark centred on the page, drawn last so it sits above content with low opacity. */
function drawWatermark(doc: PDFKit.PDFDocument, fonts: PdfFontRegistry, wm: { text: string; color?: string; opacity?: number; fontSize?: number; angle?: number }, w: number, h: number, family?: string): void {
  const size = wm.fontSize ?? Math.min(w, h) / 6;
  doc.save();
  doc.translate(w / 2, h / 2).rotate(-(wm.angle ?? 45));
  doc.fillColor(wm.color ?? "#9ca3af").fillOpacity(wm.opacity ?? 0.18).fontSize(size);
  doc.font(fonts.runs(wm.text, family, true, false)[0]?.font ?? fonts.resolve(family, true, false));
  const tw = doc.widthOfString(wm.text);
  doc.text(wm.text, -tw / 2, -size / 2, { lineBreak: false });
  doc.restore();
}
