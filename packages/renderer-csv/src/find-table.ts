import type { ResolvedReport, ResolvedTableComponent } from "@reporting/core";
import { findComponentsByType } from "@reporting/core";

export class NoTableFoundError extends Error {
  constructor(target?: string) {
    super(target ? `No table component with id/dataset "${target}" was found for CSV export.` : "This report has no table component to export as CSV.");
    this.name = "NoTableFoundError";
  }
}

export class AmbiguousCsvTargetError extends Error {
  constructor() {
    super(
      'This report has more than one table and no CSV export target was specified. Set `exports.csv.target` to the id (or dataset id) of the table to export.'
    );
    this.name = "AmbiguousCsvTargetError";
  }
}

/** Picks the table to export, per spec section 29: "If a report has
 * multiple tabular datasets, require the caller/report definition to
 * identify the CSV target." `target` may name a table's own `id` or the
 * dataset id it was bound to. */
export function findCsvTable(report: ResolvedReport, target?: string): ResolvedTableComponent {
  const tables = findComponentsByType(report, "table");

  if (target) {
    const match = tables.find((t) => t.id === target || (t as any).dataset === target);
    if (!match) throw new NoTableFoundError(target);
    return match;
  }

  if (tables.length === 0) throw new NoTableFoundError();
  if (tables.length > 1) throw new AmbiguousCsvTargetError();
  return tables[0]!;
}
