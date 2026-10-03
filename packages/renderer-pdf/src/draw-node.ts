import { tableCellSpanGrid, tableHeaderRows, type ResolvedChartComponent, type ResolvedTableComponent } from "@reporting/core";
import type { PositionedNode } from "@reporting/layout";
import { measureFooterHeight, measureHeaderRowHeights, measureTableRowHeights, resolveColumnWidths, type TextMeasurer } from "@reporting/layout";
import { renderChartSvg } from "@reporting/renderer-html";
// @ts-expect-error -- svg-to-pdfkit ships no types
import SVGtoPDF from "svg-to-pdfkit";
import { PdfFontRegistry, detectScript } from "./fonts.js";
import { barcodeBuffer, qrCodeBuffer } from "./codes.js";
import { resolveImageSource } from "./images.js";

export interface DrawContext {
  doc: PDFKit.PDFDocument;
  measurer: TextMeasurer;
  defaultFamily?: string;
  fonts: PdfFontRegistry;
  warnings: { code: string; path: string; message: string }[];
  /** Open outline (bookmark) items by depth, so nested bookmarks form a tree. */
  outlineStack?: any[];
}

function spacing(value: unknown): { top: number; right: number; bottom: number; left: number } {
  if (typeof value === "number") return { top: value, right: value, bottom: value, left: value };
  const s = (value ?? {}) as any;
  return { top: s.top ?? 0, right: s.right ?? 0, bottom: s.bottom ?? 0, left: s.left ?? 0 };
}

/** Draws text as per-script runs so each run uses a font that has its glyphs (Latin, Devanagari, Telugu, ...). */
function drawRuns(ctx: DrawContext, text: string, x: number, y: number, opts: Record<string, any>, family: string | undefined, bold: boolean, italic: boolean, fontSize = 10, lineHeight?: number): void {
  const runs = ctx.fonts.runs(text, family, bold, italic);
  if (lineHeight && lineHeight > 0) {
    ctx.doc.font(runs[0]?.font ?? ctx.fonts.resolve(family, bold, italic)).fontSize(fontSize);
    opts = { ...opts, lineGap: fontSize * lineHeight - ctx.doc.currentLineHeight(true) };
  }
  if (runs.length <= 1) {
    ctx.doc.font(runs[0]?.font ?? ctx.fonts.resolve(family, bold, italic)).text(text, x, y, opts);
    return;
  }
  runs.forEach((run, i) => {
    ctx.doc.font(run.font);
    if (i === 0) ctx.doc.text(run.text, x, y, { ...opts, continued: true });
    else ctx.doc.text(run.text, { ...opts, continued: i < runs.length - 1 });
  });
}

function startsRtl(text: string): boolean {
  for (const ch of text) {
    const script = detectScript(ch);
    if (script) return script === "arabic";
  }
  return false;
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

function addBookmark(ctx: DrawContext, component: any, node: PositionedNode): void {
  const title = typeof component.bookmark === "string" ? component.bookmark : String(component.text ?? component.id ?? "").trim();
  if (!title) return;
  const outline = (ctx.doc as any).outline;
  if (!outline) return;
  const stack = (ctx.outlineStack ??= [outline]);
  const level = Math.min(component.bookmarkLevel ?? 1, stack.length);
  const parent = stack[level - 1] ?? outline;
  const item = parent.addItem(title);
  stack.length = level; // entries deeper than this one are closed
  stack.push(item);
  void node;
}

export async function drawNode(ctx: DrawContext, node: PositionedNode): Promise<void> {
  const component = node.component as any;
  const { doc } = ctx;
  const style = component.style ?? {};

  if (component.bookmark) addBookmark(ctx, component, node);

  switch (component.type) {
    case "text":
    case "richText":
    case "field": {
      drawBoxDecoration(ctx, node.box, style);
      const pad = spacing(style.padding);
      const isBold = style.fontWeight === "bold" || (typeof style.fontWeight === "number" && style.fontWeight >= 700);
      doc.fontSize(style.fontSize ?? 10).fillColor(style.color ?? "#000000");
      drawRuns(ctx, component.text ?? "", node.box.x + pad.left, node.box.y + pad.top, {
        width: node.box.width - pad.left - pad.right,
        align: style.align ?? (startsRtl(component.text ?? "") ? "right" : "left"),
        underline: Boolean(style.underline),
        strike: Boolean(style.strikethrough),
      }, style.fontFamily ?? ctx.defaultFamily, isBold, Boolean(style.italic), style.fontSize ?? 10, style.lineHeight);
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
  // Row heights come from the layout engine's own measurements so what is
  // drawn here occupies exactly the space pagination reserved for it.
  const headerRowHeights = measureHeaderRowHeights(table, widths, ctx.measurer);
  const headerHeight = headerRowHeights.reduce((sum, height) => sum + height, 0);
  const footerHeight = measureFooterHeight(table, ctx.measurer);
  const fontSize = (table.style?.fontSize as number | undefined) ?? 10;
  let y = node.box.y;

  doc.lineWidth(0.5).strokeColor("#000000");

  if (table.showHeader) {
    doc.fontSize(fontSize).fillColor("#000000");
    tableHeaderRows(table).forEach((cells, row) => cells.forEach((cell) => {
      const x = node.box.x + widths.slice(0, cell.column).reduce((sum, column) => sum + column.width, 0);
      const cellY = y + headerRowHeights.slice(0, row).reduce((sum, height) => sum + height, 0);
      const cellWidth = widths.slice(cell.column, cell.column + (cell.colSpan ?? 1)).reduce((sum, column) => sum + column.width, 0);
      const cellHeight = headerRowHeights.slice(row, row + (cell.rowSpan ?? 1)).reduce((sum, height) => sum + height, 0);
      if (table.headerRows) doc.rect(x, cellY, cellWidth, cellHeight).stroke();
      drawRuns(ctx, cell.text, x + 2, cellY + 3, { width: Math.max(1, cellWidth - 4), height: Math.max(1, cellHeight - 4), align: cell.align ?? "left" }, ctx.defaultFamily, true, false);
    }));
    y += headerHeight;
    if (!table.headerRows) doc.moveTo(node.box.x, y).lineTo(node.box.x + node.box.width, y).stroke();
  }

  const start = node.rowRange?.start ?? 0;
  const end = node.rowRange?.end ?? table.rows.length;
  const rowHeights = measureTableRowHeights(table, widths, ctx.measurer);
  const spanGrid = tableCellSpanGrid(table.cellSpans ?? []);
  const rowYs = new Map<number, number>();
  let bodyEnd = y;

  for (let i = start; i < end; i++) {
    const row = table.rows[i]!;
    const rowHeight = rowHeights[i]!;
    const rowStyle = (row.style ?? {}) as any;
    rowYs.set(i, bodyEnd);
    if (rowStyle.background) {
      doc.rect(node.box.x, bodyEnd, node.box.width, rowHeight).fill(rowStyle.background);
    } else if (table.alternateRowStyle && (i - start) % 2 === 1) {
      doc.rect(node.box.x, bodyEnd, node.box.width, rowHeight).fill("#f5f5f5");
    }
    bodyEnd += rowHeight;
  }

  for (let i = start; i < end; i++) {
    const row = table.rows[i]!;
    const rowStyle = (row.style ?? {}) as any;
    let x = node.box.x;
    const bold = rowStyle.fontWeight === "bold" || (typeof rowStyle.fontWeight === "number" && rowStyle.fontWeight >= 700);
    doc.fontSize(fontSize);
    table.columns.forEach((col, ci) => {
      const slot = spanGrid.get(i)?.get(ci);
      const cellWidth = slot ? widths.slice(ci, ci + (slot.span.colSpan ?? 1)).reduce((sum, part) => sum + part.width, 0) : widths[ci]!.width;
      const cellHeight = slot ? rowHeights.slice(i, i + (slot.span.rowSpan ?? 1)).reduce((sum, height) => sum + height, 0) : rowHeights[i]!;
      if (slot && !slot.anchor) { x += widths[ci]!.width; return; }
      if (slot) doc.lineWidth(0.5).strokeColor("#000000").rect(x, rowYs.get(i)!, cellWidth, cellHeight).stroke();
      doc.fillColor(rowStyle.color ?? "#000000");
      drawRuns(ctx, row.formatted[col.id] ?? "", x + 2, rowYs.get(i)! + 2, {
        width: Math.max(1, cellWidth - 4),
        height: Math.max(1, cellHeight - 2),
        align: (col.align as any) ?? "left",
      }, ctx.defaultFamily, bold, Boolean(rowStyle.italic));
      x += widths[ci]!.width;
    });
  }
  y = bodyEnd;

  if (table.showFooter) {
    doc.moveTo(node.box.x, y).lineTo(node.box.x + node.box.width, y).stroke();
    let x = node.box.x;
    doc.fontSize(fontSize).fillColor("#000000");
    table.columns.forEach((col, i) => {
      drawRuns(ctx, col.footer?.value ?? "", x + 2, y + 3, { width: widths[i]!.width - 4, align: (col.align as any) ?? "left", lineBreak: false }, ctx.defaultFamily, true, false);
      x += widths[i]!.width;
    });
    y += footerHeight;
  }
}
