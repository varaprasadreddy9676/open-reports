import { describe, it, expect } from "vitest";
import { connectionsFromEnv, parseConnectionUrl } from "../src/connections.js";

describe("connection URLs", () => {
  it("parses postgres and mysql URLs including encoded passwords and ssl", () => {
    expect(parseConnectionUrl("postgres://app:p%40ss@db.example.com:5433/clinic?ssl=true")).toEqual({ driver: "postgres", host: "db.example.com", port: 5433, database: "clinic", user: "app", password: "p@ss", ssl: true });
    expect(parseConnectionUrl("mysql://r:x@127.0.0.1/hms")).toMatchObject({ driver: "mysql", port: undefined, database: "hms", ssl: false });
  });
  it("rejects unsupported schemes and incomplete URLs", () => {
    expect(() => parseConnectionUrl("http://x/y")).toThrow(/Unsupported/);
    expect(() => parseConnectionUrl("postgres://u:p@host")).toThrow(/database/);
  });
  it("reads REPORT_SQL_* from the environment as lower-case dashed ids", () => {
    const c = connectionsFromEnv({ REPORT_SQL_HMS_MAIN: "postgres://u:p@h/d", OTHER: "x" });
    expect(Object.keys(c)).toEqual(["hms-main"]);
  });
});
