import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { JsonDataSource } from "../src/index.js";

let dir: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "json-ds-"));
  await fs.writeFile(path.join(dir, "items.json"), JSON.stringify({ items: [{ a: 1 }, { a: 2 }] }));
  await fs.mkdir(path.join(dir, "nested"));
  await fs.writeFile(path.join(dir, "nested", "secret.json"), JSON.stringify({ secret: true }));
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const ctx = { parameters: {}, limits: { maxRows: 1000, timeoutMs: 5000 } };

describe("JsonDataSource", () => {
  it("reads a local JSON file within the allowed root", async () => {
    const ds = new JsonDataSource({ rootDir: dir });
    const result = await ds.execute({ id: "x", source: "json", query: { filePath: "items.json", path: "items" } }, ctx);
    expect(result.value).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("reads inline JSON strings", async () => {
    const ds = new JsonDataSource({ rootDir: dir });
    const result = await ds.execute({ id: "x", source: "json", query: { json: '{"n": 42}' } }, ctx);
    expect(result.value).toEqual({ n: 42 });
  });

  it("reads a nested file within the root", async () => {
    const ds = new JsonDataSource({ rootDir: dir });
    const result = await ds.execute({ id: "x", source: "json", query: { filePath: "nested/secret.json" } }, ctx);
    expect(result.value).toEqual({ secret: true });
  });

  it("rejects a path-traversal attempt that escapes the allowed root", async () => {
    const ds = new JsonDataSource({ rootDir: path.join(dir, "nested") });
    await expect(ds.execute({ id: "x", source: "json", query: { filePath: "../items.json" } }, ctx)).rejects.toThrow(
      /outside the allowed/
    );
  });

  it("rejects an absolute path escaping the root", async () => {
    const ds = new JsonDataSource({ rootDir: dir });
    await expect(ds.execute({ id: "x", source: "json", query: { filePath: "/etc/passwd" } }, ctx)).rejects.toThrow(
      /outside the allowed/
    );
  });
});

describe("symlink escape", () => {
  it("refuses a symlink inside the root that points outside it", async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "outside-"));
    await fs.writeFile(path.join(outside, "leak.json"), JSON.stringify({ leaked: true }));
    await fs.symlink(path.join(outside, "leak.json"), path.join(dir, "link.json"));
    const ds = new JsonDataSource({ rootDir: dir });
    await expect(ds.execute({ id: "x", source: "json", query: { filePath: "link.json" } } as any, { parameters: {}, limits: { maxRows: 10, timeoutMs: 1000 } })).rejects.toThrow(/outside the allowed/);
    await fs.rm(outside, { recursive: true, force: true });
  });
});
