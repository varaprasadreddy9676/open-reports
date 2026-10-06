import { z } from "zod";
import { unitSchema } from "./common.js";

export const pageSizeSchema = z.enum(["A4", "A3", "A5", "A6", "Letter", "Legal", "custom"]);

export const marginSchema = z.object({
  top: z.number().default(20),
  right: z.number().default(15),
  bottom: z.number().default(20),
  left: z.number().default(15),
});

export const pageConfigSchema = z.object({
  size: pageSizeSchema.default("A4"),
  width: z.number().optional(),
  height: z.number().optional(),
  unit: unitSchema.default("mm"),
  orientation: z.enum(["portrait", "landscape"]).default("portrait"),
  margin: marginSchema.default({ top: 20, right: 15, bottom: 20, left: 15 }),
  /**
   * Roll media (receipts, tickets, wristbands, tags): the page is exactly as long as its content, between
   * `minLength` and `maxLength` (in `unit`). Content beyond `maxLength` continues on further segments of that length.
   */
  continuous: z.object({ minLength: z.number().positive().optional(), maxLength: z.number().positive().optional() }).strict().optional(),
});
export type PageConfig = z.infer<typeof pageConfigSchema>;
