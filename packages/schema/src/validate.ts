import { z } from "zod";
import { reportDefinitionSchema, type ReportDefinition } from "./report.js";
import { migrateToLatest } from "./migrate.js";

export type SchemaValidationIssue = {
  severity: "error";
  code: string;
  path: string;
  message: string;
};

export type SchemaValidationResult =
  | { valid: true; report: ReportDefinition; issues: [] }
  | { valid: false; report: undefined; issues: SchemaValidationIssue[] };

/** Validates and migrates a raw report document against the published JSON Schema. */
export function parseReportDefinition(input: unknown): SchemaValidationResult {
  if (typeof input !== "object" || input === null) {
    return {
      valid: false,
      report: undefined,
      issues: [{ severity: "error", code: "INVALID_DOCUMENT", path: "", message: "Report must be a JSON object." }],
    };
  }

  let migrated: Record<string, unknown>;
  try {
    migrated = migrateToLatest(input as Record<string, unknown>);
  } catch (err) {
    return {
      valid: false,
      report: undefined,
      issues: [
        {
          severity: "error",
          code: "UNSUPPORTED_SCHEMA_VERSION",
          path: "schemaVersion",
          message: err instanceof Error ? err.message : String(err),
        },
      ],
    };
  }

  const result = reportDefinitionSchema.safeParse(migrated);
  if (result.success) {
    return { valid: true, report: result.data, issues: [] };
  }

  return {
    valid: false,
    report: undefined,
    issues: zodErrorToIssues(result.error),
  };
}

function zodErrorToIssues(error: z.ZodError): SchemaValidationIssue[] {
  return error.issues.map((issue) => ({
    severity: "error",
    code: `SCHEMA_${issue.code.toUpperCase()}`,
    path: issue.path.join("."),
    message: issue.message,
  }));
}
