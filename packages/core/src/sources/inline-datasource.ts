import type { DatasetDefinition } from "@reporting/schema";
import type { DataSet, DataSource, ExecutionContext } from "../datasource.js";

/** Built into core (no I/O, no plugin needed): resolves a dataset whose query
 * embeds its data directly in the report definition, e.g. `{ "source": "inline", "query": { "data": [...] } }`. */
export class InlineDataSource implements DataSource {
  readonly id = "inline";

  async execute(definition: DatasetDefinition, _context: ExecutionContext): Promise<DataSet> {
    const query = (definition.query ?? {}) as { data?: unknown; path?: string };
    let value: unknown = query.data ?? null;
    if (query.path) {
      value = getPath(value, query.path);
    }
    return { value: value as DataSet["value"] };
  }
}

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}
