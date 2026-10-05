import type {
  ResolvedComponent,
  ResolvedTableComponent,
  ResolvedContainerComponent,
  ResolvedGroupComponent,
} from "@reporting/core";
import { isBold, tableCellSpanGrid, tableHeaderRows, tableRowStyle, tableStylesOrDefault } from "@reporting/core";
import type { TextMeasurer } from "./measure.js";
import { wrapLineCount, type TextStyleHint } from "./measure.js";
import { resolveDimension } from "./units.js";
import { stripeOf } from "./table-row-split.js";
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

export function styleFontSize(component: ResolvedComponent): number {
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

/** Distance to move a text node's lines down so they sit at its `style.verticalAlign` inside the padded box.
 * Renderers add it to the top padding; it is never negative, so overflowing text still starts at the top. */
export function textVerticalOffset(node: PositionedNode): number {
  const style = (node.component as { style?: Record<string, unknown> }).style;
  const align = style?.verticalAlign;
  if (align !== "middle" && align !== "bottom") return 0;
  const lines = node.textFragment ? node.textFragment.endLine - node.textFragment.startLine : node.textMetrics?.lines;
  const lineHeight = node.textMetrics?.lineHeight;
  if (!lines || !lineHeight) return 0;
  const pad = edgesOf(style?.padding);
  const free = node.box.height - pad.top - pad.bottom - lines * lineHeight;
  if (free <= 0) return 0;
  return align === "middle" ? free / 2 : free;
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
      const lines = (component.style as any)?.overflow === "ellipsis" ? 1 : wrapLineCount((component as any).text, Math.max(1, width - pad.left - pad.right), fontSize, measurer, hint);
      const lineHeight = measurer.lineHeight(fontSize, hint);
      const height = resolveDimension(component.height, box.height, DEFAULT_UNIT) ?? lines * lineHeight + pad.top + pad.bottom;
      return { component, box: { x: box.x, y: box.y, width, height }, textMetrics: { lineHeight, lines } };
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
  const free = components.filter((component) => component.x !== undefined || component.y !== undefined);
  const slots = free.length ? components.map((component) => component.x !== undefined || component.y !== undefined ? { ...component, x: undefined, y: undefined } as ResolvedComponent : component) : components;
  slots.forEach((component, i) => {
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
  if (!free.length) return { nodes, height: y - box.y };
  const positioned = layoutAbsolute(free, box, measurer);
  const freeNodes = new Map(positioned.nodes.map((node) => [node.component, node]));
  return { nodes: components.map((component, i) => freeNodes.get(component) ?? nodes[i]!), height: Math.max(y - box.y, positioned.height) };
}

export interface RowOptions extends FlowOptions {
  justifyContent?: string;
  wrap?: boolean;
}

function rowExplicitWidth(component: ResolvedComponent, available: number, margin: Edges, measurer: TextMeasurer): number | undefined {
  if (component.width === "auto" && (component.type === "text" || component.type === "field" || component.type === "richText")) {
    const fontSize = styleFontSize(component);
    const hint = styleHint(component);
    const widestLine = (component.text ?? "").split(/\r\n|\r|\n/).reduce((widest, line) => Math.max(widest, measurer.widthOf(line, fontSize, hint)), 0);
    const pad = edgesOf((component.style as any)?.padding);
    return Math.max(1, Math.min(available - margin.left - margin.right, widestLine + pad.left + pad.right));
  }
  return resolveDimension(component.width, available, DEFAULT_UNIT);
}

/** Lays children side by side. Fixed-width children keep their width; the rest
 * share the remaining space by `grow` weight (default 1). Honors gap, margins,
 * justifyContent (when nothing is flexible) and cross-axis alignItems. */
export function layoutRow(components: ResolvedComponent[], box: Box, measurer: TextMeasurer, opts: RowOptions = {}): { nodes: PositionedNode[]; height: number } {
  const n = components.length;
  if (n === 0) return { nodes: [], height: 0 };
  const gap = opts.gap ?? 0;
  if (opts.wrap && n > 1) {
    const lines: ResolvedComponent[][] = [];
    let line: ResolvedComponent[] = [];
    let used = 0;
    for (const component of components) {
      const m = marginOf(component);
      const min = resolveDimension(component.minWidth, box.width, DEFAULT_UNIT) ?? 1;
      const max = resolveDimension(component.maxWidth, box.width, DEFAULT_UNIT);
      const preferred = clamp(rowExplicitWidth(component, box.width, m, measurer) ?? min, min, max) + m.left + m.right;
      if (line.length && used + gap + preferred > box.width + 0.5) {
        lines.push(line);
        line = [];
        used = 0;
      }
      used += (line.length ? gap : 0) + preferred;
      line.push(component);
    }
    if (line.length) lines.push(line);
    const nodes: PositionedNode[] = [];
    let y = box.y;
    for (const group of lines) {
      const result = layoutRow(group, { ...box, y }, measurer, { ...opts, wrap: false });
      nodes.push(...result.nodes);
      y += result.height + gap;
    }
    return { nodes, height: y - box.y - gap };
  }
  const margins = components.map(marginOf);
  const explicit = components.map((c, i) => rowExplicitWidth(c, box.width, margins[i]!, measurer));
  const weights = components.map((c, i) => (explicit[i] === undefined ? (c.grow ?? 1) : 0));
  const fixed = components.reduce((acc, _c, i) => acc + (explicit[i] ?? 0) + margins[i]!.left + margins[i]!.right, 0);
  const remaining = Math.max(0, box.width - fixed - gap * (n - 1));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const widths = components.map((c, i) => {
    const w = explicit[i] ?? (totalWeight > 0 ? (remaining * weights[i]!) / totalWeight : 0);
    return clamp(w, resolveDimension(c.minWidth, box.width, DEFAULT_UNIT), resolveDimension(c.maxWidth, box.width, DEFAULT_UNIT));
  });

  // Shrink is opt-in for fixed/hugged widths. Reallocate any remaining deficit
  // after a child reaches its minimum so other shrinkable children can help.
  let deficit = widths.reduce((sum, w, i) => sum + w + margins[i]!.left + margins[i]!.right, gap * (n - 1)) - box.width;
  for (let pass = 0; pass < n && deficit > 0.5; pass++) {
    const eligible = components.map((c, i) => ({ index: i, floor: Math.max(1, resolveDimension(c.minWidth, box.width, DEFAULT_UNIT) ?? 1), factor: (c.shrink ?? 0) * widths[i]! }))
      .filter(({ index, floor, factor }) => factor > 0 && widths[index]! > floor + 0.01);
    const total = eligible.reduce((sum, item) => sum + item.factor, 0);
    if (!total) break;
    let removed = 0;
    for (const item of eligible) {
      const amount = Math.min(widths[item.index]! - item.floor, deficit * item.factor / total);
      widths[item.index] = widths[item.index]! - amount;
      removed += amount;
    }
    deficit -= removed;
    if (removed < 0.01) break;
  }

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
    const declaredWidth = resolveDimension(component.width, box.width, DEFAULT_UNIT);
    const overrideWidth = declaredWidth !== undefined && (Math.abs(declaredWidth - widths[i]!) > 0.01 || typeof component.width === "string" && component.width.endsWith("%"));
    const child = overrideWidth ? { ...component, width: widths[i]!, minWidth: undefined, maxWidth: undefined } as ResolvedComponent : component;
    const node = layoutComponent(child, { x, y: box.y + m.top, width: widths[i]!, height: box.height }, measurer);
    if (overrideWidth) node.component = component;
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
  } else if (opts.alignItems === "stretch") {
    nodes.forEach((node, i) => {
      if (components[i]!.height === undefined || components[i]!.height === "auto") {
        const m = margins[i]!;
        node.box.height = Math.max(node.box.height, rowHeight - m.top - m.bottom);
      }
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

  // A child with coordinates is free within this container. Keep its flow
  // siblings in their chosen row/grid/stack layout instead of changing the
  // layout mode of the entire band when one item is dragged.
  const free = mode === "absolute" ? [] : component.children.filter((child) => child.x !== undefined || child.y !== undefined);
  const slots = free.length ? component.children.map((child) => child.x !== undefined || child.y !== undefined ? { ...child, x: undefined, y: undefined } as ResolvedComponent : child) : component.children;
  let result: { nodes: PositionedNode[]; height: number };
  if (mode === "absolute") {
    result = layoutAbsolute(component.children, inner, measurer);
  } else if (mode === "row") {
    result = layoutRow(slots, inner, measurer, { gap: component.gap, alignItems: component.alignItems, justifyContent: component.justifyContent, wrap: component.wrap });
  } else if (mode === "grid") {
    result = layoutGrid(slots, component.columns ?? 1, inner, measurer, component.gap ?? 0);
  } else {
    result = layoutFlow(slots, inner, measurer, { gap: component.gap, alignItems: component.alignItems });
  }
  if (free.length) {
    const positioned = layoutAbsolute(free, inner, measurer);
    const freeNodes = new Map(positioned.nodes.map((node) => [node.component, node]));
    result = { nodes: component.children.map((child, i) => freeNodes.get(child) ?? result.nodes[i]!), height: Math.max(result.height, positioned.height) };
  }

  const intrinsic = result.height + pad.top + pad.bottom;
  const height = resolveDimension(component.height, box.height, DEFAULT_UNIT) ?? intrinsic;
  return { component, box: { x: box.x, y: box.y, width, height }, children: result.nodes };
}

function layoutGroup(component: ResolvedGroupComponent, box: Box, measurer: TextMeasurer, width: number): PositionedNode {
  const children: PositionedNode[] = [];
  const free: ResolvedComponent[] = [];
  let y = box.y;
  for (const group of component.groups) {
    for (const part of [group.header, group.children, group.footer]) {
      const freeInPart = part.filter((child) => child.x !== undefined || child.y !== undefined);
      free.push(...freeInPart);
      const slots = part.map((child) => child.x !== undefined || child.y !== undefined ? { ...child, x: undefined, y: undefined } as ResolvedComponent : child);
      const r = layoutFlow(slots, { ...box, y, width }, measurer);
      children.push(...r.nodes.filter((_, i) => part[i]!.x === undefined && part[i]!.y === undefined));
      y += r.height;
    }
  }
  const positioned = layoutAbsolute(free, { ...box, width }, measurer);
  children.push(...positioned.nodes);
  return { component, box: { x: box.x, y: box.y, width, height: Math.max(y - box.y, positioned.height) }, children };
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
  // Measure with the weight and slant each row is drawn with (body, stripes, rule styles).
  const styles = tableStylesOrDefault(table);
  const hintFor = (rowIndex: number, columnId?: string): TextStyleHint => {
    const row = table.rows[rowIndex];
    const style = { ...tableRowStyle(styles, stripeOf(row, rowIndex), row?.style as Record<string, unknown> | undefined), ...(columnId ? row?.cellStyles?.[columnId] ?? {} : {}) };
    return { bold: isBold(style), italic: Boolean(style.italic) };
  };
  const heights = table.rows.map((row, rowIndex) => {
    let maxLines = 1;
    table.columns.forEach((column, columnIndex) => {
      const hint = hintFor(rowIndex, column.id);
      const slot = grid.get(rowIndex)?.get(columnIndex);
      if (slot && (!slot.anchor || (slot.span.rowSpan ?? 1) > 1)) return;
      const width = slot ? columnWidths.slice(columnIndex, columnIndex + (slot.span.colSpan ?? 1)).reduce((sum, part) => sum + part.width, 0) : columnWidths[columnIndex]!.width;
      maxLines = Math.max(maxLines, wrapLineCount(row.formatted[column.id] ?? "", Math.max(1, width - 4), fontSize, measurer, hint));
    });
    return maxLines * lineHeight + ROW_PADDING;
  });
  for (const span of spans) {
    if ((span.rowSpan ?? 1) <= 1) continue;
    const width = columnWidths.slice(span.column, span.column + (span.colSpan ?? 1)).reduce((sum, part) => sum + part.width, 0);
    const text = table.rows[span.row]!.formatted[table.columns[span.column]!.id] ?? "";
    const required = wrapLineCount(text, Math.max(1, width - 4), fontSize, measurer, hintFor(span.row, table.columns[span.column]!.id)) * lineHeight + ROW_PADDING;
    const current = heights.slice(span.row, span.row + (span.rowSpan ?? 1)).reduce((sum, height) => sum + height, 0);
    if (required > current) heights[span.row + (span.rowSpan ?? 1) - 1]! += required - current;
  }
  return heights;
}

export function measureHeaderRowHeights(table: ResolvedTableComponent, columnWidths: ColumnWidth[], measurer: TextMeasurer): number[] {
  const fontSize = styleFontSize(table);
  const lineHeight = measurer.lineHeight(fontSize);
  const rows = tableHeaderRows(table);
  const headerStyle = tableStylesOrDefault(table).header;
  const hint: TextStyleHint = { bold: isBold(headerStyle), italic: Boolean(headerStyle.italic) };
  const heights = rows.map(() => lineHeight + HEADER_FOOTER_PADDING);
  rows.forEach((cells, row) => cells.forEach((cell) => {
    const span = cell.rowSpan ?? 1;
    const width = columnWidths.slice(cell.column, cell.column + (cell.colSpan ?? 1)).reduce((sum, column) => sum + column.width, 0);
    const required = wrapLineCount(cell.text, Math.max(1, width - 4), fontSize, measurer, hint) * lineHeight + HEADER_FOOTER_PADDING;
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
    box: { x: box.x, y: box.y, width, height: Math.max(y - box.y, resolveDimension(table.height, box.height, DEFAULT_UNIT) ?? 0) },
    rowRange: { start: 0, end: table.rows.length },
  };
}
