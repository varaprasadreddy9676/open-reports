import { z } from "zod";
import { rulesSchema } from "./rules.js";

export const unitSchema = z.enum(["px", "pt", "mm", "cm", "in"]);
export type Unit = z.infer<typeof unitSchema>;

/** A dimension is either a bare number (px) or a string like "10mm" / "50%" / "*" (flex) / "auto". */
export const dimensionSchema = z.union([
  z.number(),
  z.string().regex(/^(-?\d+(\.\d+)?(px|pt|mm|cm|in|%)?|\*|auto)$/, "Invalid dimension"),
]);
export type Dimension = z.infer<typeof dimensionSchema>;

/** A reference to a theme token, e.g. "$brand" (colors), "$heading" (fonts), "$xl" (fontSizes), "$md" (spacing). */
export const tokenRefSchema = z.string().regex(/^\$[A-Za-z][A-Za-z0-9_-]*$/, "Use $name to reference a theme token.");

export const colorSchema = z.string().regex(
  /^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\(.*\)|[a-zA-Z]+|\$[A-Za-z][A-Za-z0-9_-]*)$/,
  "Invalid color"
);

export const borderSideSchema = z.object({
  width: z.number().nonnegative().default(1),
  style: z.enum(["solid", "dashed", "dotted", "none"]).default("solid"),
  color: colorSchema.default("#000000"),
});
export type BorderSide = z.infer<typeof borderSideSchema>;

export const borderSchema = z.union([
  z.object({
    top: borderSideSchema.optional(),
    right: borderSideSchema.optional(),
    bottom: borderSideSchema.optional(),
    left: borderSideSchema.optional(),
  }).strict(),
  borderSideSchema,
]);

const spacingValueSchema = z.union([z.number(), tokenRefSchema]);
export const spacingSchema = z.union([
  z.number(),
  tokenRefSchema,
  z.object({
    top: spacingValueSchema.default(0),
    right: spacingValueSchema.default(0),
    bottom: spacingValueSchema.default(0),
    left: spacingValueSchema.default(0),
  }),
]);
export type Spacing = z.infer<typeof spacingSchema>;

export const styleSchema = z
  .object({
    fontFamily: z.string().optional(),
    fontSize: z.union([z.number(), tokenRefSchema]).optional(),
    fontWeight: z.union([z.enum(["normal", "bold"]), z.number()]).optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    strikethrough: z.boolean().optional(),
    align: z.enum(["left", "center", "right", "justify"]).optional(),
    verticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
    lineHeight: z.number().optional(),
    letterSpacing: z.number().optional(),
    color: colorSchema.optional(),
    background: colorSchema.optional(),
    padding: spacingSchema.optional(),
    margin: spacingSchema.optional(),
    border: borderSchema.optional(),
    borderRadius: z.number().optional(),
    wrap: z.boolean().optional(),
    overflow: z.enum(["visible", "hidden", "clip", "ellipsis"]).optional(),
    direction: z.enum(["ltr", "rtl", "auto"]).optional(),
  })
  .strict();
export type Style = z.infer<typeof styleSchema>;

/** Appearance of one table section. Font size and padding stay on the table so styles never change page breaks. */
export const tablePartStyleSchema = z.object({
  color: colorSchema.optional(),
  background: colorSchema.optional(),
  fontWeight: z.union([z.enum(["normal", "bold"]), z.number()]).optional(),
  italic: z.boolean().optional(),
}).strict();

export const tableStylesSchema = z.object({
  header: tablePartStyleSchema.optional(),
  body: tablePartStyleSchema.optional(),
  /** Every second body row. */
  alternateRow: tablePartStyleSchema.optional(),
  footer: tablePartStyleSchema.optional(),
  /** Rules: none; header (under the header, above the footer); horizontal (also between rows); all (every cell and the outline). */
  grid: z.object({
    lines: z.enum(["none", "header", "horizontal", "all"]).optional(),
    color: colorSchema.optional(),
    width: z.number().min(0).max(5).optional(),
  }).strict().optional(),
}).strict();
export type TableStyles = z.infer<typeof tableStylesSchema>;

export const styleWhenSchema = z.array(
  z.object({
    when: z.string(),
    style: styleSchema.partial(),
  })
);

/** Common properties every component may declare, regardless of type. */
export const componentBaseSchema = z.object({
  id: z.string().optional(),
  /** Friendly name shown in the designer's layer tree. */
  name: z.string().optional(),
  /** Designer lock: the element cannot be moved or edited on the canvas. */
  locked: z.boolean().optional(),
  /** Hidden elements are not rendered in any output format. */
  hidden: z.boolean().optional(),
  /** Auto-layout (container children): space between children, cross-axis alignment, main-axis distribution. */
  gap: z.union([z.number().nonnegative(), tokenRefSchema]).optional(),
  /** Move row children to another line when their widths cannot fit together. */
  wrap: z.boolean().optional(),
  alignItems: z.enum(["start", "center", "end", "stretch"]).optional(),
  justifyContent: z.enum(["start", "center", "end", "space-between", "space-around"]).optional(),
  /** Flex weight among siblings in a row (default 1 for flexible children). */
  grow: z.number().nonnegative().optional(),
  /** How readily a row child gives up width when the row is crowded (0 keeps its width). */
  shrink: z.number().nonnegative().optional(),
  minWidth: dimensionSchema.optional(),
  maxWidth: dimensionSchema.optional(),
  minHeight: dimensionSchema.optional(),
  maxHeight: dimensionSchema.optional(),
  layout: z.enum(["flow", "row", "column", "grid", "stack", "absolute"]).optional(),
  x: dimensionSchema.optional(),
  y: dimensionSchema.optional(),
  width: dimensionSchema.optional(),
  height: dimensionSchema.optional(),
  style: styleSchema.optional(),
  /** Name of a text style in `theme.textStyles`, applied beneath this component's own style. */
  textStyle: z.string().optional(),
  styleWhen: styleWhenSchema.optional(),
  visibleWhen: z.string().optional(),
  /** Conditional property overrides, evaluated in order (see rules.ts). */
  rules: rulesSchema.optional(),
  pageBreakBefore: z.boolean().optional(),
  pageBreakAfter: z.boolean().optional(),
  keepTogether: z.boolean().optional(),
  /** Never place a page break between this component and the one immediately
   * after it (e.g. a heading and the paragraph/table that follows it). */
  keepWithNext: z.boolean().optional(),
  /** Whether this component may split across pages. Tables split at row
   * boundaries; auto-height flow text splits at measured line boundaries.
   * Other component types remain atomic. */
  allowSplit: z.boolean().optional(),
  /** Minimum text lines before and after a page break, respectively. */
  minLinesAtBottom: z.number().int().nonnegative().optional(),
  minLinesAtTop: z.number().int().nonnegative().optional(),
  /** PDF bookmark (outline entry) pointing here. `true` uses the element's own text. */
  bookmark: z.union([z.boolean(), z.string()]).optional(),
  /** Nesting depth in the outline, 1 = top level. */
  bookmarkLevel: z.number().int().min(1).max(4).optional(),
  exports: z.record(z.string(), z.unknown()).optional(),
});
export type ComponentBase = z.infer<typeof componentBaseSchema>;
