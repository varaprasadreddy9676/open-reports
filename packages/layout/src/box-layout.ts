import type {
  ResolvedComponent,
  ResolvedTableComponent,
  ResolvedContainerComponent,
  ResolvedGroupComponent,
} from "@reporting/core";
import type { TextMeasurer } from "./measure.js";
import { wrapLineCount, type TextStyleHint } from "./measure.js";
import { resolveDimension } from "./units.js";
import type { Box, PositionedNode } from "./types.js";

const DEFAULT_FONT_SIZE = 10;
const DEFAULT_UNIT = "pt" as const;

function styleHint(component: ResolvedComponent): TextStyleHint {
  const s = (component.style ?? {}) as Record<string, any>;
  return { family: s.fontFamily, bold: s.fontWeight === "bold" || (typeof s.fontWeight === "number" && s.fontWeight >= 700), italic: Boolean(s.italic) };
}

function styleFontSize(component: ResolvedComponent): number {
  return (component.style?.fontSize as number | undefined) ?? DEFAULT_FONT_SIZE;
}

/** Lays out one component (and, recursively, its children) inside the given
 * box, returning a PositionedNode whose box.height reflects the component's
 * actual measured/declared size. `box.width` constrains wrapping; `box.y` is
 * the top the caller wants this component placed at. */
export function layoutComponent(component: ResolvedComponent, box: Box, measurer: TextMeasurer): PositionedNode {
  const width = resolveDimension(component.width, box.width, DEFAULT_UNIT) ?? box.width;

  switch (component.type) {
    case "text":
    case "richText":
    case "field": {
      const fontSize = styleFontSize(component);
      const hint = styleHint(component);
      const pad = typeof (component.style as any)?.padding === "number" ? (component.style as any).padding : 0;
      const lines = wrapLineCount((component as any).text, Math.max(1, width - pad * 2), fontSize, measurer, hint);
      const height = resolveDimension(component.height, box.height, DEFAULT_UNIT) ?? lines * measurer.lineHeight(fontSize, hint) + pad * 2;
      return { component, box: { x: box.x, y: box.y, width, height } };
    }

    case "image":
    case "chart": {
      const height = resolveDimension(component.height, box.height, DEFAULT_UNIT) ?? (component.type === "chart" ? 200 : 80);
      return { component, box: { x: box.x, y: box.y, width, height } };
    }

    case "qrcode":
    case "barcode": {
      const height = resolveDimension(component.height, box.height, DEFAULT_UNIT) ?? (component.type === "qrcode" ? 80 : 40);
      return { component, box: { x: box.x, y: box.y, width: resolveDimension(component.width, box.width, DEFAULT_UNIT) ?? height, height } };
    }

    case "line":
      return { component, box: { x: box.x, y: box.y, width, height: resolveDimension(component.height, 1, DEFAULT_UNIT) ?? 1 } };

    case "rectangle":
    case "spacer":
      return { component, box: { x: box.x, y: box.y, width, height: resolveDimension(component.height, box.height, DEFAULT_UNIT) ?? 10 } };

    case "pageBreak":
      return { component, box: { x: box.x, y: box.y, width, height: 0 } };

    case "table":
      return layoutTable(component as ResolvedTableComponent, box, measurer, width);

    case "group":
      return layoutGroup(component as ResolvedGroupComponent, box, measurer, width);

    case "container":
    case "row":
    case "column":
    case "grid":
    case "repeater":
    case "keepTogether":
      return layoutContainer(component as ResolvedContainerComponent, box, measurer, width);

    default:
      return { component, box: { x: box.x, y: box.y, width, height: 0 } };
  }
}

/** Stacks a list of components vertically (flow), returning positioned nodes
 * and the total height consumed. This is the layout used for sections and
 * for any container whose `layout` is "flow"/"column" (the default). */
export function layoutFlow(components: ResolvedComponent[], box: Box, measurer: TextMeasurer): { nodes: PositionedNode[]; height: number } {
  const nodes: PositionedNode[] = [];
  let y = box.y;
  for (const component of components) {
    const node = layoutComponent(component, { ...box, y }, measurer);
    nodes.push(node);
    y += node.box.height;
  }
  return { nodes, height: y - box.y };
}

function layoutRow(components: ResolvedComponent[], box: Box, measurer: TextMeasurer): { nodes: PositionedNode[]; height: number } {
  const explicit = components.map((c) => resolveDimension(c.width, box.width, DEFAULT_UNIT));
  const flexCount = explicit.filter((w) => w === undefined).length;
  const usedWidth = explicit.reduce<number>((acc, w) => acc + (w ?? 0), 0);
  const flexWidth = flexCount > 0 ? Math.max(0, box.width - usedWidth) / flexCount : 0;

  let x = box.x;
  let maxHeight = 0;
  const nodes = components.map((component, i) => {
    const w = explicit[i] ?? flexWidth;
    const node = layoutComponent(component, { x, y: box.y, width: w, height: box.height }, measurer);
    x += w;
    maxHeight = Math.max(maxHeight, node.box.height);
    return node;
  });
  return { nodes, height: maxHeight };
}

function layoutGrid(components: ResolvedComponent[], columns: number, box: Box, measurer: TextMeasurer): { nodes: PositionedNode[]; height: number } {
  const colWidth = box.width / Math.max(1, columns);
  const nodes: PositionedNode[] = [];
  let rowY = box.y;
  let rowMaxHeight = 0;

  components.forEach((component, i) => {
    const col = i % columns;
    if (col === 0 && i > 0) {
      rowY += rowMaxHeight;
      rowMaxHeight = 0;
    }
    const node = layoutComponent(component, { x: box.x + col * colWidth, y: rowY, width: colWidth, height: box.height }, measurer);
    rowMaxHeight = Math.max(rowMaxHeight, node.box.height);
    nodes.push(node);
  });

  return { nodes, height: rowY + rowMaxHeight - box.y };
}

function layoutAbsolute(components: ResolvedComponent[], box: Box, measurer: TextMeasurer): { nodes: PositionedNode[]; height: number } {
  const nodes = components.map((component) => {
    const x = box.x + (resolveDimension(component.x, box.width, DEFAULT_UNIT) ?? 0);
    const y = box.y + (resolveDimension(component.y, box.height, DEFAULT_UNIT) ?? 0);
    const width = resolveDimension(component.width, box.width, DEFAULT_UNIT) ?? box.width;
    const height = resolveDimension(component.height, box.height, DEFAULT_UNIT);
    return layoutComponent(component, { x, y, width, height: height ?? 0 }, measurer);
  });
  const maxBottom = nodes.reduce((acc, n) => Math.max(acc, n.box.y - box.y + n.box.height), 0);
  return { nodes, height: maxBottom };
}

function layoutContainer(component: ResolvedContainerComponent, box: Box, measurer: TextMeasurer, width: number): PositionedNode {
  const mode = component.layout ?? (component.type === "row" ? "row" : component.type === "grid" ? "grid" : "flow");
  const innerBox = { ...box, width };

  let result: { nodes: PositionedNode[]; height: number };
  if (mode === "absolute") {
    result = layoutAbsolute(component.children, innerBox, measurer);
  } else if (mode === "row") {
    result = layoutRow(component.children, innerBox, measurer);
  } else if (mode === "grid") {
    result = layoutGrid(component.children, component.columns ?? 1, innerBox, measurer);
  } else {
    result = layoutFlow(component.children, innerBox, measurer);
  }

  const height = resolveDimension(component.height, box.height, DEFAULT_UNIT) ?? result.height;
  return { component, box: { x: box.x, y: box.y, width, height }, children: result.nodes };
}

function layoutGroup(component: ResolvedGroupComponent, box: Box, measurer: TextMeasurer, width: number): PositionedNode {
  const children: PositionedNode[] = [];
  let y = box.y;
  for (const group of component.groups) {
    const header = layoutFlow(group.header, { ...box, y, width }, measurer);
    children.push(...header.nodes);
    y += header.height;

    const body = layoutFlow(group.children, { ...box, y, width }, measurer);
    children.push(...body.nodes);
    y += body.height;

    const footer = layoutFlow(group.footer, { ...box, y, width }, measurer);
    children.push(...footer.nodes);
    y += footer.height;
  }
  return { component, box: { x: box.x, y: box.y, width, height: y - box.y }, children };
}

export interface ColumnWidth {
  id: string;
  width: number;
}

/** Resolves table column widths against the available width: fixed columns
 * (numbers/units/percentages) are honored first, remaining space is split
 * evenly among flexible ("*"/unset) columns. */
export function resolveColumnWidths(table: ResolvedTableComponent, availableWidth: number): ColumnWidth[] {
  const widths = table.columns.map((col) => resolveDimension(col.width, availableWidth, DEFAULT_UNIT));
  const flexCount = widths.filter((w) => w === undefined).length;
  const used = widths.reduce<number>((acc, w) => acc + (w ?? 0), 0);
  const flexWidth = flexCount > 0 ? Math.max(0, availableWidth - used) / flexCount : 0;
  return table.columns.map((col, i) => ({ id: col.id, width: widths[i] ?? flexWidth }));
}

const ROW_PADDING = 4;
const HEADER_FOOTER_PADDING = 6;

export function measureRowHeight(table: ResolvedTableComponent, rowIndex: number, columnWidths: ColumnWidth[], measurer: TextMeasurer): number {
  const fontSize = styleFontSize(table);
  const row = table.rows[rowIndex]!;
  const lineCounts = table.columns.map((col, i) => wrapLineCount(row.formatted[col.id] ?? "", Math.max(1, columnWidths[i]!.width - 4), fontSize, measurer));
  const maxLines = Math.max(1, ...lineCounts);
  return maxLines * measurer.lineHeight(fontSize) + ROW_PADDING;
}

export function measureHeaderHeight(table: ResolvedTableComponent, measurer: TextMeasurer): number {
  return measurer.lineHeight(styleFontSize(table)) + HEADER_FOOTER_PADDING;
}

export function measureFooterHeight(table: ResolvedTableComponent, measurer: TextMeasurer): number {
  return measurer.lineHeight(styleFontSize(table)) + HEADER_FOOTER_PADDING;
}

function layoutTable(table: ResolvedTableComponent, box: Box, measurer: TextMeasurer, width: number): PositionedNode {
  const columnWidths = resolveColumnWidths(table, width);
  let y = box.y;
  if (table.showHeader) y += measureHeaderHeight(table, measurer);
  for (let i = 0; i < table.rows.length; i++) {
    y += measureRowHeight(table, i, columnWidths, measurer);
  }
  if (table.showFooter) y += measureFooterHeight(table, measurer);

  return {
    component: table,
    box: { x: box.x, y: box.y, width, height: y - box.y },
    rowRange: { start: 0, end: table.rows.length },
  };
}
