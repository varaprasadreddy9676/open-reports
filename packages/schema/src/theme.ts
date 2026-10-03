import { z } from "zod";
import { styleSchema } from "./common.js";

/**
 * Report theme. Tokens are referenced from styles as "$name": colours, font families, font sizes and spacing.
 * Text styles are named partial styles that components apply with `textStyle`; they may use tokens too.
 */
export const themeSchema = z.object({
  fonts: z.record(z.string(), z.string()).optional(),
  fontSizes: z.record(z.string(), z.number().positive()).optional(),
  colors: z.record(z.string(), z.string()).optional(),
  spacing: z.record(z.string(), z.number().nonnegative()).optional(),
  textStyles: z.record(z.string(), styleSchema.partial()).optional(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  currency: z.string().optional(),
});
export type Theme = z.infer<typeof themeSchema>;
