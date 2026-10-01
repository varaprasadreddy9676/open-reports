import { z } from "zod";

export const unitSchema = z.enum(["px", "pt", "mm", "cm", "in"]);
export type Unit = z.infer<typeof unitSchema>;

/** A dimension is either a bare number (px) or a string like "10mm" / "50%" / "*" (flex) / "auto". */
export const dimensionSchema = z.union([
  z.number(),
  z.string().regex(/^(-?\d+(\.\d+)?(px|pt|mm|cm|in|%)?|\*|auto)$/, "Invalid dimension"),
]);
export type Dimension = z.infer<typeof dimensionSchema>;

export const colorSchema = z.string().regex(
  /^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\(.*\)|[a-zA-Z]+)$/,
  "Invalid color"
);

export const borderSideSchema = z.object({
  width: z.number().nonnegative().default(1),
  style: z.enum(["solid", "dashed", "dotted", "none"]).default("solid"),
  color: colorSchema.default("#000000"),
});
export type BorderSide = z.infer<typeof borderSideSchema>;

export const borderSchema = z.union([
  borderSideSchema,
  z.object({
    top: borderSideSchema.optional(),
    right: borderSideSchema.optional(),
    bottom: borderSideSchema.optional(),
    left: borderSideSchema.optional(),
  }),
]);

export const spacingSchema = z.union([
  z.number(),
  z.object({
    top: z.number().default(0),
    right: z.number().default(0),
    bottom: z.number().default(0),
    left: z.number().default(0),
  }),
]);
export type Spacing = z.infer<typeof spacingSchema>;

export const styleSchema = z
  .object({
    fontFamily: z.string().optional(),
    fontSize: z.number().optional(),
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

export const styleWhenSchema = z.array(
  z.object({
    when: z.string(),
    style: styleSchema.partial(),
  })
);

/** Common properties every component may declare, regardless of type. */
export const componentBaseSchema = z.object({
  id: z.string().optional(),
  layout: z.enum(["flow", "row", "column", "grid", "stack", "absolute"]).optional(),
  x: dimensionSchema.optional(),
  y: dimensionSchema.optional(),
  width: dimensionSchema.optional(),
  height: dimensionSchema.optional(),
  style: styleSchema.optional(),
  styleWhen: styleWhenSchema.optional(),
  visibleWhen: z.string().optional(),
  pageBreakBefore: z.boolean().optional(),
  pageBreakAfter: z.boolean().optional(),
  keepTogether: z.boolean().optional(),
  /** Never place a page break between this component and the one immediately
   * after it (e.g. a heading and the paragraph/table that follows it). */
  keepWithNext: z.boolean().optional(),
  /** Whether this component is allowed to be split across a page boundary at
   * all. Only tables currently support splitting (row by row); every other
   * component type behaves as if this were false regardless of the value set
   * here, and the layout engine pushes it whole to a fresh page instead. */
  allowSplit: z.boolean().optional(),
  /** Orphan/widow control for anything the layout engine *can* split
   * (currently: table rows). Mirrors `minRowsBeforeBreak`/`minRowsAfterBreak`
   * on the table component itself, expressed as lines for text-shaped content. */
  minLinesAtBottom: z.number().int().nonnegative().optional(),
  minLinesAtTop: z.number().int().nonnegative().optional(),
  exports: z.record(z.string(), z.unknown()).optional(),
});
export type ComponentBase = z.infer<typeof componentBaseSchema>;
