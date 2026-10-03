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

export const printCalibrationSchema = z.object({
  /** Multiply horizontal/vertical ZPL element geometry after measuring a raw test print. */
  scaleX: z.number().min(0.9).max(1.1).default(1),
  scaleY: z.number().min(0.9).max(1.1).default(1),
  /** Shift ZPL content on the media, in millimetres. */
  offsetXmm: z.number().min(-25).max(25).default(0),
  offsetYmm: z.number().min(-25).max(25).default(0),
});
export type PrintCalibration = z.infer<typeof printCalibrationSchema>;

export const printProfileSchema = z.object({
  name: z.string().optional(),
  dpi: z.number().positive().optional(),
  printerType: z.enum(["document", "label", "receipt", "card", "wristband"]).optional(),
  language: z.enum(["pdf", "zpl", "escpos"]).optional(),
  /** Printable margin the printer cannot reach, in mm. */
  safeMargin: z.number().nonnegative().optional(),
  calibration: printCalibrationSchema.optional(),
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

/** A persistent alignment guide drawn on the design surface (page coordinates, points). */
export const guideSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  axis: z.enum(["x", "y"]),
  /** Distance from the page's left (x) or top (y) edge, in points. */
  pos: z.number(),
  locked: z.boolean().optional(),
});
export type Guide = z.infer<typeof guideSchema>;

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
  guides: z.array(guideSchema).default([]),
  exports: exportsConfigSchema.optional(),
});

export type ReportDefinition = z.infer<typeof reportDefinitionSchema>;
/** Convenience input type (pre-defaults) for authoring reports by hand or via SDK. */
export type ReportDefinitionInput = z.input<typeof reportDefinitionSchema>;
