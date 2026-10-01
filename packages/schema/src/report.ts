import { z } from "zod";
import { pageConfigSchema } from "./page.js";
import { themeSchema } from "./theme.js";
import { groupDefinitionSchema, sectionSchema } from "./sections.js";
import { componentSchema } from "./components.js";
import { datasetDefinitionSchema } from "./datasets.js";
import { parameterDefinitionSchema } from "./parameters.js";
import { variableDefinitionSchema } from "./variables.js";

export const SUPPORTED_SCHEMA_VERSIONS = ["1.0"] as const;

export const exportsConfigSchema = z.object({
  pdf: z.record(z.string(), z.unknown()).optional(),
  html: z.record(z.string(), z.unknown()).optional(),
  xlsx: z
    .object({
      sheetName: z.string().optional(),
    })
    .passthrough()
    .optional(),
  csv: z
    .object({
      target: z.string().optional(),
      delimiter: z.string().optional(),
      newline: z.enum(["\n", "\r\n"]).optional(),
      includeHeaders: z.boolean().optional(),
    })
    .optional(),
});
export type ExportsConfig = z.infer<typeof exportsConfigSchema>;

export const printProfileSchema = z.object({
  name: z.string().optional(),
  dpi: z.number().positive().optional(),
  printerType: z.enum(["document", "label", "receipt", "card", "wristband"]).optional(),
  language: z.enum(["pdf", "zpl", "escpos"]).optional(),
  /** Printable margin the printer cannot reach, in mm. */
  safeMargin: z.number().nonnegative().optional(),
});
export type PrintProfile = z.infer<typeof printProfileSchema>;

/** Diagonal text stamped on every page (e.g. DRAFT, CONFIDENTIAL, COPY). */
export const watermarkSchema = z.object({
  text: z.string().min(1),
  color: z.string().optional(),
  opacity: z.number().min(0).max(1).optional(),
  fontSize: z.number().positive().optional(),
  /** Degrees, counter-clockwise. Default 45. */
  angle: z.number().optional(),
  pages: z.enum(["all", "first"]).optional(),
});
export type Watermark = z.infer<typeof watermarkSchema>;

export const fragmentDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  children: z.array(componentSchema).default([]),
});

export const reportDefinitionSchema = z.object({
  schemaVersion: z.enum(SUPPORTED_SCHEMA_VERSIONS),
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  locale: z.string().optional(),
  parameters: z.array(parameterDefinitionSchema).default([]),
  datasets: z.array(datasetDefinitionSchema).default([]),
  variables: z.array(variableDefinitionSchema).default([]),
  page: pageConfigSchema.default({}),
  theme: themeSchema.optional(),
  /** Grouping levels (outermost first) referenced by groupHeader/groupFooter bands. */
  groups: z.array(groupDefinitionSchema).default([]),
  sections: z.array(sectionSchema).default([]),
  fragments: z.array(fragmentDefinitionSchema).default([]),
  print: printProfileSchema.optional(),
  watermark: watermarkSchema.optional(),
  exports: exportsConfigSchema.optional(),
});

export type ReportDefinition = z.infer<typeof reportDefinitionSchema>;
/** Convenience input type (pre-defaults) for authoring reports by hand or via SDK. */
export type ReportDefinitionInput = z.input<typeof reportDefinitionSchema>;
