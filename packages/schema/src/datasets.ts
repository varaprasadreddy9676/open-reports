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

/** Authoring metadata. It does not change the data returned by a source. */
export const datasetFieldSchema = z.object({
  path: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/, "Use dot-separated field names (for example patient.name)."),
  kind: z.enum(["string", "number", "boolean", "date", "object", "array"]),
});

export const datasetShapeSchema = z.object({
  kind: z.enum(["object", "array"]),
  fields: z.array(datasetFieldSchema).default([]),
  /** What a render does when the full response does not match: warn (default) or fail with an error. */
  onMismatch: z.enum(["warn", "error"]).optional(),
}).superRefine((shape, ctx) => {
  const seen = new Set<string>();
  for (const [index, field] of shape.fields.entries()) {
    if (seen.has(field.path)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fields", index, "path"], message: `Field ${field.path} is declared twice.` });
    seen.add(field.path);
  }
  for (const [index, field] of shape.fields.entries()) {
    const parts = field.path.split(".");
    for (let length = 1; length < parts.length; length++) {
      const ancestor = shape.fields.find((other) => other.path === parts.slice(0, length).join("."));
      if (ancestor && ancestor.kind !== "object" && ancestor.kind !== "array") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fields", index, "path"], message: `Nested field ${field.path} needs ${ancestor.path} to be an object or array.` });
      }
    }
  }
});
export type DatasetShape = z.infer<typeof datasetShapeSchema>;

export const datasetDefinitionSchema = z.object({
  id: z.string().min(1),
  source: z.union([z.enum(["inline", "json", "rest", "sql"]), z.string().regex(/^plugin:[A-Za-z0-9._-]+$/, 'Plugin datasources are written "plugin:<name>".')]),
  query: z.unknown().optional(),
  transform: z.string().optional(),
  schema: datasetShapeSchema.optional(),
});
export type DatasetDefinition = z.infer<typeof datasetDefinitionSchema>;
