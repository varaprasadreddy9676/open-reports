import type { DatasetDefinition } from "@reporting/schema";
import { DataSourceRegistry, type DataSet, type ExecutionContext } from "./datasource.js";

export interface DatasetExecutionIssue {
  severity: "error";
  code: string;
  path: string;
  message: string;
}

export interface DatasetExecutionResult {
  datasets: Record<string, unknown>;
  issues: DatasetExecutionIssue[];
  durations: Record<string, number>;
}

export interface DatasetExecutionOptions {
  maxRows?: number;
  timeoutMs?: number;
}

/** Runs every declared dataset against its registered datasource, in parallel,
 * and returns a flat `{ datasetId: value }` map that the resolver/expression
 * context consumes. A dataset that fails produces an issue but does not abort
 * the others -- the report still renders with that dataset empty, and the
 * failure surfaces in validation/debug output rather than as a crash. */
export async function executeDatasets(
  datasets: DatasetDefinition[],
  registry: DataSourceRegistry,
  parameters: Record<string, unknown>,
  options: DatasetExecutionOptions = {}
): Promise<DatasetExecutionResult> {
  const issues: DatasetExecutionIssue[] = [];
  const durations: Record<string, number> = {};
  const context: ExecutionContext = {
    parameters,
    limits: {
      maxRows: options.maxRows ?? 1_000_000,
      timeoutMs: options.timeoutMs ?? 30_000,
    },
  };

  const entries = await Promise.all(
    datasets.map(async (def): Promise<[string, unknown]> => {
      const start = Date.now();
      try {
        const source = registry.get(def.source);
        const result: DataSet = await withTimeout(source.execute(def, context), context.limits.timeoutMs, def.id);
        durations[def.id] = Date.now() - start;
        return [def.id, truncate(result.value, context.limits.maxRows)];
      } catch (err) {
        durations[def.id] = Date.now() - start;
        issues.push({
          severity: "error",
          code: "DATASET_EXECUTION_FAILED",
          path: `datasets.${def.id}`,
          message: err instanceof Error ? err.message : String(err),
        });
        return [def.id, null];
      }
    })
  );

  return { datasets: Object.fromEntries(entries), issues, durations };
}

function truncate(value: unknown, maxRows: number): unknown {
  if (Array.isArray(value) && value.length > maxRows) {
    return value.slice(0, maxRows);
  }
  return value;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, datasetId: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Dataset "${datasetId}" timed out after ${timeoutMs}ms.`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
