import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { buildApp } from "../src/app.js";
import { SqliteStorage } from "../src/storage/sqlite-storage.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "report-blocks-"));
const { app } = buildApp({ dbPath: path.join(dir, "db.sqlite"), apiKeys: ["blocks"] });
const auth = { "x-api-key": "blocks", "content-type": "application/json" };
const text = (value: string) => [{ type: "text", value }];

beforeAll(async () => { await app.ready(); });
afterAll(async () => { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const put = (id: string, value: string, notes?: string) => app.inject({ method: "PUT", url: `/api/v1/blocks/${id}`, headers: auth, payload: { name: "Letterhead", children: text(value), ...(notes ? { notes } : {}) } });
const report = (mode: "linked" | "pinned", version: number, snapshot: string, block = "letterhead") => ({
  schemaVersion: "1.0", id: "uses-block", name: "Uses block",
  fragments: [{ id: "head", name: "Letterhead", source: { block, version, mode }, children: text(snapshot) }],
  sections: [{ type: "detail", children: [{ type: "fragment", id: "head-1", ref: "head" }] }],
});
const render = async (definition: unknown) => {
  const response = await app.inject({ method: "POST", url: "/api/v1/render", headers: auth, payload: { report: definition, format: "html" } });
  expect(response.statusCode).toBe(200);
  return response.payload;
};

describe("versioned block library", () => {
  it("keeps every saved version with its notes", async () => {
    const first = await put("letterhead", "HEADER V1");
    expect([first.statusCode, first.headers["x-block-version"]]).toEqual([204, "1"]);
    expect((await put("letterhead", "HEADER V2", "New address")).headers["x-block-version"]).toBe("2");
    const list = (await app.inject({ url: "/api/v1/blocks", headers: auth })).json();
    expect(list.find((b: any) => b.id === "letterhead")).toMatchObject({ name: "Letterhead", version: 2, children: text("HEADER V2") });
    const versions = (await app.inject({ url: "/api/v1/blocks/letterhead/versions", headers: auth })).json();
    expect(versions.map((v: any) => [v.version, v.notes ?? null])).toEqual([[2, "New address"], [1, null]]);
    expect((await app.inject({ url: "/api/v1/blocks/letterhead/versions/1", headers: auth })).json()).toMatchObject({ version: 1, children: text("HEADER V1") });
    expect((await app.inject({ url: "/api/v1/blocks/letterhead/versions/9", headers: auth })).statusCode).toBe(404);
  });

  it("renders linked blocks from the latest library version and pinned blocks from their own version", async () => {
    const linked = await render(report("linked", 1, "HEADER V1"));
    expect(linked).toContain("HEADER V2");
    expect(linked).not.toContain("HEADER V1");
    const pinned = await render(report("pinned", 1, "HEADER V1"));
    expect(pinned).toContain("HEADER V1");
    const analysis = (await app.inject({ method: "POST", url: "/api/v1/analyze", headers: auth, payload: { report: report("linked", 1, "HEADER V1"), includeLayout: true } })).json();
    expect(JSON.stringify(analysis)).toContain("HEADER V2");
  });

  it("falls back to the saved snapshot, with a warning, when a library block is unavailable", async () => {
    const html = await render(report("linked", 3, "SNAPSHOT TEXT", "deleted-block"));
    expect(html).toContain("SNAPSHOT TEXT");
    const analysis = (await app.inject({ method: "POST", url: "/api/v1/analyze", headers: auth, payload: { report: report("linked", 3, "SNAPSHOT TEXT", "deleted-block") } })).json();
    expect(analysis.warnings).toContainEqual(expect.objectContaining({ code: "BLOCK_UNAVAILABLE" }));
  });
});

describe("block storage migration", () => {
  it("upgrades a database whose blocks have no version history", async () => {
    const file = path.join(dir, "legacy.sqlite");
    const legacy = new Database(file);
    legacy.exec("CREATE TABLE blocks (id TEXT PRIMARY KEY, name TEXT NOT NULL, children TEXT NOT NULL, updatedAt TEXT NOT NULL)");
    legacy.prepare("INSERT INTO blocks VALUES (?, ?, ?, ?)").run("footer", "Footer", JSON.stringify(text("OLD FOOTER")), "2026-01-01T00:00:00.000Z");
    legacy.close();
    const storage = new SqliteStorage(file);
    expect(await storage.listBlocks()).toEqual([expect.objectContaining({ id: "footer", version: 1, children: text("OLD FOOTER") })]);
    expect(await storage.putBlock("footer", "Footer", text("NEW FOOTER"))).toBe(2);
    expect((await storage.getBlock!("footer", 1))?.children).toEqual(text("OLD FOOTER"));
    storage.close?.();
  });
});
