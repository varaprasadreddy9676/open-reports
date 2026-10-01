import { z } from "zod";

export const jsonDataSourceQuerySchema = z.object({
  data: z.unknown().optional(),
  path: z.string().optional(),
});

export const restDataSourceQuerySchema = z.object({
  url: z.string(),
  method: z.enum(["GET", "POST"]).default("GET"),
  headers: z.record(z.string(), z.string()).optional(),
  query: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  resultPath: z.string().optional(),
  timeoutMs: z.number().int().positive().max(120_000).optional(),
});

export const sqlDataSourceQuerySchema = z.object({
  connectionId: z.string(),
  sql: z.string(),
  params: z.array(z.unknown()).optional(),
  timeoutMs: z.number().int().positive().max(120_000).optional(),
  maxRows: z.number().int().positive().optional(),
});

export const datasetDefinitionSchema = z.object({
  id: z.string().min(1),
  source: z.enum(["inline", "json", "rest", "sql"]),
  query: z.unknown().optional(),
  transform: z.string().optional(),
});
export type DatasetDefinition = z.infer<typeof datasetDefinitionSchema>;
