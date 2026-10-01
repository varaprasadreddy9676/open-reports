import { z } from "zod";

export const variableScopeSchema = z.enum(["row", "group", "page", "report"]);

export const variableDefinitionSchema = z.object({
  id: z.string().min(1),
  scope: variableScopeSchema,
  expression: z.string(),
  resetOn: z.string().optional(),
});
export type VariableDefinition = z.infer<typeof variableDefinitionSchema>;
