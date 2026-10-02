import { tableHeaderRows, type ResolvedChartComponent, type ResolvedTableComponent } from "@reporting/core";
import type { PositionedNode } from "@reporting/layout";
import { defaultTextMeasurer, measureFooterHeight, measureHeaderRowHeights, measureRowHeight, resolveColumnWidths } from "@reporting/layout";
import { escapeHtml } from "./escape.js";
import { barcodeDataUrl, qrCodeDataUrl } from "./codes.js";
import { chartTitle, renderChartSvg } from "./chart.js";
import { cssBox, objectFitFor, ptToPx, styleToCss } from "./style.js";

export async function renderNode(node: PositionedNode): Promise<string> {
  const component = node.component as any;
  const boxStyle = cssBox(node.box);
  const style = styleToCss(component.style);

  switch (component.type) {
    case "text":
    case "richText":
    case "field":
      return `<div style="${boxStyle}${style}">${escapeHtml(component.text ?? "")}</div>`;

    case "image":
      return component.src
        ? `<img src="${escapeHtml(component.src)}" alt="${escapeHtml(component.alt ?? "")}" style="${boxStyle}object-fit:${objectFitFor(component.fit)};" />`
        : `<div style="${boxStyle}"></div>`;

    case "line": {
      const borderStyle = component.orientation === "vertical" ? "border-left:1px solid #000;" : "border-top:1px solid #000;";
      return `<div style="${boxStyle}${borderStyle}"></div>`;
    }

    case "rectangle":
      return `<div style="${boxStyle}${style || "border:1px solid #000;"}"></div>`;

    case "spacer":
      return `<div style="${boxStyle}"></div>`;

    case "pageBreak":
      return "";

    case "qrcode": {
      const dataUrl = component.value ? await qrCodeDataUrl(component.value) : "";
      return dataUrl ? `<img src="${dataUrl}" style="${boxStyle}" />` : `<div style="${boxStyle}"></div>`;
    }

    case "barcode": {
      const dataUrl = component.value ? await barcodeDataUrl(component.value, component.symbology) : "";
      return dataUrl ? `<img src="${dataUrl}" style="${boxStyle}object-fit:fill;" />` : `<div style="${boxStyle}"></div>`;
    }

    case "chart": {
      const chart = component as ResolvedChartComponent;
      const w = Math.round(ptToPx(node.box.width));
      const h = Math.round(ptToPx(node.box.height));
      return `<div style="${boxStyle}">${chartTitle(chart)}${renderChartSvg(chart, w, h)}</div>`;
    }

    case "table":
      return renderTable(component as ResolvedTableComponent, node, boxStyle);

    default: {
      const own = component.style ? `<div style="${boxStyle}${style}"></div>` : "";
      const children = await Promise.all((node.children ?? []).map(renderNode));
      return own + children.join("");
    }
  }
}

function renderTable(table: ResolvedTableComponent, node: PositionedNode, boxStyle: string): string {
  const widths = resolveColumnWidths(table, node.box.width);
  const colgroup = widths.map((w) => `<col style="width:${ptToPx(w.width).toFixed(2)}px" />`).join("");

  const start = node.rowRange?.start ?? 0;
  const end = node.rowRange?.end ?? table.rows.length;

  const headerHeights = measureHeaderRowHeights(table, widths, defaultTextMeasurer);
  const headerRow = table.showHeader
    ? `<thead>${tableHeaderRows(table).map((cells, row) => `<tr style="height:${ptToPx(headerHeights[row]!).toFixed(2)}px">${cells.map((cell) => `<th${cell.colSpan && cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : ""}${cell.rowSpan && cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : ""} style="text-align:${cell.align ?? "left"};${table.headerRows ? "border:1px solid #000;" : "border-bottom:1px solid #000;"}padding:2px 4px;">${escapeHtml(cell.text)}</th>`).join("")}</tr>`).join("")}</thead>`
    : "";

  const bodyRows = table.rows
    .slice(start, end)
    .map(
      (row, i) =>
        `<tr style="height:${ptToPx(measureRowHeight(table, start + i, widths, defaultTextMeasurer)).toFixed(2)}px;${table.alternateRowStyle && (start + i) % 2 === 1 ? "background:#f5f5f5;" : ""}${styleToCss(row.style)}">${table.columns
          .map((c) => `<td style="text-align:${c.align ?? "left"};padding:2px 4px;">${escapeHtml(row.formatted[c.id] ?? "")}</td>`)
          .join("")}</tr>`
    )
    .join("");

  const footerRow = table.showFooter
    ? `<tfoot><tr style="height:${ptToPx(measureFooterHeight(table, defaultTextMeasurer)).toFixed(2)}px">${table.columns.map((c) => `<td style="border-top:1px solid #000;font-weight:bold;padding:2px 4px;">${escapeHtml(c.footer?.value ?? "")}</td>`).join("")}</tr></tfoot>`
    : "";

  return `<table style="${boxStyle}border-collapse:collapse;width:${ptToPx(node.box.width).toFixed(2)}px;">${colgroup}${headerRow}<tbody>${bodyRows}</tbody>${footerRow}</table>`;
}
