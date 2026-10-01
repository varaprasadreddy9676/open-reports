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
  height: z.number().optional(),
  visibleWhen: z.string().optional(),
  children: z.array(componentSchema).default([]),
});
export type ReportSection = z.infer<typeof sectionSchema>;
