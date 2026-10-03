import { checkDatasetShape, shapeIssueMessage, type ShapeCheck, type ShapeIssue } from "@reporting/core";
import type { DatasetShape } from "@reporting/schema";

export type SchemaPreviewIssue = ShapeIssue;
export type SchemaPreviewCheck = ShapeCheck;

/** The same full check the render pipeline applies, so the designer and the rendered report always agree. */
export function checkSchemaPreview(shape: DatasetShape, value: unknown): SchemaPreviewCheck {
  return checkDatasetShape(shape, value);
}

export const schemaIssueMessage = (issue: SchemaPreviewIssue): string => shapeIssueMessage(issue);
