import type {
  ResolvedComponent,
  ResolvedTableComponent,
  ResolvedContainerComponent,
  ResolvedGroupComponent,
} from "@reporting/core";
import { tableCellSpanGrid, tableHeaderRows } from "@reporting/core";
import type { TextMeasurer } from "./measure.js";
import { wrapLineCount, type TextStyleHint } from "./measure.js";
import { resolveDimension } from "./units.js";
import type { Box, PositionedNode } from "./types.js";

const DEFAULT_FONT_SIZE = 10;
const DEFAULT_UNIT = "pt" as const;

export interface Edges {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function edgesOf(v: unknown): Edges {
  if (typeof v === "number") return { top: v, right: v, bottom: v, left: v };
  const s = (v ?? {}) as Partial<Edges>;
  return { top: s.top ?? 0, right: s.right ?? 0, bottom: s.bottom ?? 0, left: s.left ?? 0 };
}

export function marginOf(c: ResolvedComponent): Edges {
  return edgesOf((c.style as any)?.margin);
}

function styleHint(component: ResolvedComponent): TextStyleHint {
  const s = (component.style ?? {}) as Record<string, any>;
  return { family: s.fontFamily, bold: s.fontWeight === "bold" || (typeof s.fontWeight === "number" && s.fontWeight >= 700), italic: Boolean(s.italic), lineHeight: s.lineHeight };
}

function styleFontSize(component: ResolvedComponent): number {
  return (component.style?.fontSize as number | undefined) ?? DEFAULT_FONT_SIZE;
}

export function shiftNode(node: PositionedNode, dx: number, dy: number): void {
  node.box.x += dx;
  node.box.y += dy;
  for (const c of node.children ?? []) shiftNode(c, dx, dy);
}

function clamp(v: number, min: number | undefined, max: number | undefined): number {
  let r = v;
  if (max !== undefined) r = Math.min(r, max);
  if (min !== undefined) r = Math.max(r, min);
  return r;
}

/** Lays out one component (and, recursively, its children) inside the given
 * box, returning a PositionedNode whose box.height reflects the component's
 * actual measured/declared size. `box.width` constrains wrapping; `box.y` is
 * the top the caller wants this component placed at. Margins are the caller's
 * concern (flow/row/grid add them around the returned box); min/max sizes are
 * applied here. */
export function layoutComponent(component: ResolvedComponent, box: Box, measurer: TextMeasurer): PositionedNode {
  const minW = resolveDimension(component.minWidth, box.width, DEFAULT_UNIT);
  const maxW = resolveDimension(component.maxWidth, box.width, DEFAULT_UNIT);
  const minH = resolveDimension(component.minHeight, box.height, DEFAULT_UNIT);
  const maxH = resolveDimension(component.maxHeight, box.height, DEFAULT_UNIT);
  const width = clamp(resolveDimension(component.width, box.width, DEFAULT_UNIT) ?? box.width, minW, maxW);
  const node = layoutIntrinsic(component, { ...box }, measurer, width);
  if (minH !== undefined || maxH !== undefined) node.box.height = clamp(node.box.height, minH, maxH);
  return node;
}

function layoutIntrinsic(component: ResolvedComponent, box: Box, measurer: TextMeasurer, width: number): PositionedNode {
  switch (component.type) {
    case "text":
    case "richText":
    case "field": {
      const fontSize = styleFontSize(component);
      const hint = styleHint(component);
      const pad = edgesOf((component.style as any)?.padding);
      const lines = wrapLineCount((component as any).text, Math.max(1, width - pad.left - pad.right), fontSize, measurer, hint);
      const lineHeight = measurer.lineHeight(fontSize, hint);
      const height = resolveDimension(component.height, box.height, DEFAULT_UNIT) ?? lines * lineHeight + pad.top + pad.bottom;
      return { component, box: { x: box.x, y: box.y, width, height }, textMetrics: { lineHeight } };
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

export interface FlowOptions {
  gap?: number;
  alignItems?: string;
}

/** Stacks components vertically (flow). Honors each child's margins, an optional
 * `gap` between children, and cross-axis alignment of children narrower than
 * the container. Returns positioned nodes and the total height consumed. */
export function layoutFlow(components: ResolvedComponent[], box: Box, measurer: TextMeasurer, opts: FlowOptions = {}): { nodes: PositionedNode[]; height: number } {
  const nodes: PositionedNode[] = [];
  let y = box.y;
  components.forEach((component, i) => {
    const m = marginOf(component);
    if (i > 0) y += opts.gap ?? 0;
    const availW = Math.max(1, box.width - m.left - m.right);
    const node = layoutComponent(component, { x: box.x + m.left, y: y + m.top, width: availW, height: box.height }, measurer);
    if (node.box.width < availW) {
      const free = availW - node.box.width;
      const cross = opts.alignItems;
      if (cross === "center") shiftNode(node, free / 2, 0);
      else if (cross === "end") shiftNode(node, free, 0);
    }
    nodes.push(node);
    y = node.box.y + node.box.height + m.bottom;
  });
  return { nodes, height: y - box.y };
}

export interface RowOptions extends FlowOptions {
  justifyContent?: string;
}

/** Lays children side by side. Fixed-width children keep their width; the rest
 * share the remaining space by `grow` weight (default 1). Honors gap, margins,
 * justifyContent (when nothing is flexible) and cross-axis alignItems. */
export function layoutRow(components: ResolvedComponent[], box: Box, measurer: TextMeasurer, opts: RowOptions = {}): { nodes: PositionedNode[]; height: number } {
  const n = components.length;
  if (n === 0) return { nodes: [], height: 0 };
  const gap = opts.gap ?? 0;
  const margins = components.map(marginOf);
  const explicit = components.map((c) => resolveDimension(c.width, box.width, DEFAULT_UNIT));
  const weights = components.map((c, i) => (explicit[i] === undefined ? (c.grow ?? 1) : 0));
  const fixed = components.reduce((acc, _c, i) => acc + (explicit[i] ?? 0) + margins[i]!.left + margins[i]!.right, 0);
  const remaining = Math.max(0, box.width - fixed - gap * (n - 1));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const widths = components.map((c, i) => {
    const w = explicit[i] ?? (totalWeight > 0 ? (remaining * weights[i]!) / totalWeight : 0);
    return clamp(w, resolveDimension(c.minWidth, box.width, DEFAULT_UNIT), resolveDimension(c.maxWidth, box.width, DEFAULT_UNIT));
  });

  const used = widths.reduce((a, w, i) => a + w + margins[i]!.left + margins[i]!.right, 0) + gap * (n - 1);
  const leftover = Math.max(0, box.width - used);
  let x = box.x;
  let extraGap = 0;
  if (totalWeight === 0) {
    if (opts.justifyContent === "center") x += leftover / 2;
    else if (opts.justifyContent === "end") x += leftover;
    else if (opts.justifyContent === "space-between" && n > 1) extraGap = leftover / (n - 1);
    else if (opts.justifyContent === "space-around") {
      extraGap = leftover / n;
      x += extraGap / 2;
    }
  }

  const nodes: PositionedNode[] = [];
  let rowHeight = 0;
  components.forEach((component, i) => {
    const m = margins[i]!;
    x += m.left;
    const node = layoutComponent(component, { x, y: box.y + m.top, width: widths[i]!, height: box.height }, measurer);
    x += widths[i]! + m.right + gap + extraGap;
    nodes.push(node);
    rowHeight = Math.max(rowHeight, node.box.height + m.top + m.bottom);
  });

  if (opts.alignItems === "center" || opts.alignItems === "end") {
    nodes.forEach((node, i) => {
      const m = margins[i]!;
      const free = rowHeight - (node.box.height + m.top + m.bottom);
      shiftNode(node, 0, opts.alignItems === "center" ? free / 2 : free);
    });
  }
  return { nodes, height: rowHeight };
}

export function layoutGrid(components: ResolvedComponent[], columns: number, box: Box, measurer: TextMeasurer, gap = 0): { nodes: PositionedNode[]; height: number } {
  const cols = Math.max(1, columns);
  const colWidth = (box.width - gap * (cols - 1)) / cols;
  const nodes: PositionedNode[] = [];
  let rowY = box.y;
  let rowMaxHeight = 0;

  components.forEach((component, i) => {
    const col = i % cols;
    if (col === 0 && i > 0) {
      rowY += rowMaxHeight + gap;
      rowMaxHeight = 0;
    }
    const m = marginOf(component);
    const node = layoutComponent(
      component,
      { x: box.x + col * (colWidth + gap) + m.left, y: rowY + m.top, width: Math.max(1, colWidth - m.left - m.right), height: box.height },
      measurer
    );
    rowMaxHeight = Math.max(rowMaxHeight, node.box.height + m.top + m.bottom);
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
  const pad = edgesOf((component.style as any)?.padding);
  const inner: Box = { x: box.x + pad.left, y: box.y + pad.top, width: Math.max(1, width - pad.left - pad.right), height: box.height };

  let result: { nodes: PositionedNode[]; height: number };
  if (mode === "absolute") {
    result = layoutAbsolute(component.children, inner, measurer);
  } else if (mode === "row") {
    result = layoutRow(component.children, inner, measurer, { gap: component.gap, alignItems: component.alignItems, justifyContent: component.justifyContent });
  } else if (mode === "grid") {
    result = layoutGrid(component.children, component.columns ?? 1, inner, measurer, component.gap ?? 0);
  } else {
    result = layoutFlow(component.children, inner, measurer, { gap: component.gap, alignItems: component.alignItems });
  }

  const intrinsic = result.height + pad.top + pad.bottom;
  const height = resolveDimension(component.height, box.height, DEFAULT_UNIT) ?? intrinsic;
  return { component, box: { x: box.x, y: box.y, width, height }, children: result.nodes };
}

function layoutGroup(component: ResolvedGroupComponent, box: Box, measurer: TextMeasurer, width: number): PositionedNode {
  const children: PositionedNode[] = [];
  let y = box.y;
  for (const group of component.groups) {
    for (const part of [group.header, group.children, group.footer]) {
      const r = layoutFlow(part, { ...box, y, width }, measurer);
      children.push(...r.nodes);
      y += r.height;
    }
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
  return measureTableRowHeights(table, columnWidths, measurer)[rowIndex]!;
}

/** Measure merged body cells over their full width/height before pagination. */
export function measureTableRowHeights(table: ResolvedTableComponent, columnWidths: ColumnWidth[], measurer: TextMeasurer): number[] {
  const fontSize = styleFontSize(table);
  const lineHeight = measurer.lineHeight(fontSize);
  const spans = table.cellSpans ?? [];
  const grid = tableCellSpanGrid(spans);
  const heights = table.rows.map((row, rowIndex) => {
    let maxLines = 1;
    table.columns.forEach((column, columnIndex) => {
      const slot = grid.get(rowIndex)?.get(columnIndex);
      if (slot && (!slot.anchor || (slot.span.rowSpan ?? 1) > 1)) return;
      const width = slot ? columnWidths.slice(columnIndex, columnIndex + (slot.span.colSpan ?? 1)).reduce((sum, part) => sum + part.width, 0) : columnWidths[columnIndex]!.width;
      maxLines = Math.max(maxLines, wrapLineCount(row.formatted[column.id] ?? "", Math.max(1, width - 4), fontSize, measurer));
    });
    return maxLines * lineHeight + ROW_PADDING;
  });
  for (const span of spans) {
    if ((span.rowSpan ?? 1) <= 1) continue;
    const width = columnWidths.slice(span.column, span.column + (span.colSpan ?? 1)).reduce((sum, part) => sum + part.width, 0);
    const text = table.rows[span.row]!.formatted[table.columns[span.column]!.id] ?? "";
    const required = wrapLineCount(text, Math.max(1, width - 4), fontSize, measurer) * lineHeight + ROW_PADDING;
    const current = heights.slice(span.row, span.row + (span.rowSpan ?? 1)).reduce((sum, height) => sum + height, 0);
    if (required > current) heights[span.row + (span.rowSpan ?? 1) - 1]! += required - current;
  }
  return heights;
}

export function measureHeaderRowHeights(table: ResolvedTableComponent, columnWidths: ColumnWidth[], measurer: TextMeasurer): number[] {
  const fontSize = styleFontSize(table);
  const lineHeight = measurer.lineHeight(fontSize);
  const rows = tableHeaderRows(table);
  const heights = rows.map(() => lineHeight + HEADER_FOOTER_PADDING);
  rows.forEach((cells, row) => cells.forEach((cell) => {
    const span = cell.rowSpan ?? 1;
    const width = columnWidths.slice(cell.column, cell.column + (cell.colSpan ?? 1)).reduce((sum, column) => sum + column.width, 0);
    const required = wrapLineCount(cell.text, Math.max(1, width - 4), fontSize, measurer) * lineHeight + HEADER_FOOTER_PADDING;
    const current = heights.slice(row, row + span).reduce((sum, height) => sum + height, 0);
    if (required > current) heights[row + span - 1]! += required - current;
  }));
  return heights;
}

export function measureHeaderHeight(table: ResolvedTableComponent, measurer: TextMeasurer, columnWidths: ColumnWidth[]): number {
  return measureHeaderRowHeights(table, columnWidths, measurer).reduce((sum, height) => sum + height, 0);
}

export function measureFooterHeight(table: ResolvedTableComponent, measurer: TextMeasurer): number {
  return measurer.lineHeight(styleFontSize(table)) + HEADER_FOOTER_PADDING;
}

function layoutTable(table: ResolvedTableComponent, box: Box, measurer: TextMeasurer, width: number): PositionedNode {
  const columnWidths = resolveColumnWidths(table, width);
  let y = box.y;
  if (table.showHeader) y += measureHeaderHeight(table, measurer, columnWidths);
  for (const rowHeight of measureTableRowHeights(table, columnWidths, measurer)) y += rowHeight;
  if (table.showFooter) y += measureFooterHeight(table, measurer);

  return {
    component: table,
    box: { x: box.x, y: box.y, width, height: y - box.y },
    rowRange: { start: 0, end: table.rows.length },
  };
}
