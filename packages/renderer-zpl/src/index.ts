import type { RenderInput, RenderResult, RendererCapabilities, ReportRenderer } from "@reporting/core";
import { paginate, resolveColumnWidths, type PositionedNode } from "@reporting/layout";

export const zplRendererCapabilities: RendererCapabilities = {
  id: "zpl",
  mimeType: "text/plain",
  extension: "zpl",
  supports: ["text", "richText", "field", "line", "rectangle", "spacer", "barcode", "qrcode", "table", "container", "row", "column", "grid", "repeater", "group", "keepTogether", "pageBreak"],
};

const DEFAULT_DPI = 203;

/** Millimetre/point geometry from the layout engine -> printer dots at a given DPI. Deterministic: 1pt = dpi/72 dots. */
export function ptToDots(pt: number, dpi: number): number {
  return Math.max(0, Math.round((pt / 72) * dpi));
}

const SYMBOLOGY: Record<string, string> = { code128: "BC", code39: "B3", ean13: "BE", upc: "BU" };

function fieldData(text: string): string {
  // ^ and ~ are ZPL control characters; _5E/_7E escapes need ^FH. Replace conservatively.
  return text.replace(/[\^~]/g, " ").replace(/\r?\n/g, " ");
}

function flat(nodes: PositionedNode[]): PositionedNode[] {
  return nodes.flatMap((n) => (n.children ? [n, ...flat(n.children)] : [n]));
}

export class ZplRenderer implements ReportRenderer {
  readonly capabilities = zplRendererCapabilities;

  async render(input: RenderInput): Promise<RenderResult> {
    const dpi = input.resolved.print?.dpi ?? DEFAULT_DPI;
    const paginated = paginate(input.resolved, { resolvePageDependentSection: input.resolvePageSection });
    const warnings = [...paginated.warnings];
    const out: string[] = [];
    const W = ptToDots(paginated.pageSize.width, dpi);
    const H = ptToDots(paginated.pageSize.height, dpi);

    for (const page of paginated.pages) {
      out.push("^XA", `^PW${W}`, `^LL${H}`, "^LH0,0", "^CI28");
      for (const node of flat([...page.header, ...page.content, ...page.footer])) {
        const c = node.component as any;
        const x = ptToDots(node.box.x, dpi);
        const y = ptToDots(node.box.y, dpi);
        const w = ptToDots(node.box.width, dpi);
        const h = ptToDots(node.box.height, dpi);
        const fs = ptToDots((c.style?.fontSize as number | undefined) ?? 10, dpi);

        switch (c.type) {
          case "text":
          case "richText":
          case "field": {
            const text = String(c.text ?? "");
            if (!text) break;
            if (/[^\u0000-ɏ]/.test(text)) {
              warnings.push({ code: "ZPL_NON_LATIN_TEXT", path: c.id ?? "text", message: `"${text.slice(0, 24)}" contains non-Latin characters; Zebra's built-in fonts cannot draw them. Use a downloaded TrueType font or print this label as PDF/image.` });
            }
            const align = c.style?.align === "center" ? "C" : c.style?.align === "right" ? "R" : "L";
            const lines = Math.max(1, Math.round(h / Math.max(1, Math.round(fs * 1.2))));
            out.push(`^FO${x},${y}^A0N,${fs},${fs}^FB${w},${lines},0,${align},0^FD${fieldData(text)}^FS`);
            break;
          }
          case "barcode": {
            const value = String(c.value ?? "");
            if (!value) break;
            const modules = 11 * (value.length + 3) + 13;
            const moduleDots = Math.max(1, Math.min(10, Math.floor(w / modules)));
            const code = SYMBOLOGY[c.symbology] ?? "BC";
            out.push(`^FO${x},${y}^BY${moduleDots}^${code}N,${h},N,N,N^FD${fieldData(value)}^FS`);
            if (moduleDots * modules > w) {
              warnings.push({ code: "ZPL_BARCODE_TOO_WIDE", path: c.id ?? "barcode", message: `Barcode needs about ${moduleDots * modules} dots but only ${w} are available; it may be clipped or unreadable.` });
            }
            break;
          }
          case "qrcode": {
            const value = String(c.value ?? "");
            if (!value) break;
            const mag = Math.max(1, Math.min(10, Math.floor(Math.min(w, h) / 29)));
            out.push(`^FO${x},${y}^BQN,2,${mag}^FDQA,${fieldData(value)}^FS`);
            break;
          }
          case "line": {
            const vertical = c.orientation === "vertical";
            out.push(`^FO${x},${y}^GB${vertical ? 1 : Math.max(1, w)},${vertical ? Math.max(1, h) : 1},1^FS`);
            break;
          }
          case "rectangle":
            out.push(`^FO${x},${y}^GB${Math.max(1, w)},${Math.max(1, h)},${c.style?.border?.width ? ptToDots(c.style.border.width, dpi) || 1 : 1}^FS`);
            break;
          case "table": {
            const widths = resolveColumnWidths(c, node.box.width);
            const start = node.rowRange?.start ?? 0;
            const end = node.rowRange?.end ?? c.rows.length;
            const rowH = c.rows.length ? Math.max(fs + 4, Math.round(h / (end - start + (c.showHeader ? 1 : 0) + (c.showFooter ? 1 : 0)))) : fs + 4;
            let ry = y;
            const cell = (text: string, cx: number, cw: number, align: string) =>
              out.push(`^FO${cx},${ry}^A0N,${fs},${fs}^FB${cw},1,0,${align},0^FD${fieldData(text)}^FS`);
            const row = (texts: string[]) => {
              let cx = x;
              widths.forEach((cw, i) => {
                const wd = ptToDots(cw.width, dpi);
                const a = c.columns[i]?.align === "right" ? "R" : c.columns[i]?.align === "center" ? "C" : "L";
                cell(texts[i] ?? "", cx, wd, a);
                cx += wd;
              });
              ry += rowH;
            };
            if (c.showHeader) row(c.columns.map((col: any) => col.header));
            for (let i = start; i < end; i++) row(c.columns.map((col: any) => c.rows[i].formatted[col.id] ?? ""));
            if (c.showFooter) row(c.columns.map((col: any) => col.footer?.value ?? ""));
            break;
          }
          case "image":
          case "chart":
            warnings.push({ code: "ZPL_UNSUPPORTED_COMPONENT", path: c.id ?? c.type, message: `ZPL renderer does not support "${c.type}"; it was skipped. Use a PDF or image renderer for graphics.` });
            break;
          default:
            break;
        }
      }
      out.push("^XZ");
    }

    return { content: out.join("\n") + "\n", mimeType: this.capabilities.mimeType, extension: this.capabilities.extension, warnings };
  }
}
