import type { ResolvedChartComponent, ResolvedTableComponent } from "@reporting/core";
import type { PositionedNode } from "@reporting/layout";
import { resolveColumnWidths } from "@reporting/layout";
import { renderChartSvg } from "@reporting/renderer-html";
// @ts-expect-error -- svg-to-pdfkit ships no types
import SVGtoPDF from "svg-to-pdfkit";
import { PdfFontRegistry } from "./fonts.js";
import { barcodeBuffer, qrCodeBuffer } from "./codes.js";
import { resolveImageSource } from "./images.js";

export interface DrawContext {
  doc: PDFKit.PDFDocument;
  fonts: PdfFontRegistry;
  warnings: { code: string; path: string; message: string }[];
}

function spacing(value: unknown): { top: number; right: number; bottom: number; left: number } {
  if (typeof value === "number") return { top: value, right: value, bottom: value, left: value };
  const s = (value ?? {}) as any;
  return { top: s.top ?? 0, right: s.right ?? 0, bottom: s.bottom ?? 0, left: s.left ?? 0 };
}

function drawBoxDecoration(ctx: DrawContext, box: PositionedNode["box"], style: any): void {
  if (!style) return;
  const { doc } = ctx;
  if (style.background) {
    doc.rect(box.x, box.y, box.width, box.height).fill(style.background);
  }
  if (style.border) {
    const b = style.border;
    const width = b.width ?? 1;
    const color = b.color ?? "#000000";
    doc.lineWidth(width).strokeColor(color).rect(box.x, box.y, box.width, box.height).stroke();
  }
}

export async function drawNode(ctx: DrawContext, node: PositionedNode): Promise<void> {
  const component = node.component as any;
  const { doc } = ctx;
  const style = component.style ?? {};

  switch (component.type) {
    case "text":
    case "richText":
    case "field": {
      drawBoxDecoration(ctx, node.box, style);
      const pad = spacing(style.padding);
      const fontName = ctx.fonts.resolve(style.fontFamily, style.fontWeight === "bold" || typeof style.fontWeight === "number" && style.fontWeight >= 700, Boolean(style.italic));
      doc
        .font(fontName)
        .fontSize(style.fontSize ?? 10)
        .fillColor(style.color ?? "#000000")
        .text(component.text ?? "", node.box.x + pad.left, node.box.y + pad.top, {
          width: node.box.width - pad.left - pad.right,
          height: node.box.height - pad.top - pad.bottom,
          align: style.align ?? "left",
          underline: Boolean(style.underline),
          strike: Boolean(style.strikethrough),
        });
      break;
    }

    case "image": {
      if (!component.src) break;
      const resolved = resolveImageSource(component.src);
      if (resolved.warning) {
        ctx.warnings.push({ code: "IMAGE_NOT_EMBEDDED", path: component.id ?? "image", message: resolved.warning });
        break;
      }
      const source = resolved.buffer ?? resolved.path!;
      doc.image(source, node.box.x, node.box.y, { fit: [node.box.width, node.box.height] });
      break;
    }

    case "line": {
      const color = style.color ?? "#000000";
      doc.lineWidth(1).strokeColor(color);
      if (component.orientation === "vertical") {
        doc.moveTo(node.box.x, node.box.y).lineTo(node.box.x, node.box.y + node.box.height).stroke();
      } else {
        doc.moveTo(node.box.x, node.box.y).lineTo(node.box.x + node.box.width, node.box.y).stroke();
      }
      break;
    }

    case "rectangle":
      drawBoxDecoration(ctx, node.box, Object.keys(style).length ? style : { border: { width: 1, color: "#000000" } });
      break;

    case "spacer":
    case "pageBreak":
      break;

    case "qrcode": {
      if (!component.value) break;
      const buffer = await qrCodeBuffer(component.value);
      doc.image(buffer, node.box.x, node.box.y, { fit: [node.box.width, node.box.height] });
      break;
    }

    case "barcode": {
      if (!component.value) break;
      const buffer = await barcodeBuffer(component.value, component.symbology);
      doc.image(buffer, node.box.x, node.box.y, { fit: [node.box.width, node.box.height] });
      break;
    }

    case "chart": {
      const chart = component as ResolvedChartComponent;
      const svg = renderChartSvg(chart, node.box.width, node.box.height);
      SVGtoPDF(doc, svg, node.box.x, node.box.y, { width: node.box.width, height: node.box.height });
      break;
    }

    case "table":
      drawTable(ctx, component as ResolvedTableComponent, node);
      break;

    default: {
      drawBoxDecoration(ctx, node.box, style);
      for (const child of node.children ?? []) {
        await drawNode(ctx, child);
      }
    }
  }
}

function drawTable(ctx: DrawContext, table: ResolvedTableComponent, node: PositionedNode): void {
  const { doc } = ctx;
  const widths = resolveColumnWidths(table, node.box.width);
  const rowHeight = 16;
  let y = node.box.y;

  doc.lineWidth(0.5).strokeColor("#000000");

  if (table.showHeader) {
    let x = node.box.x;
    doc.font(ctx.fonts.resolve(undefined, true, false)).fontSize(10).fillColor("#000000");
    table.columns.forEach((col, i) => {
      doc.text(col.header, x + 2, y + 2, { width: widths[i]!.width - 4, align: (col.align as any) ?? "left" });
      x += widths[i]!.width;
    });
    y += rowHeight;
    doc.moveTo(node.box.x, y).lineTo(node.box.x + node.box.width, y).stroke();
  }

  const start = node.rowRange?.start ?? 0;
  const end = node.rowRange?.end ?? table.rows.length;
  doc.font(ctx.fonts.resolve(undefined, false, false));

  for (let i = start; i < end; i++) {
    const row = table.rows[i]!;
    let x = node.box.x;
    if (table.alternateRowStyle && (i - start) % 2 === 1) {
      doc.rect(node.box.x, y, node.box.width, rowHeight).fill("#f5f5f5").fillColor("#000000");
    }
    table.columns.forEach((col, ci) => {
      doc.fillColor("#000000").text(row.formatted[col.id] ?? "", x + 2, y + 2, { width: widths[ci]!.width - 4, align: (col.align as any) ?? "left" });
      x += widths[ci]!.width;
    });
    y += rowHeight;
  }

  if (table.showFooter) {
    doc.moveTo(node.box.x, y).lineTo(node.box.x + node.box.width, y).stroke();
    let x = node.box.x;
    doc.font(ctx.fonts.resolve(undefined, true, false));
    table.columns.forEach((col, i) => {
      doc.text(col.footer?.value ?? "", x + 2, y + 2, { width: widths[i]!.width - 4, align: (col.align as any) ?? "left" });
      x += widths[i]!.width;
    });
  }
}
