import type { DatasetDefinition } from "@reporting/schema";

export interface ExecutionContext {
  parameters: Record<string, unknown>;
  /** Abort/row/size limits enforced by the host; datasource implementations should respect these. */
  limits: {
    maxRows: number;
    timeoutMs: number;
  };
}

export type DataSetValue = unknown[] | Record<string, unknown> | null;

export interface DataSet {
  /** The raw rows (array) or single record (object) returned by the datasource. */
  value: DataSetValue;
}

/**
 * Implemented by each datasource plugin (@reporting/datasource-json,
 * -rest, -sql, and any third-party package). Core depends only on this
 * interface, never on a concrete datasource -- that is what lets new
 * datasource plugins be added without touching the pipeline.
 */
export interface DataSource {
  readonly id: string;
  execute(definition: DatasetDefinition, context: ExecutionContext): Promise<DataSet>;
}

export class DataSourceNotFoundError extends Error {
  constructor(public readonly source: string) {
    super(`No datasource registered for source type "${source}".`);
    this.name = "DataSourceNotFoundError";
  }
}

export class DataSourceRegistry {
  private sources = new Map<string, DataSource>();

  register(source: DataSource): void {
    this.sources.set(source.id, source);
  }

  get(id: string): DataSource {
    const source = this.sources.get(id);
    if (!source) {
      throw new DataSourceNotFoundError(id);
    }
    return source;
  }

  has(id: string): boolean {
    return this.sources.has(id);
  }
}
