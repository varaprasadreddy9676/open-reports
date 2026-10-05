import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  PageBreak,
  PageNumber,
  PageOrientation,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalMergeType,
  WidthType,
  type ParagraphChild,
} from "docx";
import QRCode from "qrcode";
import bwipjs from "bwip-js";
import { isBold, tableHeaderRows, type RenderInput, type RenderResult, type RendererCapabilities, type ReportRenderer, type ResolvedComponent, type ResolvedSection, type ResolvedTableComponent, type ResolvedWarning } from "@reporting/core";
import { resolveColumnWidths, resolvePageGeometry } from "@reporting/layout";

export const docxRendererCapabilities: RendererCapabilities = {
  id: "docx",
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  extension: "docx",
  supports: ["*"],
};

/** Word measures page geometry in twentieths of a point. */
const TWIPS = 20;
/** Sentinel page numbers, swapped for Word's live PAGE / NUMPAGES fields in headers and footers. */
const PAGE_SENTINEL = 987654321;
const TOTAL_SENTINEL = 123456789;
const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED };
const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER };

type Block = Paragraph | Table;
type Style = Record<string, unknown>;

interface Context {
  warnings: ResolvedWarning[];
  /** Width available to the current block, in points (tables and images are sized to it). */
  width: number;
  /** Inside a header or footer: page-number sentinels become fields. */
  pageFields: boolean;
}

const hex = (color: unknown): string | undefined => (typeof color === "string" && /^#?[0-9a-f]{6}$/i.test(color) ? color.replace("#", "").toUpperCase() : typeof color === "string" && /^#[0-9a-f]{3}$/i.test(color) ? color.slice(1).split("").map((c) => c + c).join("").toUpperCase() : undefined);
const num = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

function runOptions(style: Style | undefined) {
  const s = style ?? {};
  return {
    bold: isBold(s) || undefined,
    italics: s.italic === true || undefined,
    underline: s.underline ? {} : undefined,
    strike: s.strikethrough === true || undefined,
    color: hex(s.color),
    size: typeof s.fontSize === "number" ? Math.round(s.fontSize * 2) : undefined,
    font: typeof s.fontFamily === "string" ? s.fontFamily : undefined,
  };
}

/** Text runs; in headers and footers the page-number sentinels become live Word fields. */
function runs(text: string, style: Style | undefined, ctx: Context): TextRun[] {
  const options = runOptions(style);
  if (!ctx.pageFields) return text.split("\n").map((line, index) => new TextRun({ ...options, text: line, break: index > 0 ? 1 : undefined }));
  const pattern = new RegExp(`(${[PAGE_SENTINEL, TOTAL_SENTINEL].map((n) => `${n}|${n.toLocaleString("en-US")}`).join("|")})`);
  return text.split(pattern).filter(Boolean).map((part) => {
    const plain = part.replace(/,/g, "");
    if (plain === String(PAGE_SENTINEL)) return new TextRun({ ...options, children: [PageNumber.CURRENT] });
    if (plain === String(TOTAL_SENTINEL)) return new TextRun({ ...options, children: [PageNumber.TOTAL_PAGES] });
    return new TextRun({ ...options, text: part });
  });
}

function withLink(children: ParagraphChild[], link: { href?: string; report?: unknown } | undefined): ParagraphChild[] {
  // Drill-through links only work in the report viewer; web links stay clickable in Word.
  if (!link?.href || link.report || !/^(https?:|mailto:|tel:)/i.test(link.href)) return children;
  return [new ExternalHyperlink({ link: link.href, children: children as TextRun[] })];
}

async function codeImage(component: ResolvedComponent): Promise<Buffer | undefined> {
  const value = String((component as { value?: unknown }).value ?? "");
  if (!value) return undefined;
  if (component.type === "qrcode") return QRCode.toBuffer(value, { margin: 1, scale: 6 });
  const symbology = (component as { symbology?: string }).symbology ?? "code128";
  const bcid = ({ code128: "code128", code39: "code39", ean13: "ean13", upc: "upca" } as Record<string, string>)[symbology] ?? "code128";
  try {
    return await bwipjs.toBuffer({ bcid, text: value, scale: 3, height: 10, includetext: true });
  } catch {
    return undefined;
  }
}

function dataUrlImage(src: string | undefined): { data: Buffer; type: "png" | "jpg" | "gif" | "bmp" } | undefined {
  const match = src?.match(/^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i);
  if (!match) return undefined;
  const kind = match[1]!.toLowerCase();
  return { data: Buffer.from(match[2]!, "base64"), type: kind === "jpeg" || kind === "jpg" ? "jpg" : (kind as "png" | "gif" | "bmp") };
}

/** Size in points of an element whose width/height may be numbers (points) or unset. */
function size(component: ResolvedComponent, ctx: Context, fallback: { width: number; height: number }): { width: number; height: number } {
  const width = Math.min(num(component.width, fallback.width), ctx.width);
  const height = num(component.height, fallback.height) * (width / num(component.width, width));
  return { width, height };
}

function imageParagraph(data: Buffer, type: "png" | "jpg" | "gif" | "bmp", box: { width: number; height: number }, style: Style | undefined): Paragraph {
  // ImageRun sizes are in pixels at 96 dpi.
  const px = (pt: number) => Math.max(1, Math.round((pt * 96) / 72));
  return new Paragraph({ alignment: ALIGN[String(style?.align)] , children: [new ImageRun({ type, data, transformation: { width: px(box.width), height: px(box.height) } })] });
}

function tableBlock(table: ResolvedTableComponent, ctx: Context): Table {
  const widths = resolveColumnWidths(table, ctx.width).map((column) => Math.max(1, Math.round(column.width * TWIPS)));
  const header = table.showHeader ? tableHeaderRows(table) : [];
  const headerStyle = { ...(table.styles?.header ?? {}), bold: true } as Style;
  const cellParagraph = (text: string, align: string | undefined, style: Style | undefined, link?: { href?: string; report?: unknown }) =>
    new Paragraph({ alignment: ALIGN[align ?? "left"], children: withLink(runs(text, style, ctx), link) });

  // Header grid: spans become column spans and vertical merges.
  const covered = new Set<string>();
  const headerRows = header.map((cells, row) => {
    const byColumn = new Map(cells.map((cell) => [cell.column, cell]));
    const children: TableCell[] = [];
    for (let column = 0; column < table.columns.length; column++) {
      const cell = byColumn.get(column);
      if (cell) {
        const colSpan = cell.colSpan ?? 1;
        const rowSpan = cell.rowSpan ?? 1;
        for (let r = row + 1; r < row + rowSpan; r++) for (let c = column; c < column + colSpan; c++) covered.add(`${r}:${c}`);
        children.push(new TableCell({ columnSpan: colSpan > 1 ? colSpan : undefined, verticalMerge: rowSpan > 1 ? VerticalMergeType.RESTART : undefined, children: [cellParagraph(cell.text ?? "", cell.align, headerStyle)] }));
        column += colSpan - 1;
      } else if (covered.has(`${row}:${column}`)) {
        children.push(new TableCell({ verticalMerge: VerticalMergeType.CONTINUE, children: [new Paragraph("")] }));
      }
    }
    return new TableRow({ tableHeader: true, children });
  });

  const bodyRows = table.rows.map((row) => new TableRow({
    cantSplit: !table.allowRowSplit,
    children: table.columns.map((column) => {
      const cellStyle = { ...(row.style ?? {}), ...(row.cellStyles?.[column.id] ?? {}) };
      return new TableCell({ shading: hex(cellStyle.background) ? { fill: hex(cellStyle.background)! } : undefined, children: [cellParagraph(row.formatted[column.id] ?? "", column.align, cellStyle, row.links?.[column.id])] });
    }),
  }));
  const footer = table.showFooter
    ? [new TableRow({ children: table.columns.map((column) => new TableCell({ children: [cellParagraph(column.footer?.value ?? "", column.align, { ...(table.styles?.footer ?? {}), bold: true })] })) })]
    : [];
  if (!header.length && !bodyRows.length && !footer.length) bodyRows.push(new TableRow({ children: [new TableCell({ columnSpan: Math.max(1, table.columns.length), children: [new Paragraph("")] })] }));
  return new Table({ width: { size: widths.reduce((sum, w) => sum + w, 0), type: WidthType.DXA }, columnWidths: widths, rows: [...headerRows, ...bodyRows, ...footer] });
}

async function blocks(components: readonly ResolvedComponent[], ctx: Context): Promise<Block[]> {
  const out: Block[] = [];
  for (const component of components) out.push(...(await block(component, ctx)));
  return out;
}

async function block(component: ResolvedComponent, ctx: Context): Promise<Block[]> {
  const style = component.style as Style | undefined;
  const any = component as ResolvedComponent & Record<string, any>;
  const before = component.pageBreakBefore ? [new Paragraph({ children: [new PageBreak()] })] : [];
  const after = component.pageBreakAfter ? [new Paragraph({ children: [new PageBreak()] })] : [];
  const wrap = (content: Block[]) => [...before, ...content, ...after];

  switch (component.type) {
    case "text":
    case "richText":
    case "field": {
      const text = String(any.text ?? "");
      const level = any.bookmark ? Math.max(1, Math.min(4, num(any.bookmarkLevel, 1))) : 0;
      return wrap([new Paragraph({
        heading: level ? HEADINGS[level - 1] : undefined,
        alignment: ALIGN[String(style?.align)],
        children: withLink(runs(text, style, ctx), any.link),
      })]);
    }
    case "image": {
      const image = dataUrlImage(any.src);
      if (!image) {
        if (any.src) ctx.warnings.push({ code: "DOCX_IMAGE_SKIPPED", path: "", componentId: component.id, message: "An image that is not embedded in the report (a path or URL) was left out of the Word document." });
        return wrap([]);
      }
      return wrap([imageParagraph(image.data, image.type, size(component, ctx, { width: 120, height: 60 }), style)]);
    }
    case "qrcode":
    case "barcode": {
      const data = await codeImage(component);
      return wrap(data ? [imageParagraph(data, "png", size(component, ctx, component.type === "qrcode" ? { width: 70, height: 70 } : { width: 140, height: 40 }), style)] : []);
    }
    case "line":
      return wrap([new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: hex(style?.color) ?? "000000", space: 1 } }, children: [] })]);
    case "spacer":
      return wrap([new Paragraph({ spacing: { after: Math.round(num(component.height, 12) * TWIPS) }, children: [] })]);
    case "rectangle":
      return wrap([]);
    case "pageBreak":
      return [new Paragraph({ children: [new PageBreak()] })];
    case "chart":
      ctx.warnings.push({ code: "DOCX_CHART_AS_TEXT", path: "", componentId: component.id, message: "Charts are written to Word as their title only; export PDF to keep the chart." });
      return wrap([new Paragraph({ children: runs(`[Chart${any.title ? `: ${any.title}` : ""}]`, { italic: true, color: "#5d6c82" }, ctx) })]);
    case "table":
      return wrap([tableBlock(component as ResolvedTableComponent, ctx)]);
    case "group": {
      const out: Block[] = [];
      for (const group of any.groups ?? []) out.push(...(await blocks(group.header ?? [], ctx)), ...(await blocks(group.children ?? [], ctx)), ...(await blocks(group.footer ?? [], ctx)));
      return wrap(out);
    }
    case "row": {
      // Side-by-side content becomes a borderless table with one cell per child.
      const children = (any.children ?? []) as ResolvedComponent[];
      if (children.length < 2) return wrap(await blocks(children, ctx));
      const cellWidth = ctx.width / children.length;
      const cells = await Promise.all(children.map(async (child) => {
        const content = await blocks([child], { ...ctx, width: cellWidth });
        return new TableCell({ borders: NO_BORDERS, width: { size: Math.round(cellWidth * TWIPS), type: WidthType.DXA }, children: content.length ? content : [new Paragraph("")] });
      }));
      return wrap([new Table({ borders: NO_BORDERS, width: { size: Math.round(ctx.width * TWIPS), type: WidthType.DXA }, columnWidths: children.map(() => Math.round(cellWidth * TWIPS)), rows: [new TableRow({ children: cells })] })]);
    }
    default: {
      if (component.type === "labelSheet" as string) ctx.warnings.push({ code: "DOCX_LABEL_SHEET", path: "", componentId: component.id, message: "Label sheets are written to Word one label after another; use PDF to print on label stock." });
      return wrap(await blocks((any.children ?? []) as ResolvedComponent[], ctx));
    }
  }
}

/** Default (every-page) header or footer; page numbers become live fields. */
async function pagePart(sections: ResolvedSection[], type: string, input: RenderInput, ctx: Context): Promise<Block[] | undefined> {
  const section = sections.find((candidate) => candidate.type === type && (!candidate.appliesTo || candidate.appliesTo === "all"));
  if (!section) return undefined;
  const children = input.resolvePageSection(section, { number: PAGE_SENTINEL, total: TOTAL_SENTINEL });
  const content = await blocks(children, { ...ctx, pageFields: true });
  return content.length ? content : undefined;
}

/**
 * An editable Word document: report sections in reading order as paragraphs, headings and real tables.
 * Word does its own pagination, so fixed positions become flow; headers and footers keep live page numbers.
 */
export class DocxRenderer implements ReportRenderer {
  readonly capabilities = docxRendererCapabilities;

  async render(input: RenderInput): Promise<RenderResult> {
    const resolved = input.resolved;
    const geometry = resolvePageGeometry(resolved.page);
    const warnings: ResolvedWarning[] = [...resolved.warnings];
    const ctx: Context = { warnings, width: geometry.contentWidth, pageFields: false };
    const sections = resolved.sections;
    if (sections.some((section) => (section.type === "pageHeader" || section.type === "pageFooter") && section.appliesTo && section.appliesTo !== "all")) {
      warnings.push({ code: "DOCX_PAGE_MASTERS", path: "", message: "First, last, odd and even page headers and footers are not written to Word; the every-page header and footer are." });
    }
    const body: Block[] = [];
    for (const section of sections) {
      if (section.type === "pageHeader" || section.type === "pageFooter" || section.type === "background") continue;
      body.push(...(await blocks(section.children, ctx)));
    }
    const header = await pagePart(sections, "pageHeader", input, ctx);
    const footer = await pagePart(sections, "pageFooter", input, ctx);
    const landscape = geometry.width > geometry.height;
    const document = new Document({
      title: resolved.name,
      creator: "Open Reports",
      sections: [{
        properties: {
          page: {
            // docx swaps width and height itself for landscape pages.
            size: { width: Math.round(Math.min(geometry.width, geometry.height) * TWIPS), height: Math.round(Math.max(geometry.width, geometry.height) * TWIPS), orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
            margin: { top: Math.round(geometry.margin.top * TWIPS), right: Math.round(geometry.margin.right * TWIPS), bottom: Math.round(geometry.margin.bottom * TWIPS), left: Math.round(geometry.margin.left * TWIPS) },
          },
        },
        headers: header ? { default: new Header({ children: header }) } : undefined,
        footers: footer ? { default: new Footer({ children: footer }) } : undefined,
        children: body.length ? body : [new Paragraph("")],
      }],
    });
    const content = await Packer.toBuffer(document);
    return { content, mimeType: this.capabilities.mimeType, extension: this.capabilities.extension, warnings };
  }
}
