import { afterEach, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SqliteStorage } from "../src/storage/sqlite-storage.js";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });

it("adds version notes to an existing SQLite database without losing versions", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "reporting-notes-migration-"));
  directories.push(directory);
  const file = path.join(directory, "reports.sqlite");
  const old = new Database(file);
  old.exec(`
    CREATE TABLE template_versions (
      templateId TEXT NOT NULL, version INTEGER NOT NULL, definition TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft', createdAt TEXT NOT NULL, createdBy TEXT,
      PRIMARY KEY (templateId, version)
    );
  `);
  old.prepare("INSERT INTO template_versions VALUES (?, ?, ?, ?, ?, ?)").run("existing", 1, JSON.stringify({ id: "existing" }), "draft", "2026-01-01", null);
  old.close();

  const storage = new SqliteStorage(file);
  try {
    expect((await storage.getVersion("existing", 1))?.definition).toEqual({ id: "existing" });
    const published = await storage.publishVersion("existing", 1, "Migrated and reviewed");
    expect(published.notes).toBe("Migrated and reviewed");
    expect(published.status).toBe("published");
  } finally {
    storage.close();
  }
});
