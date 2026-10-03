import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import mysql from "mysql2/promise";
import { SqlDataSource } from "../src/index.js";
import { SqlConnectionRegistry } from "../src/connections.js";

const PG_CONFIG = { driver: "postgres" as const, host: "localhost", port: 5432, database: "reporting_test", user: "postgres", password: "postgres" };
const MYSQL_CONFIG = { driver: "mysql" as const, host: "127.0.0.1", port: 3306, database: "reporting_test", user: "reporting", password: "reporting" };
const BIG_ROWS = 1_000_000;

let pgClient: pg.Client;
let mysqlConn: mysql.Connection;
let ds: SqlDataSource;

const run = (connectionId: string, sql: string, options: { maxRows?: number; timeoutMs?: number; limits?: { maxRows: number; timeoutMs: number } } = {}) =>
  ds.execute(
    { id: "d", source: "sql", query: { connectionId, sql, maxRows: options.maxRows, timeoutMs: options.timeoutMs } } as never,
    { parameters: {}, limits: options.limits ?? { maxRows: 1000, timeoutMs: 10_000 } } as never,
  );

beforeAll(async () => {
  pgClient = new pg.Client(PG_CONFIG);
  await pgClient.connect();
  await pgClient.query("DROP TABLE IF EXISTS ro_items, ro_big, ro_created");
  await pgClient.query("CREATE TABLE ro_items (id INT, name TEXT)");
  await pgClient.query("INSERT INTO ro_items VALUES (1, 'a'), (2, 'b'), (3, 'c')");
  await pgClient.query(`CREATE TABLE ro_big AS SELECT g AS id, md5(g::text) AS label FROM generate_series(1, ${BIG_ROWS}) g`);

  mysqlConn = await mysql.createConnection({ ...MYSQL_CONFIG, multipleStatements: false });
  await mysqlConn.query("DROP TABLE IF EXISTS ro_items, ro_big, ro_created");
  await mysqlConn.query("CREATE TABLE ro_items (id INT, name VARCHAR(20))");
  await mysqlConn.query("INSERT INTO ro_items VALUES (1, 'a'), (2, 'b'), (3, 'c')");
  await mysqlConn.query("CREATE TABLE ro_big (id INT PRIMARY KEY, label CHAR(32))");
  await mysqlConn.query("SET SESSION cte_max_recursion_depth = 2000000");
  await mysqlConn.query(`INSERT INTO ro_big WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < ${BIG_ROWS}) SELECT n, md5(n) FROM seq`);

  const registry = new SqlConnectionRegistry();
  registry.register("pg", PG_CONFIG);
  registry.register("my", MYSQL_CONFIG);
  ds = new SqlDataSource(registry);
}, 120_000);

afterAll(async () => {
  await ds.close();
  await pgClient.query("DROP TABLE IF EXISTS ro_items, ro_big, ro_created");
  await pgClient.end();
  await mysqlConn.query("DROP TABLE IF EXISTS ro_items, ro_big, ro_created");
  await mysqlConn.end();
});

const pgCount = async () => Number((await pgClient.query("SELECT count(*) AS n FROM ro_items")).rows[0].n);
const myCount = async () => Number(((await mysqlConn.query("SELECT count(*) AS n FROM ro_items")) as unknown as [{ n: number }[]])[0][0]!.n);
const pgTableExists = async (name: string) => (await pgClient.query("SELECT to_regclass($1) AS t", [name])).rows[0].t !== null;
const myTableExists = async (name: string) => ((await mysqlConn.query("SHOW TABLES LIKE ?", [name])) as unknown as [unknown[]])[0].length > 0;

const WRITES = [
  "INSERT INTO ro_items VALUES (4, 'd')",
  "UPDATE ro_items SET name = 'x'",
  "DELETE FROM ro_items",
  "DROP TABLE ro_items",
  "CREATE TABLE ro_created (id INT)",
  "TRUNCATE ro_items",
];

describe("PostgreSQL datasets are read-only", () => {
  for (const sql of [...WRITES, "WITH gone AS (DELETE FROM ro_items RETURNING *) SELECT * FROM gone", "SELECT 1; DELETE FROM ro_items"]) {
    it(`refuses: ${sql}`, async () => {
      await expect(run("pg", sql)).rejects.toThrow();
      expect(await pgCount()).toBe(3);
      expect(await pgTableExists("ro_created")).toBe(false);
    });
  }

  it("cannot be switched to read-write by an earlier dataset on the same pooled connection", async () => {
    await run("pg", "SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE").catch(() => undefined);
    await run("pg", "SET default_transaction_read_only = off").catch(() => undefined);
    await expect(run("pg", "DELETE FROM ro_items")).rejects.toThrow();
    expect(await pgCount()).toBe(3);
  });

  it("still reads", async () => {
    expect((await run("pg", "SELECT id, name FROM ro_items ORDER BY id")).value).toEqual([{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 3, name: "c" }]);
  });

  it("cancels a slow statement on the server at the timeout", async () => {
    const started = Date.now();
    await expect(run("pg", "SELECT pg_sleep(30)", { timeoutMs: 500 })).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(5_000);
    const active = async () => Number((await pgClient.query("SELECT count(*) AS n FROM pg_stat_activity WHERE query LIKE '%pg_sleep(30)%' AND state = 'active' AND pid <> pg_backend_pid()")).rows[0].n);
    // The server cancels the statement itself; allow a moment for the cancellation to land.
    await expect.poll(active, { timeout: 2_000 }).toBe(0);
  });

  it(`stops reading at maxRows instead of loading all ${BIG_ROWS} rows`, async () => {
    const started = Date.now();
    // Only the final row sleeps, so a client that reads every row waits 3 s; one that stops at maxRows never reaches it.
    const result = await run("pg", `SELECT id, CASE WHEN id = ${BIG_ROWS} THEN pg_sleep(3) END AS slow FROM ro_big`, { maxRows: 10 });
    expect((result.value as unknown[]).length).toBe(10);
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

describe("MySQL datasets are read-only", () => {
  for (const sql of [...WRITES, "SELECT 1; DELETE FROM ro_items"]) {
    it(`refuses: ${sql}`, async () => {
      await expect(run("my", sql)).rejects.toThrow();
      expect(await myTableExists("ro_items")).toBe(true);
      expect(await myCount()).toBe(3);
      expect(await myTableExists("ro_created")).toBe(false);
    });
  }

  it("cannot be switched to read-write by an earlier dataset on the same pooled connection", async () => {
    await run("my", "SET SESSION TRANSACTION READ WRITE").catch(() => undefined);
    await run("my", "SET SESSION transaction_read_only = OFF").catch(() => undefined);
    await expect(run("my", "DROP TABLE ro_items")).rejects.toThrow();
    await expect(run("my", "DELETE FROM ro_items")).rejects.toThrow();
    expect(await myTableExists("ro_items")).toBe(true);
    expect(await myCount()).toBe(3);
  });

  it("still reads", async () => {
    expect((await run("my", "SELECT id, name FROM ro_items ORDER BY id")).value).toEqual([{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 3, name: "c" }]);
  });

  it("stops a slow statement at the timeout and keeps the connection usable", async () => {
    const started = Date.now();
    await expect(run("my", "SELECT SLEEP(30)", { timeoutMs: 500 })).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(5_000);
    expect((await run("my", "SELECT 1 AS ok")).value).toEqual([{ ok: 1 }]);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const [processes] = (await mysqlConn.query("SELECT count(*) AS n FROM information_schema.processlist WHERE info LIKE '%SLEEP(30)%' AND id <> CONNECTION_ID()")) as unknown as [{ n: number }[]];
    expect(Number(processes[0]!.n)).toBe(0);
  });

  it(`stops reading at maxRows instead of loading all ${BIG_ROWS} rows`, async () => {
    const started = Date.now();
    const result = await run("my", `SELECT id, IF(id = ${BIG_ROWS}, SLEEP(3), 0) AS slow FROM ro_big`, { maxRows: 10 });
    expect((result.value as unknown[]).length).toBe(10);
    expect(Date.now() - started).toBeLessThan(1_000);
    // Stopping early must also stop the server, not leave the query running against the table.
    const running = async () => Number(((await mysqlConn.query("SELECT count(*) AS n FROM information_schema.processlist WHERE info LIKE '%FROM ro_big%' AND id <> CONNECTION_ID()")) as unknown as [{ n: number }[]])[0][0]!.n);
    await expect.poll(running, { timeout: 2_000 }).toBe(0);
  });
});
