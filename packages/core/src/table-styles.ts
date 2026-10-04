import type { Theme } from "@reporting/schema";
import { resolveStyleTokens, type UnknownToken } from "./theme.js";

/** Appearance of one table section. Size and spacing stay at table level so page breaks never depend on a style. */
export interface TablePartStyle {
  color?: string;
  background?: string;
  fontWeight?: "normal" | "bold" | number;
  italic?: boolean;
}

export type TableGridLines = "none" | "header" | "horizontal" | "all";

export interface ResolvedTableStyles {
  header: TablePartStyle;
  body: TablePartStyle;
  /** Every second body row; absent when rows are not striped. */
  alternateRow?: TablePartStyle;
  footer: TablePartStyle;
  grid: { lines: TableGridLines; color: string; width: number };
}

export interface TableStylesDefinition {
  header?: TablePartStyle;
  body?: TablePartStyle;
  alternateRow?: TablePartStyle;
  footer?: TablePartStyle;
  grid?: { lines?: TableGridLines; color?: string; width?: number };
}

const PARTS = ["header", "body", "alternateRow", "footer"] as const;
const ZEBRA = "#f5f5f5";

/** What tables looked like before table styles: bold header and footer, a rule under the header, optional grey stripes. */
export function defaultTableStyles(alternateRowStyle?: boolean): ResolvedTableStyles {
  return {
    header: { color: "#000000", fontWeight: "bold" },
    body: { color: "#000000" },
    ...(alternateRowStyle ? { alternateRow: { background: ZEBRA } } : {}),
    footer: { color: "#000000", fontWeight: "bold" },
    grid: { lines: "header", color: "#000000", width: 0.5 },
  };
}

/**
 * A table's effective styles: defaults, then the named theme preset, then the table's own `styles`, with theme tokens resolved.
 * Returns undefined when the table uses neither, so renderers keep their historical output.
 */
export function resolveTableStyles(
  table: { tableStyle?: string; styles?: TableStylesDefinition; alternateRowStyle?: boolean },
  theme: Theme | undefined,
  unknown: UnknownToken[] = [],
): ResolvedTableStyles | undefined {
  const preset = table.tableStyle ? ((theme as { tableStyles?: Record<string, TableStylesDefinition> } | undefined)?.tableStyles?.[table.tableStyle]) : undefined;
  if (!preset && !table.styles) return undefined;
  const base = defaultTableStyles(table.alternateRowStyle);
  const out: ResolvedTableStyles = { ...base, grid: { ...base.grid } };
  for (const source of [preset, table.styles]) {
    if (!source) continue;
    for (const part of PARTS) {
      if (source[part]) out[part] = { ...(out[part] ?? {}), ...source[part] };
    }
    if (source.grid) out.grid = { ...out.grid, ...Object.fromEntries(Object.entries(source.grid).filter(([, value]) => value !== undefined)) };
  }
  for (const part of PARTS) {
    if (out[part]) out[part] = resolveStyleTokens(out[part] as Record<string, unknown>, theme, unknown) as TablePartStyle;
  }
  out.grid.color = (resolveStyleTokens({ color: out.grid.color }, theme, unknown)?.color as string | undefined) ?? base.grid.color;
  return out;
}

/** The styles to draw with: the resolved styles, or the historical defaults. */
export function tableStylesOrDefault(table: { styles?: unknown; alternateRowStyle?: boolean }): ResolvedTableStyles {
  return (table.styles as ResolvedTableStyles | undefined) ?? defaultTableStyles(table.alternateRowStyle);
}

/**
 * The style a body row is drawn with: body, then stripes on every second row (by its position in the whole table, so
 * measurement and every renderer agree), then the row's own rule styles.
 */
export function tableRowStyle(styles: ResolvedTableStyles, rowIndex: number, rowStyle?: Record<string, unknown>): TablePartStyle & Record<string, unknown> {
  return { ...styles.body, ...(styles.alternateRow && rowIndex % 2 === 1 ? styles.alternateRow : {}), ...(rowStyle ?? {}) };
}

export const isBold = (style: { fontWeight?: unknown } | undefined): boolean =>
  style?.fontWeight === "bold" || (typeof style?.fontWeight === "number" && style.fontWeight >= 600);
