import { z } from "zod";
import { componentSchema } from "./components.js";

export const sectionTypeSchema = z.enum([
  "reportHeader",
  "pageHeader",
  "groupHeader",
  "detail",
  "groupFooter",
  "pageFooter",
  "reportFooter",
]);
export type SectionType = z.infer<typeof sectionTypeSchema>;

export const sectionSchema = z.object({
  id: z.string().optional(),
  type: sectionTypeSchema,
  dataset: z.string().optional(),
  groupBy: z.string().optional(),
  repeat: z.boolean().optional(),
  /** For pageHeader/pageFooter: which pages this particular section instance
   * applies to, so a report can declare e.g. a large pageHeader with
   * repeatOn "first-page" and a smaller one with repeatOn "except-first" --
   * the layout engine picks whichever section matches the page it's on. */
  repeatOn: z.enum(["every-page", "except-first", "first-page"]).optional().default("every-page"),
  /** For reportFooter-like content that should only appear on the last page
   * (terms and conditions, signature blocks). */
  showOn: z.enum(["every-page", "last-page", "first-page"]).optional(),
  height: z.number().optional(),
  visibleWhen: z.string().optional(),
  children: z.array(componentSchema).default([]),
});
export type ReportSection = z.infer<typeof sectionSchema>;
