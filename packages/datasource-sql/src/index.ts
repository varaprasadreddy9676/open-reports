import pg from "pg";
import Cursor from "pg-cursor";
import mysql from "mysql2/promise";
import type { Connection as MysqlCoreConnection } from "mysql2";
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
 *
 * Report definitions are edited by designers, API callers and AI tools, so
 * every query also runs read-only (a fresh read-only transaction each time,
 * which an earlier dataset cannot switch off), as a single statement, with a
 * server-side time limit, and stops reading at `maxRows` instead of loading
 * the whole result.
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
      connection.driver === "postgres"
        ? this.runPostgres(connection, query.sql, params, maxRows, timeoutMs)
        : this.runMysql(connection, query.sql, params, maxRows, timeoutMs),
      timeoutMs,
      query.connectionId
    );

    return { value: rows as DataSet["value"] };
  }

  /** A cursor uses the extended query protocol, which accepts exactly one statement, and fetches only `maxRows`. */
  private async runPostgres(connection: SqlConnectionConfig, sql: string, params: unknown[], maxRows: number, timeoutMs: number): Promise<Record<string, unknown>[]> {
    const client = await this.getPgPool(connection).connect();
    let broken = false;
    try {
      await client.query("BEGIN READ ONLY");
      await client.query(`SET LOCAL statement_timeout = ${Math.max(1, Math.floor(timeoutMs))}`);
      const cursor = client.query(new Cursor<Record<string, unknown>>(sql, params));
      try {
        return await cursor.read(maxRows);
      } finally {
        await cursor.close().catch(() => undefined);
      }
    } finally {
      await client.query("ROLLBACK").catch(() => { broken = true; });
      client.release(broken);
    }
  }

  /** MySQL commits implicitly before DDL, so read-only is set for the session as well as the transaction, on every query. */
  private async runMysql(connection: SqlConnectionConfig, sql: string, params: unknown[], maxRows: number, timeoutMs: number): Promise<Record<string, unknown>[]> {
    const pool = this.getMysqlPool(connection);
    const conn = await pool.getConnection();
    let reusable = false;
    try {
      await conn.query("SET SESSION TRANSACTION READ ONLY");
      await conn.query("SET SESSION max_execution_time = ?", [Math.max(1, Math.floor(timeoutMs))]);
      await conn.query("START TRANSACTION READ ONLY");
      const { rows, complete } = await streamMysqlRows(conn.connection as unknown as MysqlCoreConnection, sql, params, maxRows);
      if (complete) {
        await conn.query("ROLLBACK");
        reusable = true;
      } else {
        // Closing the socket does not stop the server, which would keep running the query (and holding
        // its table locks) until max_execution_time; a user may always kill their own thread's query.
        await pool.query("KILL QUERY ?", [conn.threadId]).catch(() => undefined);
      }
      return rows;
    } finally {
      // A connection abandoned mid-result is still receiving rows, so it cannot go back to the pool.
      if (reusable) conn.release();
      else conn.destroy();
    }
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
        options: "-c default_transaction_read_only=on",
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

function streamMysqlRows(connection: MysqlCoreConnection, sql: string, params: unknown[], maxRows: number): Promise<{ rows: Record<string, unknown>[]; complete: boolean }> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, unknown>[] = [];
    let settled = false;
    const query = connection.query(sql, params);
    query.on("error", (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
    query.on("result", (row: Record<string, unknown>) => {
      if (settled) return;
      rows.push(row);
      if (rows.length >= maxRows) {
        settled = true;
        connection.pause();
        resolve({ rows, complete: false });
      }
    });
    query.on("end", () => {
      if (settled) return;
      settled = true;
      resolve({ rows, complete: true });
    });
  });
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
