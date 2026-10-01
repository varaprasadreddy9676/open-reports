import pg from "pg";
import mysql from "mysql2/promise";
import type { DatasetDefinition } from "@reporting/schema";
import type { DataSet, DataSource, ExecutionContext } from "@reporting/core";
import { SqlConnectionRegistry, type SqlConnectionConfig } from "./connections.js";
import { resolveSqlParams } from "./params.js";

export { SqlConnectionRegistry, parseConnectionUrl, connectionsFromEnv, type SqlConnectionConfig } from "./connections.js";

interface SqlQuery {
  connectionId: string;
  sql: string;
  params?: unknown[];
  timeoutMs?: number;
  maxRows?: number;
}

/**
 * Executes a dataset's SQL against PostgreSQL or MySQL. Queries are always
 * parameterized through the driver's native mechanism (`$1,$2,...` for
 * Postgres, `?` for MySQL) -- `resolveSqlParams` only ever substitutes
 * *parameter values*, never SQL text, so string-concatenation-style
 * injection is not possible through this path regardless of what a
 * parameter value contains.
 */
export class SqlDataSource implements DataSource {
  readonly id = "sql";
  private pgPools = new Map<string, pg.Pool>();
  private mysqlPools = new Map<string, mysql.Pool>();

  constructor(private registry: SqlConnectionRegistry) {}

  async execute(definition: DatasetDefinition, context: ExecutionContext): Promise<DataSet> {
    const query = definition.query as SqlQuery;
    const connection = this.registry.get(query.connectionId);
    const params = resolveSqlParams(query.params, context.parameters);
    const timeoutMs = Math.min(query.timeoutMs ?? context.limits.timeoutMs, context.limits.timeoutMs);
    const maxRows = query.maxRows ?? context.limits.maxRows;

    const rows = await withTimeout(
      connection.driver === "postgres" ? this.runPostgres(connection, query.sql, params) : this.runMysql(connection, query.sql, params),
      timeoutMs,
      query.connectionId
    );

    return { value: rows.slice(0, maxRows) as DataSet["value"] };
  }

  private async runPostgres(connection: SqlConnectionConfig, sql: string, params: unknown[]): Promise<Record<string, unknown>[]> {
    const pool = this.getPgPool(connection);
    const result = await pool.query(sql, params);
    return result.rows;
  }

  private async runMysql(connection: SqlConnectionConfig, sql: string, params: unknown[]): Promise<Record<string, unknown>[]> {
    const pool = this.getMysqlPool(connection);
    const [rows] = await pool.query(sql, params);
    return rows as Record<string, unknown>[];
  }

  private getPgPool(connection: SqlConnectionConfig): pg.Pool {
    const key = poolKey(connection);
    let pool = this.pgPools.get(key);
    if (!pool) {
      pool = new pg.Pool({
        host: connection.host,
        port: connection.port ?? 5432,
        database: connection.database,
        user: connection.user,
        password: connection.password,
        ssl: connection.ssl ?? false,
        max: 5,
      });
      this.pgPools.set(key, pool);
    }
    return pool;
  }

  private getMysqlPool(connection: SqlConnectionConfig): mysql.Pool {
    const key = poolKey(connection);
    let pool = this.mysqlPools.get(key);
    if (!pool) {
      pool = mysql.createPool({
        host: connection.host,
        port: connection.port ?? 3306,
        database: connection.database,
        user: connection.user,
        password: connection.password,
        ssl: connection.ssl ? {} : undefined,
        connectionLimit: 5,
      });
      this.mysqlPools.set(key, pool);
    }
    return pool;
  }

  /** Closes all pooled connections -- call on graceful shutdown. */
  async close(): Promise<void> {
    await Promise.all([...this.pgPools.values()].map((p) => p.end()));
    await Promise.all([...this.mysqlPools.values()].map((p) => p.end()));
  }
}

function poolKey(connection: SqlConnectionConfig): string {
  return `${connection.driver}:${connection.host}:${connection.port}:${connection.database}:${connection.user}`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, connectionId: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`SQL query on connection "${connectionId}" timed out after ${timeoutMs}ms.`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
