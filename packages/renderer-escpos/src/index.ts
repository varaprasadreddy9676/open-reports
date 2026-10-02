import type { RenderInput, RenderResult, RendererCapabilities, ReportRenderer, ResolvedComponent } from "@reporting/core";
import { tableHeaderRows } from "@reporting/core";
import { paginate } from "@reporting/layout";

export const escposCapabilities: RendererCapabilities = {
  id: "escpos",
  mimeType: "application/octet-stream",
  extension: "bin",
  supports: ["text", "richText", "field", "line", "spacer", "barcode", "qrcode", "table", "container", "row", "column", "grid", "repeater", "group", "keepTogether"],
};

const ESC = 0x1b;
const GS = 0x1d;
/** Characters outside the printer code page, replaced with readable ASCII. */
const SUBSTITUTE: Record<string, string> = { "₹": "Rs.", "€": "EUR", "–": "-", "—": "-", "“": '"', "”": '"', "‘": "'", "’": "'", "•": "*", "…": "..." };

class Bytes {
  private parts: number[] = [];
  raw(...b: number[]) {
    this.parts.push(...b);
    return this;
  }
  text(s: string, warn: (c: string) => void) {
    for (const ch of s) {
      const sub = SUBSTITUTE[ch];
      if (sub) for (const c of sub) this.parts.push(c.charCodeAt(0));
      else if (ch.charCodeAt(0) <= 0xff) this.parts.push(ch.charCodeAt(0));
      else {
        this.parts.push(0x3f);
        warn(ch);
      }
    }
    return this;
  }
  line(s: string, warn: (c: string) => void) {
    return this.text(s, warn).raw(0x0a);
  }
  build(): Buffer {
    return Buffer.from(this.parts);
  }
}

function wrap(text: string, cols: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(" ")) {
      if (word.length > cols) {
        if (line) (out.push(line), (line = ""));
        for (let i = 0; i < word.length; i += cols) out.push(word.slice(i, i + cols));
        continue;
      }
      if (!line) line = word;
      else if (line.length + 1 + word.length <= cols) line += " " + word;
      else (out.push(line), (line = word));
    }
    out.push(line);
  }
  return out;
}

const pad = (s: string, n: number, align: "left" | "right" | "center") => {
  const t = s.length > n ? s.slice(0, n) : s;
  const gap = n - t.length;
  return align === "right" ? " ".repeat(gap) + t : align === "center" ? " ".repeat(gap >> 1) + t + " ".repeat(gap - (gap >> 1)) : t + " ".repeat(gap);
};

export class EscPosRenderer implements ReportRenderer {
  readonly capabilities = escposCapabilities;

  async render(input: RenderInput): Promise<RenderResult> {
    const dpi = input.resolved.print?.dpi ?? 203;
    const paginated = paginate(input.resolved, { resolvePageDependentSection: input.resolvePageSection });
    const printableIn = (paginated.pageSize.width - paginated.margin.left - paginated.margin.right) / 72;
    // Font A is 12 dots wide: 80 mm paper ≈ 48 columns, 58 mm ≈ 32.
    const cols = Math.max(16, Math.floor((printableIn * dpi) / 12));
    const warnings: RenderResult["warnings"] = [];
    const bad = new Set<string>();
    const warn = (c: string) => {
      if (!bad.has(c)) {
        bad.add(c);
        warnings.push({ code: "ESCPOS_UNSUPPORTED_CHAR", path: "text", message: `Character "${c}" is not available on the printer code page and was printed as "?".` });
      }
    };
    const out = new Bytes().raw(ESC, 0x40, ESC, 0x74, 16); // reset, code page WPC1252
    const align = (a: "left" | "center" | "right") => out.raw(ESC, 0x61, a === "center" ? 1 : a === "right" ? 2 : 0);

    const print = (text: string, style: any = {}) => {
      const big = (style.fontSize ?? 10) >= 16;
      const w = big ? Math.floor(cols / 2) : cols;
      align(style.align ?? "left");
      out.raw(ESC, 0x45, style.fontWeight === "bold" || big ? 1 : 0);
      out.raw(GS, 0x21, big ? 0x11 : 0);
      for (const l of wrap(text, w)) out.line(l, warn);
      out.raw(GS, 0x21, 0, ESC, 0x45, 0);
      align("left");
    };

    const walk = (list: ResolvedComponent[]) => {
      for (const c of list as any[]) {
        switch (c.type) {
          case "text":
          case "richText":
          case "field":
            if (c.text !== undefined && String(c.text) !== "") print(String(c.text), c.style);
            break;
          case "spacer":
            out.raw(0x0a);
            break;
          case "line":
            out.line("-".repeat(cols), warn);
            break;
          case "row": {
            // label on the left, value on the right: the shape of every receipt total line
            const texts = (c.children as any[]).filter((k) => k.type === "text" || k.type === "field").map((k) => String(k.text ?? ""));
            if (texts.length === (c.children as any[]).length && texts.length >= 2) {
              const first = texts[0]!;
              const rest = texts.slice(1).join("  ");
              const bold = (c.children as any[]).some((k) => k.style?.fontWeight === "bold");
              out.raw(ESC, 0x45, bold ? 1 : 0);
              out.line(first.slice(0, Math.max(1, cols - rest.length - 1)).padEnd(cols - rest.length) + rest, warn);
              out.raw(ESC, 0x45, 0);
            } else walk(c.children);
            break;
          }
          case "container":
          case "column":
          case "grid":
          case "repeater":
          case "keepTogether":
            walk(c.children);
            break;
          case "group":
            for (const g of c.groups) (walk(g.header), walk(g.children), walk(g.footer));
            break;
          case "table": {
            const fixed = c.columns.map((col: any) => (typeof col.width === "number" ? Math.max(3, Math.round((col.width / 160) * cols * 0.5)) : undefined));
            const used = fixed.reduce((a: number, b: number | undefined) => a + (b ?? 0) + (b !== undefined ? 1 : 0), 0);
            const flex = fixed.filter((f: number | undefined) => f === undefined).length || 1;
            const widths: number[] = fixed.map((f: number | undefined) => f ?? Math.max(4, Math.floor((cols - used - (c.columns.length - 1 - 0)) / flex)));
            const fmt = (cells: string[]) => cells.map((cell, i) => pad(cell, widths[i]!, c.columns[i].align ?? "left")).join(" ").slice(0, cols);
            if (c.showHeader) {
              out.raw(ESC, 0x45, 1);
              if (c.headerRows) {
                for (const cells of tableHeaderRows(c)) {
                  const line = Array<string>(cols).fill(" ");
                  for (const cell of cells) {
                    const start = widths.slice(0, cell.column).reduce((sum, width) => sum + width + 1, 0);
                    const spanWidth = widths.slice(cell.column, cell.column + (cell.colSpan ?? 1)).reduce((sum, width) => sum + width, 0) + (cell.colSpan ?? 1) - 1;
                    const value = pad(cell.text, spanWidth, cell.align ?? "left");
                    for (let i = 0; i < value.length && start + i < cols; i++) line[start + i] = value[i]!;
                  }
                  out.line(line.join("").trimEnd(), warn);
                }
              } else out.line(fmt(c.columns.map((k: any) => k.header)), warn);
              out.raw(ESC, 0x45, 0).line("-".repeat(cols), warn);
            }
            for (const row of c.rows) out.line(fmt(c.columns.map((k: any) => String(row.formatted[k.id] ?? ""))), warn);
            if (c.showFooter) (out.line("-".repeat(cols), warn), out.line(fmt(c.columns.map((k: any) => String(k.footer?.value ?? ""))), warn));
            break;
          }
          case "qrcode": {
            if (!c.value) break;
            const data = Buffer.from(String(c.value), "utf8");
            const len = data.length + 3;
            align("center");
            out.raw(GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0); // model 2
            out.raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, 6); // module size
            out.raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x31); // error correction M
            out.raw(GS, 0x28, 0x6b, len & 0xff, len >> 8, 0x31, 0x50, 0x30, ...data);
            out.raw(GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30, 0x0a);
            align("left");
            break;
          }
          case "barcode": {
            if (!c.value) break;
            const body = Buffer.from("{B" + String(c.value), "latin1"); // Code 128, subset B
            align("center");
            out.raw(GS, 0x68, Math.min(255, Math.max(30, Math.round(((c.height as number) ?? 40) * 1.2))), GS, 0x77, 2, GS, 0x48, 2);
            out.raw(GS, 0x6b, 0x49, body.length, ...body, 0x0a);
            align("left");
            break;
          }
          default:
            warnings.push({ code: "ESCPOS_UNSUPPORTED_COMPONENT", path: c.id ?? c.type, message: `ESC/POS cannot print "${c.type}"; it was skipped.` });
        }
      }
    };

    for (const section of input.resolved.sections) walk(section.children);
    out.raw(0x0a, 0x0a, 0x0a, GS, 0x56, 0x42, 0x00); // feed and partial cut
    return { content: out.build(), mimeType: this.capabilities.mimeType, extension: this.capabilities.extension, warnings };
  }
}
