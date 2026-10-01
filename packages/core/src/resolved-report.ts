/**
 * The Resolved Report Tree: the normalized, renderer-neutral structure
 * produced by the pipeline (schema validation -> parameter resolution ->
 * dataset execution -> expression evaluation -> component resolution).
 * Renderers (PDF/HTML/XLSX/CSV) consume *only* this tree. They never see raw
 * bindings/expressions, run SQL, call REST APIs, or compute business
 * formulas themselves -- all of that already happened here, once, so every
 * output format reports the same numbers (see spec sections 82-83).
 */

import type { ExportsConfig, PageConfig, Theme } from "@reporting/schema";

export interface ResolvedReport {
  id: string;
  name: string;
  locale: string;
  page: PageConfig;
  theme?: Theme;
  sections: ResolvedSection[];
  exports?: ExportsConfig;
  print?: import("@reporting/schema").PrintProfile;
  watermark?: import("@reporting/schema").Watermark;
  warnings: ResolvedWarning[];
}

export interface ResolvedWarning {
  code: string;
  path: string;
  message: string;
  componentId?: string;
}

export interface ResolvedSection {
  type: string;
  /** Index of the section in the report definition (stable key for page-master re-resolution). */
  sourceIndex: number;
  appliesTo?: string;
  repeat?: boolean;
  children: ResolvedComponent[];
}

export type ResolvedComponent =
  | ResolvedTextComponent
  | ResolvedImageComponent
  | ResolvedLineComponent
  | ResolvedRectangleComponent
  | ResolvedSpacerComponent
  | ResolvedQrCodeComponent
  | ResolvedBarcodeComponent
  | ResolvedPageBreakComponent
  | ResolvedChartComponent
  | ResolvedTableComponent
  | ResolvedContainerComponent
  | ResolvedGroupComponent;

export interface ResolvedComponentBase {
  id?: string;
  type: string;
  layout?: string;
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  style?: Record<string, unknown>;
  pageBreakBefore?: boolean;
  pageBreakAfter?: boolean;
  keepTogether?: boolean;
  keepWithNext?: boolean;
  gap?: number;
  alignItems?: string;
  justifyContent?: string;
  grow?: number;
  minWidth?: number | string;
  maxWidth?: number | string;
  minHeight?: number | string;
  maxHeight?: number | string;
  exports?: Record<string, unknown>;
  bookmark?: boolean | string;
  bookmarkLevel?: number;
}

export interface ResolvedTextComponent extends ResolvedComponentBase {
  type: "text" | "richText" | "field";
  text: string;
}

export interface ResolvedImageComponent extends ResolvedComponentBase {
  type: "image";
  src?: string;
  fit: string;
  alt?: string;
}

export interface ResolvedLineComponent extends ResolvedComponentBase {
  type: "line";
  orientation: string;
}

export interface ResolvedRectangleComponent extends ResolvedComponentBase {
  type: "rectangle";
}

export interface ResolvedSpacerComponent extends ResolvedComponentBase {
  type: "spacer";
}

export interface ResolvedQrCodeComponent extends ResolvedComponentBase {
  type: "qrcode";
  value: string;
}

export interface ResolvedBarcodeComponent extends ResolvedComponentBase {
  type: "barcode";
  value: string;
  symbology: string;
}

export interface ResolvedPageBreakComponent extends ResolvedComponentBase {
  type: "pageBreak";
}

export interface ResolvedChartComponent extends ResolvedComponentBase {
  type: "chart";
  chartType: "bar" | "line" | "pie";
  title?: string;
  categories: string[];
  series: { name: string; values: number[] }[];
}

export interface ResolvedTableColumn {
  id: string;
  header: string;
  width?: number | string;
  align?: string;
  format?: string;
  footer?: { label?: string; value: string; raw?: unknown };
}

export interface ResolvedTableRow {
  /** Raw per-column values, keyed by column id -- used by XLSX/CSV for correct cell types. */
  raw: Record<string, unknown>;
  /** Formatted display strings, keyed by column id -- used by PDF/HTML. */
  formatted: Record<string, string>;
  /** Style overrides from the table's rowStyleWhen rules that matched this row. */
  style?: Record<string, unknown>;
}

export interface ResolvedTableComponent extends ResolvedComponentBase {
  type: "table";
  columns: ResolvedTableColumn[];
  rows: ResolvedTableRow[];
  showHeader: boolean;
  showFooter: boolean;
  repeatHeaderOnPageBreak: boolean;
  keepRowTogether: boolean;
  alternateRowStyle?: boolean;
}

export interface ResolvedContainerComponent extends ResolvedComponentBase {
  type: "container" | "row" | "column" | "grid" | "repeater" | "keepTogether";
  columns?: number;
  children: ResolvedComponent[];
}

export interface ResolvedGroupComponent extends ResolvedComponentBase {
  type: "group";
  groupBy: string;
  pageBreakBeforeGroup?: boolean;
  keepGroupTogether?: boolean;
  groups: ResolvedGroupInstance[];
}

export interface ResolvedGroupInstance {
  key: unknown;
  header: ResolvedComponent[];
  children: ResolvedComponent[];
  footer: ResolvedComponent[];
}
