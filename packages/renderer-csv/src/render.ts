import type { RenderInput, RenderResult, RendererCapabilities, ReportRenderer } from "@reporting/core";
import type { ResolvedTableComponent } from "@reporting/core";
import { encodeCsvRow } from "./csv-encode.js";
import { findCsvTable } from "./find-table.js";

export const csvRendererCapabilities: RendererCapabilities = {
  id: "csv",
  mimeType: "text/csv",
  extension: "csv",
  supports: ["table"],
};

export interface CsvRenderOptions {
  delimiter?: string;
  newline?: "\n" | "\r\n";
  includeHeaders?: boolean;
}

/** Yields CSV lines one at a time so a caller that wants true streaming
 * (e.g. the HTTP server piping directly to the response) can consume this
 * without ever holding the full file in memory -- `CsvRenderer.render`
 * below just joins it into a string for the simpler, buffered
 * ReportRenderer contract. */
export function* streamCsvRows(table: ResolvedTableComponent, options: CsvRenderOptions = {}): Generator<string> {
  const delimiter = options.delimiter ?? ",";
  const newline = options.newline ?? "\n";
  const includeHeaders = options.includeHeaders ?? true;

  if (includeHeaders) {
    yield encodeCsvRow(table.columns.map((c) => c.header), delimiter) + newline;
  }
  for (const row of table.rows) {
    yield encodeCsvRow(table.columns.map((c) => row.raw[c.id]), delimiter) + newline;
  }
}

export class CsvRenderer implements ReportRenderer {
  readonly capabilities = csvRendererCapabilities;

  async render(input: RenderInput): Promise<RenderResult> {
    const csvConfig = input.resolved.exports?.csv;
    const table = findCsvTable(input.resolved, csvConfig?.target);

    const lines: string[] = [];
    for (const line of streamCsvRows(table, {
      delimiter: csvConfig?.delimiter,
      newline: csvConfig?.newline as "\n" | "\r\n" | undefined,
      includeHeaders: csvConfig?.includeHeaders,
    })) {
      lines.push(line);
    }

    return {
      content: lines.join(""),
      mimeType: this.capabilities.mimeType,
      extension: this.capabilities.extension,
      warnings: input.resolved.warnings,
    };
  }
}
