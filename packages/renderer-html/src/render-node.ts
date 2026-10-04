import { tableCellSpanGrid, tableHeaderRows, tableRowStyle, tableStylesOrDefault, type ResolvedChartComponent, type ResolvedTableComponent } from "@reporting/core";
import type { PositionedNode } from "@reporting/layout";
import { defaultTextMeasurer, edgesOf, measureFooterHeight, measureHeaderRowHeights, measureTableRowHeights, resolveColumnWidths, stripeOf, textVerticalOffset } from "@reporting/layout";
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
    case "field": {
      const shift = textVerticalOffset(node);
      const alignTop = shift > 0 ? `;padding-top:${ptToPx(edgesOf(component.style?.padding).top + shift).toFixed(2)}px` : "";
      return `<div style="${boxStyle}white-space:pre-wrap;line-height:${ptToPx(node.textMetrics?.lineHeight ?? 13).toFixed(2)}px;${style}${alignTop}">${escapeHtml(node.renderText ?? node.textFragment?.text ?? component.text ?? "")}</div>`;
    }

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
  const styles = tableStylesOrDefault(table);
  const { lines } = styles.grid;
  const rule = `${Math.max(0.5, ptToPx(styles.grid.width)).toFixed(2)}px solid ${styles.grid.color}`;

  const start = node.rowRange?.start ?? 0;
  const end = node.rowRange?.end ?? table.rows.length;
  const rowHeights = measureTableRowHeights(table, widths, defaultTextMeasurer);
  const spanGrid = tableCellSpanGrid(table.cellSpans ?? []);

  const headerHeights = measureHeaderRowHeights(table, widths, defaultTextMeasurer);
  const headerBorder = lines === "all" || (table.headerRows && lines !== "none") ? `border:${rule};` : lines === "none" ? "border:none;" : `border-bottom:${rule};`;
  const headerRow = table.showHeader
    ? `<thead>${tableHeaderRows(table).map((cells, row) => `<tr style="height:${ptToPx(headerHeights[row]!).toFixed(2)}px">${cells.map((cell) => `<th${cell.colSpan && cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : ""}${cell.rowSpan && cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : ""} style="text-align:${cell.align ?? "left"};${headerBorder}padding:2px 4px;font-weight:400;${styleToCss(styles.header as Record<string, unknown>)}">${escapeHtml(cell.text)}</th>`).join("")}</tr>`).join("")}</thead>`
    : "";

  const bodyRows = table.rows
    .slice(start, end)
    .map((row, i) => {
      const index = start + i;
      const rowStyle = tableRowStyle(styles, stripeOf(row, index), row.style as Record<string, unknown> | undefined);
      const rowRule = lines === "horizontal" && index < end - 1 ? `border-bottom:${rule};` : "";
      return `<tr style="height:${ptToPx(rowHeights[index]!).toFixed(2)}px;${styleToCss(rowStyle)}">${table.columns
        .map((c, column) => {
          const slot = spanGrid.get(index)?.get(column);
          if (slot && !slot.anchor) return "";
          const cellRule = lines === "all" || (slot && lines !== "none") ? `border:${rule};` : rowRule;
          return `<td${slot && (slot.span.colSpan ?? 1) > 1 ? ` colspan="${slot.span.colSpan}"` : ""}${slot && (slot.span.rowSpan ?? 1) > 1 ? ` rowspan="${slot.span.rowSpan}"` : ""} style="text-align:${c.align ?? "left"};padding:2px 4px;white-space:pre-wrap;${cellRule}${row.cellStyles?.[c.id] ? `${styleToCss(row.cellStyles[c.id])};` : ""}">${escapeHtml(row.formatted[c.id] ?? "")}</td>`;
        })
        .join("")}</tr>`;
    })
    .join("");

  const footerBorder = lines === "all" ? `border:${rule};` : lines === "none" ? "" : `border-top:${rule};`;
  const footerRow = table.showFooter
    ? `<tfoot><tr style="height:${ptToPx(measureFooterHeight(table, defaultTextMeasurer)).toFixed(2)}px">${table.columns.map((c) => `<td style="${footerBorder}padding:2px 4px;${styleToCss(styles.footer as Record<string, unknown>)}">${escapeHtml(c.footer?.value ?? "")}</td>`).join("")}</tr></tfoot>`
    : "";

  return `<table style="${boxStyle}border-collapse:collapse;width:${ptToPx(node.box.width).toFixed(2)}px;${lines === "all" ? `border:${rule};` : ""}">${colgroup}${headerRow}<tbody>${bodyRows}</tbody>${footerRow}</table>`;
}
