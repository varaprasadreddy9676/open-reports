import { z } from "zod";

export const themeSchema = z.object({
  fonts: z.record(z.string(), z.string()).optional(),
  fontSizes: z.record(z.string(), z.number()).optional(),
  colors: z.record(z.string(), z.string()).optional(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  currency: z.string().optional(),
});
export type Theme = z.infer<typeof themeSchema>;
