import { zodToJsonSchema } from "zod-to-json-schema";
import { reportDefinitionSchema } from "./report.js";

/** Publishes the Report Definition as a standard JSON Schema document (draft-07),
 * usable for IDE autocomplete, external SDK validation, and designer tooling. */
export function getReportJsonSchema(): Record<string, unknown> {
  return zodToJsonSchema(reportDefinitionSchema, {
    name: "ReportDefinition",
  }) as Record<string, unknown>;
}
