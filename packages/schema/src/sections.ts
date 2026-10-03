import { z } from "zod";
import { componentSchema } from "./components.js";
import { styleSchema } from "./common.js";

/**
 * Report structure is made of **bands** (a.k.a. sections). The engine, not just the designer, understands them:
 *
 *  - reportHeader / reportFooter  once, at the very beginning / end
 *  - pageHeader / pageFooter      on every applicable page (see `appliesTo`: page masters)
 *  - background                   behind the content of every applicable page (overlay / watermark layer)
 *  - dataHeader / dataFooter      once before / after the records of a data region
 *  - groupHeader / groupFooter    at the start / end of every group (`groupId` -> `report.groups`)
 *  - detail                       once per record (several detail bands print together, per record)
 *  - child                        printed directly after the band named by `parent`
 *  - noData                       printed instead of the region when the dataset is empty
 *  - columnHeader / columnFooter  reserved for multi-column reports
 */
export const sectionTypeSchema = z.enum([
  "reportHeader",
  "pageHeader",
  "dataHeader",
  "groupHeader",
  "detail",
  "child",
  "groupFooter",
  "dataFooter",
  "noData",
  "pageFooter",
  "reportFooter",
  "background",
  "columnHeader",
  "columnFooter",
]);
export type SectionType = z.infer<typeof sectionTypeSchema>;

export const PAGE_BAND_TYPES = ["pageHeader", "pageFooter", "background"] as const;
export const DATA_BAND_TYPES = ["dataHeader", "groupHeader", "detail", "child", "groupFooter", "dataFooter", "noData"] as const;

/** A grouping level of the report, referenced by groupHeader/groupFooter bands through `groupId`. Order in `report.groups` = nesting order (first = outermost). */
export const groupDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  /** Dataset the group partitions. Defaults to the dataset of the region's detail band. */
  dataset: z.string().optional(),
  /** Expression evaluated per record; records with the same value form one group instance. */
  by: z.string().min(1),
  sort: z.enum(["asc", "desc", "none"]).optional().default("asc"),
  /** Print the group header again on every page the group continues onto. */
  repeatHeader: z.boolean().optional().default(false),
  /** Start each group instance on a new page / leave the page after it. */
  newPage: z.enum(["none", "before", "after"]).optional().default("none"),
  /** Try to keep a whole group instance on one page (when it fits on a fresh page). */
  keepTogether: z.boolean().optional().default(false),
  /** Never leave a group header alone at the bottom of a page: keep it with this many following detail records. */
  minDetailRows: z.number().int().nonnegative().optional().default(1),
});
export type GroupDefinition = z.infer<typeof groupDefinitionSchema>;

export const sectionSchema = z.object({
  id: z.string().optional(),
  /** Friendly name shown in the designer. */
  name: z.string().optional(),
  type: sectionTypeSchema,
  dataset: z.string().optional(),
  /** groupHeader/groupFooter: which `report.groups` entry this band belongs to. */
  groupId: z.string().optional(),
  /** Legacy shorthand: a groupHeader with `groupBy` declares an implicit group. Prefer `report.groups`. */
  groupBy: z.string().optional(),
  /** child bands: id of the band this one follows. */
  parent: z.string().optional(),
  repeat: z.boolean().optional(),

  /** pageHeader/pageFooter/background: which pages this band applies to (page masters). */
  appliesTo: z.enum(["all", "first", "last", "odd", "even", "standard"]).optional(),

  // --- size and layout of the band itself
  /** Fixed height in points; omitted = grows with its content. */
  height: z.number().nonnegative().optional(),
  minHeight: z.number().nonnegative().optional(),
  layout: z.enum(["flow", "row", "grid", "absolute"]).optional(),
  gap: z.number().nonnegative().optional(),
  wrap: z.boolean().optional(),
  alignItems: z.enum(["start", "center", "end", "stretch"]).optional(),
  justifyContent: z.enum(["start", "center", "end", "space-between", "space-around"]).optional(),
  columns: z.number().int().positive().optional(),
  style: styleSchema.optional(),

  // --- visibility
  /** Omit this band from rendered output; the designer keeps it in the structure for editing. */
  hidden: z.boolean().optional(),
  visibleWhen: z.string().optional(),
  /** Drop the band when everything in it resolved to nothing. */
  suppressWhenBlank: z.boolean().optional(),

  // --- printing and pagination
  /** groupHeader: repeat on continuation pages (overrides the group's setting when set). */
  repeatEveryPage: z.boolean().optional(),
  newPageBefore: z.boolean().optional(),
  newPageAfter: z.boolean().optional(),
  keepTogether: z.boolean().optional(),
  /** May this band break across pages between its children? Default: yes for one-off bands (report header/footer, static detail), no for per-record bands. A band taller than a page always splits. */
  allowSplit: z.boolean().optional(),
  keepWithNext: z.boolean().optional(),
  keepWithPrevious: z.boolean().optional(),
  /** Print at the bottom of the last page's remaining space (e.g. totals, signatures). */
  printAtBottom: z.boolean().optional(),
  /** Designer-only: collapsed in the structure view. */
  collapsed: z.boolean().optional(),
  /** Designer-only: protect this band's layout from move, resize, and removal. */
  locked: z.boolean().optional(),

  children: z.array(componentSchema).default([]),
});
export type ReportSection = z.infer<typeof sectionSchema>;
