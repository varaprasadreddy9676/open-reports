import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import mysql from "mysql2/promise";
import { SqlDataSource } from "../src/index.js";
import { SqlConnectionRegistry } from "../src/connections.js";
import { resolveSqlParams } from "../src/params.js";

const PG_CONFIG = { driver: "postgres" as const, host: "localhost", port: 5432, database: "reporting_test", user: "postgres", password: "postgres" };
const MYSQL_CONFIG = { driver: "mysql" as const, host: "127.0.0.1", port: 3306, database: "reporting_test", user: "reporting", password: "reporting" };

const limits = { maxRows: 1000, timeoutMs: 10000 };

let pgClient: pg.Client;
let mysqlConn: mysql.Connection;
let registry: SqlConnectionRegistry;
let ds: SqlDataSource;

beforeAll(async () => {
  pgClient = new pg.Client(PG_CONFIG);
  await pgClient.connect();
  await pgClient.query("DROP TABLE IF EXISTS sql_ds_items");
  await pgClient.query("CREATE TABLE sql_ds_items (id INT, name TEXT, amount NUMERIC)");
  await pgClient.query("INSERT INTO sql_ds_items VALUES (1, 'Widget', 100), (2, 'Gadget', 200), (3, 'Gizmo', 300)");

  mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
  await mysqlConn.query("DROP TABLE IF EXISTS sql_ds_items");
  await mysqlConn.query("CREATE TABLE sql_ds_items (id INT, name VARCHAR(255), amount DECIMAL(10,2))");
  await mysqlConn.query("INSERT INTO sql_ds_items VALUES (1, 'Widget', 100), (2, 'Gadget', 200), (3, 'Gizmo', 300)");

  registry = new SqlConnectionRegistry();
  registry.register("pg-main", PG_CONFIG);
  registry.register("mysql-main", MYSQL_CONFIG);
  ds = new SqlDataSource(registry);
});

afterAll(async () => {
  await pgClient.query("DROP TABLE IF EXISTS sql_ds_items");
  await pgClient.end();
  await mysqlConn.query("DROP TABLE IF EXISTS sql_ds_items");
  await mysqlConn.end();
  await ds.close();
});

describe("SqlDataSource: PostgreSQL", () => {
  it("runs a parameterized query against a real Postgres database", async () => {
    const result = await ds.execute(
      { id: "x", source: "sql", query: { connectionId: "pg-main", sql: "SELECT * FROM sql_ds_items WHERE id > $1 ORDER BY id", params: [1] } },
      { parameters: {}, limits }
    );
    expect(result.value).toEqual([
      { id: 2, name: "Gadget", amount: "200" },
      { id: 3, name: "Gizmo", amount: "300" },
    ]);
  });

  it("binds a report parameter into the query via resolveSqlParams, never via string concatenation", async () => {
    const result = await ds.execute(
      {
        id: "x",
        source: "sql",
        query: { connectionId: "pg-main", sql: "SELECT * FROM sql_ds_items WHERE name = $1", params: ["{{params.name}}"] },
      },
      { parameters: { name: "Widget" }, limits }
    );
    expect(result.value).toEqual([{ id: 1, name: "Widget", amount: "100" }]);
  });

  it("is immune to SQL injection through a parameter value", async () => {
    const malicious = "Widget'; DROP TABLE sql_ds_items; --";
    const result = await ds.execute(
      { id: "x", source: "sql", query: { connectionId: "pg-main", sql: "SELECT * FROM sql_ds_items WHERE name = $1", params: [malicious] } },
      { parameters: {}, limits }
    );
    expect(result.value).toEqual([]); // no row matches that literal string -- nothing executed as SQL

    // The table must still exist and have all 3 rows.
    const check = await pgClient.query("SELECT count(*)::int AS n FROM sql_ds_items");
    expect(check.rows[0].n).toBe(3);
  });

  it("enforces maxRows client-side", async () => {
    const result = await ds.execute(
      { id: "x", source: "sql", query: { connectionId: "pg-main", sql: "SELECT * FROM sql_ds_items ORDER BY id" } },
      { parameters: {}, limits: { maxRows: 1, timeoutMs: 10000 } }
    );
    expect((result.value as unknown[]).length).toBe(1);
  });

  it("times out a slow query", async () => {
    await expect(
      ds.execute(
        { id: "x", source: "sql", query: { connectionId: "pg-main", sql: "SELECT pg_sleep(2)", timeoutMs: 200 } },
        { parameters: {}, limits }
      )
    ).rejects.toThrow(/timed out/);
  });

  it("throws a clear error for an unregistered connection", async () => {
    await expect(
      ds.execute({ id: "x", source: "sql", query: { connectionId: "does-not-exist", sql: "SELECT 1" } }, { parameters: {}, limits })
    ).rejects.toThrow(/No SQL connection registered/);
  });
});

describe("SqlDataSource: MySQL", () => {
  it("runs a parameterized query against a real MySQL/MariaDB database", async () => {
    const result = await ds.execute(
      { id: "x", source: "sql", query: { connectionId: "mysql-main", sql: "SELECT * FROM sql_ds_items WHERE id > ? ORDER BY id", params: [1] } },
      { parameters: {}, limits }
    );
    expect(result.value).toMatchObject([
      { id: 2, name: "Gadget" },
      { id: 3, name: "Gizmo" },
    ]);
  });

  it("is immune to SQL injection through a parameter value", async () => {
    const malicious = "Widget'; DROP TABLE sql_ds_items; --";
    await ds.execute(
      { id: "x", source: "sql", query: { connectionId: "mysql-main", sql: "SELECT * FROM sql_ds_items WHERE name = ?", params: [malicious] } },
      { parameters: {}, limits }
    );
    const [rows] = await mysqlConn.query("SELECT COUNT(*) AS n FROM sql_ds_items");
    expect((rows as any)[0].n).toBe(3);
  });
});

describe("resolveSqlParams", () => {
  it("substitutes a whole-string placeholder with the typed parameter value", () => {
    expect(resolveSqlParams(["{{params.id}}"], { id: 42 })).toEqual([42]);
  });

  it("leaves literal values and non-matching strings untouched", () => {
    expect(resolveSqlParams(["literal", 5, true, null], {})).toEqual(["literal", 5, true, null]);
  });

  it("does not substitute inside a larger string (only a whole-string placeholder)", () => {
    expect(resolveSqlParams(["prefix {{params.id}} suffix"], { id: 42 })).toEqual(["prefix {{params.id}} suffix"]);
  });
});
