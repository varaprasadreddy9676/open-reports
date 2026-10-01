import { z } from "zod";
import { componentBaseSchema, dimensionSchema } from "./common.js";

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
  footer: z.object({
    aggregate: z.enum(["sum", "avg", "min", "max", "count", "first", "last"]).optional(),
    expression: z.string().optional(),
    label: z.string().optional(),
  }).optional(),
});
export type TableColumn = z.infer<typeof tableColumnSchema>;

export const tableComponentSchema = componentBaseSchema.extend({
  type: z.literal("table"),
  dataset: z.string(),
  columns: z.array(tableColumnSchema),
  sortBy: z.array(z.object({ binding: z.string(), direction: z.enum(["asc", "desc"]).default("asc") })).optional(),
  filterWhen: z.string().optional(),
  groupBy: z.string().optional(),
  showHeader: z.boolean().optional().default(true),
  showFooter: z.boolean().optional().default(false),
  repeatHeaderOnPageBreak: z.boolean().optional().default(true),
  keepRowTogether: z.boolean().optional().default(true),
  alternateRowStyle: z.boolean().optional(),
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

export const subreportComponentSchema = componentBaseSchema.extend({
  type: z.literal("subreport"),
  reportId: z.string(),
  dataset: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});
