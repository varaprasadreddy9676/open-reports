import { z } from "zod";

export const parameterTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "date",
  "datetime",
  "array",
  "object",
  "enum",
]);
export type ParameterType = z.infer<typeof parameterTypeSchema>;

export const parameterDefinitionSchema = z.object({
  id: z.string().min(1),
  type: parameterTypeSchema,
  label: z.string().optional(),
  required: z.boolean().optional().default(false),
  default: z.unknown().optional(),
  enumValues: z.array(z.union([z.string(), z.number()])).optional(),
});
export type ParameterDefinition = z.infer<typeof parameterDefinitionSchema>;
