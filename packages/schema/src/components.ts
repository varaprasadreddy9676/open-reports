import { z } from "zod";
import { componentBaseSchema, dimensionSchema, styleWhenSchema, tableStylesSchema } from "./common.js";

const valueOrBindingOrExpression = z.object({
  value: z.unknown().optional(),
  binding: z.string().optional(),
  expression: z.string().optional(),
});

export const textComponentSchema = componentBaseSchema.extend({
  type: z.literal("text"),
  ...valueOrBindingOrExpression.shape,
  format: z.string().optional(),
});

export const richTextComponentSchema = componentBaseSchema.extend({
  type: z.literal("richText"),
  value: z.string().optional(),
  binding: z.string().optional(),
});

export const imageComponentSchema = componentBaseSchema.extend({
  type: z.literal("image"),
  src: z.string().optional(),
  binding: z.string().optional(),
  fit: z.enum(["fit", "fill", "contain", "cover", "stretch"]).optional().default("contain"),
  alt: z.string().optional(),
  /** What to do when the image source is empty/unavailable. */
  whenMissing: z.enum(["hide", "placeholder", "fail"]).optional(),
});

export const lineComponentSchema = componentBaseSchema.extend({
  type: z.literal("line"),
  orientation: z.enum(["horizontal", "vertical"]).optional().default("horizontal"),
});

export const rectangleComponentSchema = componentBaseSchema.extend({
  type: z.literal("rectangle"),
});

export const spacerComponentSchema = componentBaseSchema.extend({
  type: z.literal("spacer"),
  size: dimensionSchema.optional(),
});

export const fieldComponentSchema = componentBaseSchema.extend({
  type: z.literal("field"),
  binding: z.string().optional(),
  expression: z.string().optional(),
  format: z.string().optional(),
});

export const qrCodeComponentSchema = componentBaseSchema.extend({
  type: z.literal("qrcode"),
  value: z.string().optional(),
  binding: z.string().optional(),
  expression: z.string().optional(),
});

export const barcodeComponentSchema = componentBaseSchema.extend({
  type: z.literal("barcode"),
  value: z.string().optional(),
  binding: z.string().optional(),
  expression: z.string().optional(),
  symbology: z.enum(["code128", "ean13", "upc", "code39"]).optional().default("code128"),
});

export const pageBreakComponentSchema = componentBaseSchema.extend({
  type: z.literal("pageBreak"),
});

export const chartSeriesSchema = z.object({
  name: z.string(),
  binding: z.string().optional(),
  expression: z.string().optional(),
});

export const chartComponentSchema = componentBaseSchema.extend({
  type: z.literal("chart"),
  chartType: z.enum(["bar", "line", "pie"]),
  dataset: z.string().optional(),
  categoryBinding: z.string().optional(),
  series: z.array(chartSeriesSchema).default([]),
  title: z.string().optional(),
});

export const tableColumnSchema = z.object({
  id: z.string().optional(),
  header: z.string().optional(),
  binding: z.string().optional(),
  expression: z.string().optional(),
  width: dimensionSchema.optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  format: z.string().optional(),
  /** Merge consecutive rows with the same value into one cell, inside the merges of columns to the left; continues across pages. */
  mergeRepeated: z.boolean().optional(),
  footer: z.object({
    aggregate: z.enum(["sum", "avg", "min", "max", "count", "first", "last"]).optional(),
    expression: z.string().optional(),
    label: z.string().optional(),
  }).optional(),
});
export type TableColumn = z.infer<typeof tableColumnSchema>;

/** Header cells use zero-based column positions. The grid is validated by
 * @reporting/core because its bounds depend on the table's columns. */
export const tableHeaderCellSchema = z.object({
  column: z.number().int().nonnegative(),
  text: z.string(),
  colSpan: z.number().int().positive().optional().default(1),
  rowSpan: z.number().int().positive().optional().default(1),
  align: z.enum(["left", "center", "right"]).optional(),
});
export type TableHeaderCell = z.infer<typeof tableHeaderCellSchema>;

/** Positional merges in the resolved body, after table filtering and sorting.
 * Values in covered cells are suppressed; the top-left cell supplies content. */
/** A body merge starts at a row position, or at the first output row whose `match.field` equals `match.value`
 * (so it stays with that record when sorting or filtering changes). Exactly one of `row` / `match` is required. */
export const tableCellSpanSchema = z.object({
  row: z.number().int().nonnegative().optional(),
  match: z.object({ field: z.string().min(1), value: z.union([z.string(), z.number(), z.boolean(), z.null()]) }).optional(),
  column: z.number().int().nonnegative(),
  colSpan: z.number().int().positive().optional().default(1),
  rowSpan: z.number().int().positive().optional().default(1),
});
export type TableCellSpan = z.infer<typeof tableCellSpanSchema>;

export const tableComponentSchema = componentBaseSchema.extend({
  type: z.literal("table"),
  dataset: z.string(),
  columns: z.array(tableColumnSchema),
  /** Explicit multi-level header grid. Omit for the legacy single row built
   * from columns[].header. Cells may cover adjacent columns or header rows. */
  headerRows: z.array(z.array(tableHeaderCellSchema)).min(1).optional(),
  /** Explicit body merges, indexed by resolved row position (zero-based). */
  cellSpans: z.array(tableCellSpanSchema).optional(),
  sortBy: z.array(z.object({ binding: z.string(), direction: z.enum(["asc", "desc"]).default("asc") })).optional(),
  filterWhen: z.string().optional(),
  groupBy: z.string().optional(),
  showHeader: z.boolean().optional().default(true),
  showFooter: z.boolean().optional().default(false),
  repeatHeaderOnPageBreak: z.boolean().optional().default(true),
  keepRowTogether: z.boolean().optional().default(true),
  /** Whether rows may be split across a page break at all; false (the
   * default behavior today) always moves a whole row to the next page. True
   * is accepted by the schema for forward compatibility but is not yet
   * implemented by the layout engine (a row is still kept atomic). */
  allowRowSplit: z.boolean().optional().default(false),
  /** Keep at least one data row with totals when both fit on a fresh page.
   * If minRowsAfterBreak is higher, move that many rows when they fit. */
  keepFooterTogether: z.boolean().optional().default(true),
  /** Keep at least this many table rows on the page before a break when they
   * fit on a fresh page. If too few fit after preceding content, move the
   * first table slice to the next page. */
  minRowsBeforeBreak: z.number().int().nonnegative().optional().default(0),
  /** Avoid starting the final page with fewer than this many table rows when
   * possible by moving trailing rows from the preceding page with them. */
  minRowsAfterBreak: z.number().int().nonnegative().optional().default(0),
  alternateRowStyle: z.boolean().optional(),
  /** Name of a preset in `theme.tableStyles`; `styles` overrides it part by part. */
  tableStyle: z.string().optional(),
  styles: tableStylesSchema.optional(),
  /** Conditional row styling, e.g. { when: "row.balance < 0", style: { color: "#b91c1c" } }. */
  rowStyleWhen: styleWhenSchema.optional(),
  /** What to render when the dataset has no rows. */
  emptyState: z.enum(["hide", "headers", "message"]).optional(),
  emptyMessage: z.string().optional(),
});

/**
 * The component tree is recursive (containers hold components, which may hold
 * containers). Zod's discriminated unions can't be cleanly expressed as a
 * precise self-referential static type without tripping the compiler on
 * circular structural comparisons, so `componentSchema` is kept as
 * `ZodTypeAny` here and the convenience `AnyComponent` type below is a
 * hand-written, deliberately loose shape for downstream consumers (core,
 * renderers) rather than a strict `z.infer`. Runtime validation is unaffected
 * -- it still goes through the full discriminated union below.
 */
export interface AnyComponent {
  type: string;
  id?: string;
  children?: AnyComponent[];
  header?: AnyComponent[];
  footer?: AnyComponent[];
  otherwise?: AnyComponent[];
  [key: string]: unknown;
}

export const componentSchema: z.ZodTypeAny = z.lazy(() =>
  z.discriminatedUnion("type", [
    textComponentSchema,
    richTextComponentSchema,
    imageComponentSchema,
    lineComponentSchema,
    rectangleComponentSchema,
    spacerComponentSchema,
    fieldComponentSchema,
    qrCodeComponentSchema,
    barcodeComponentSchema,
    pageBreakComponentSchema,
    chartComponentSchema,
    tableComponentSchema,
    containerComponentSchema,
    rowComponentSchema,
    columnComponentSchema,
    gridComponentSchema,
    repeaterComponentSchema,
    groupComponentSchema,
    conditionalComponentSchema,
    keepTogetherComponentSchema,
    subreportComponentSchema,
    fragmentComponentSchema,
    labelSheetComponentSchema,
    customComponentSchema,
  ])
);

export const containerComponentSchema = componentBaseSchema.extend({
  type: z.literal("container"),
  children: z.array(componentSchema).default([]),
});

export const rowComponentSchema = componentBaseSchema.extend({
  type: z.literal("row"),
  children: z.array(componentSchema).default([]),
});

export const columnComponentSchema = componentBaseSchema.extend({
  type: z.literal("column"),
  children: z.array(componentSchema).default([]),
});

export const gridComponentSchema = componentBaseSchema.extend({
  type: z.literal("grid"),
  columns: z.number().int().positive().default(1),
  children: z.array(componentSchema).default([]),
});

export const repeaterComponentSchema = componentBaseSchema.extend({
  type: z.literal("repeater"),
  dataset: z.string(),
  itemLayout: z.enum(["flow", "row", "grid"]).optional().default("flow"),
  children: z.array(componentSchema).default([]),
});

/** A component provided by a plugin. The plugin's `expand` turns `props` into ordinary components, so every renderer supports it. */
export const customComponentSchema = componentBaseSchema.extend({
  type: z.literal("custom"),
  kind: z.string().regex(/^[A-Za-z0-9._-]+$/),
  props: z.record(z.unknown()).default({}),
});

/** N-up sticker/label sheets: the children are ONE label, repeated into a cols x rows grid on each sheet. Sizes are in mm. */
export const labelSheetComponentSchema = componentBaseSchema.extend({
  type: z.literal("labelSheet"),
  /** Fill one label per record of this dataset. Without it the same label is repeated `copies` times. */
  dataset: z.string().optional(),
  copies: z.number().int().positive().optional(),
  columns: z.number().int().positive(),
  rows: z.number().int().positive(),
  labelWidth: z.number().positive(),
  labelHeight: z.number().positive(),
  gapX: z.number().nonnegative().optional(),
  gapY: z.number().nonnegative().optional(),
  /** First label position to use (1-based, left-to-right then top-to-bottom) - lets you reuse a partly used sheet. */
  startPosition: z.number().int().positive().optional(),
  /** Draw a hairline around each label (for alignment tests on plain paper). */
  outlines: z.boolean().optional(),
  children: z.array(componentSchema).default([]),
});

export const groupComponentSchema = componentBaseSchema.extend({
  type: z.literal("group"),
  dataset: z.string().optional(),
  groupBy: z.string(),
  sortDirection: z.enum(["asc", "desc"]).optional().default("asc"),
  pageBreakBeforeGroup: z.boolean().optional(),
  keepGroupTogether: z.boolean().optional(),
  header: z.array(componentSchema).default([]),
  children: z.array(componentSchema).default([]),
  footer: z.array(componentSchema).default([]),
});

export const conditionalComponentSchema = componentBaseSchema.extend({
  type: z.literal("conditional"),
  when: z.string(),
  children: z.array(componentSchema).default([]),
  otherwise: z.array(componentSchema).default([]),
});

export const keepTogetherComponentSchema = componentBaseSchema.extend({
  type: z.literal("keepTogether"),
  children: z.array(componentSchema).default([]),
});

export const fragmentComponentSchema = componentBaseSchema.extend({
  type: z.literal("fragment"),
  /** id of a reusable block declared in the report's `fragments`. */
  ref: z.string(),
});

export const subreportComponentSchema = componentBaseSchema.extend({
  type: z.literal("subreport"),
  reportId: z.string(),
  dataset: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});
