import Database from "better-sqlite3";
import {
  TemplateNotFoundError,
  VersionImmutableError,
  VersionNotFoundError,
  type BlockRecord,
  type CreateTemplateInput,
  type StorageProvider,
  type SavedPrinterProfile,
  type TemplateRecord,
  type TemplateVersionRecord,
} from "./types.js";

export class SqliteStorage implements StorageProvider {
  private db: Database.Database;

  constructor(filePath: string) {
    this.db = new Database(filePath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        currentVersion INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft',
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS blocks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        children TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS printer_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        print TEXT NOT NULL,
        page TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS template_versions (
        templateId TEXT NOT NULL,
        version INTEGER NOT NULL,
        definition TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        createdAt TEXT NOT NULL,
        createdBy TEXT,
        notes TEXT,
        PRIMARY KEY (templateId, version)
      );
    `);
    const columns = this.db.pragma("table_info(template_versions)") as { name: string }[];
    if (!columns.some((column) => column.name === "notes")) this.db.exec("ALTER TABLE template_versions ADD COLUMN notes TEXT");
    // Block versions: every save is kept; blocks saved before versioning become version 1.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS block_versions (
        blockId TEXT NOT NULL,
        version INTEGER NOT NULL,
        name TEXT NOT NULL,
        children TEXT NOT NULL,
        notes TEXT,
        createdAt TEXT NOT NULL,
        PRIMARY KEY (blockId, version)
      );
    `);
    const blockColumns = this.db.pragma("table_info(blocks)") as { name: string }[];
    if (!blockColumns.some((column) => column.name === "version")) this.db.exec("ALTER TABLE blocks ADD COLUMN version INTEGER NOT NULL DEFAULT 1");
    this.db.exec(`INSERT INTO block_versions (blockId, version, name, children, createdAt)
      SELECT b.id, b.version, b.name, b.children, b.updatedAt FROM blocks b
      WHERE NOT EXISTS (SELECT 1 FROM block_versions v WHERE v.blockId = b.id)`);
  }

  async createTemplate(input: CreateTemplateInput): Promise<TemplateRecord> {
    const now = new Date().toISOString();
    this.db
      .prepare(`INSERT INTO templates (id, name, description, currentVersion, status, createdAt, updatedAt) VALUES (?, ?, ?, 1, 'draft', ?, ?)`)
      .run(input.id, input.name, input.description ?? null, now, now);
    this.db
      .prepare(`INSERT INTO template_versions (templateId, version, definition, status, createdAt, createdBy) VALUES (?, 1, ?, 'draft', ?, ?)`)
      .run(input.id, JSON.stringify(input.definition), now, input.createdBy ?? null);
    return (await this.getTemplate(input.id))!;
  }

  async listTemplates(): Promise<TemplateRecord[]> {
    return this.db.prepare(`SELECT * FROM templates ORDER BY createdAt DESC`).all() as TemplateRecord[];
  }

  async getTemplate(id: string): Promise<TemplateRecord | undefined> {
    return this.db.prepare(`SELECT * FROM templates WHERE id = ?`).get(id) as TemplateRecord | undefined;
  }

  async updateTemplateMeta(id: string, patch: { name?: string; description?: string }): Promise<TemplateRecord> {
    const existing = await this.getTemplate(id);
    if (!existing) throw new TemplateNotFoundError(id);
    const now = new Date().toISOString();
    this.db
      .prepare(`UPDATE templates SET name = ?, description = ?, updatedAt = ? WHERE id = ?`)
      .run(patch.name ?? existing.name, patch.description ?? existing.description ?? null, now, id);
    return (await this.getTemplate(id))!;
  }

  async deleteTemplate(id: string): Promise<void> {
    this.db.prepare(`DELETE FROM template_versions WHERE templateId = ?`).run(id);
    this.db.prepare(`DELETE FROM templates WHERE id = ?`).run(id);
  }

  async createVersion(templateId: string, definition: unknown, createdBy?: string): Promise<TemplateVersionRecord> {
    const template = await this.getTemplate(templateId);
    if (!template) throw new TemplateNotFoundError(templateId);

    const nextVersion = template.currentVersion + 1;
    const now = new Date().toISOString();
    this.db
      .prepare(`INSERT INTO template_versions (templateId, version, definition, status, createdAt, createdBy) VALUES (?, ?, ?, 'draft', ?, ?)`)
      .run(templateId, nextVersion, JSON.stringify(definition), now, createdBy ?? null);
    this.db.prepare(`UPDATE templates SET currentVersion = ?, updatedAt = ? WHERE id = ?`).run(nextVersion, now, templateId);

    return (await this.getVersion(templateId, nextVersion))!;
  }

  async publishVersion(templateId: string, version: number, notes?: string): Promise<TemplateVersionRecord> {
    const existing = await this.getVersion(templateId, version);
    if (!existing) throw new VersionNotFoundError(templateId, version);
    if (existing.status === "published") return existing;
    this.db.prepare(`UPDATE template_versions SET status = 'published', notes = ? WHERE templateId = ? AND version = ?`).run(notes ?? null, templateId, version);
    this.db.prepare(`UPDATE templates SET status = 'published', updatedAt = ? WHERE id = ?`).run(new Date().toISOString(), templateId);
    return (await this.getVersion(templateId, version))!;
  }

  async listVersions(templateId: string): Promise<TemplateVersionRecord[]> {
    const rows = this.db
      .prepare(`SELECT * FROM template_versions WHERE templateId = ? ORDER BY version DESC`)
      .all(templateId) as Array<Omit<TemplateVersionRecord, "definition"> & { definition: string }>;
    return rows.map((r) => ({ ...r, definition: JSON.parse(r.definition) }));
  }

  async getVersion(templateId: string, version: number): Promise<TemplateVersionRecord | undefined> {
    const row = this.db.prepare(`SELECT * FROM template_versions WHERE templateId = ? AND version = ?`).get(templateId, version) as
      | (Omit<TemplateVersionRecord, "definition"> & { definition: string })
      | undefined;
    if (!row) return undefined;
    return { ...row, definition: JSON.parse(row.definition) };
  }

  async getLatestPublishedVersion(templateId: string): Promise<TemplateVersionRecord | undefined> {
    const row = this.db
      .prepare(`SELECT * FROM template_versions WHERE templateId = ? AND status = 'published' ORDER BY version DESC LIMIT 1`)
      .get(templateId) as (Omit<TemplateVersionRecord, "definition"> & { definition: string }) | undefined;
    if (!row) return undefined;
    return { ...row, definition: JSON.parse(row.definition) };
  }

  /** Reusable blocks ("My Components"): shared fragments organizations insert into many reports. */
  async listBlocks(): Promise<BlockRecord[]> {
    const rows = this.db.prepare(`SELECT * FROM blocks ORDER BY name`).all() as { id: string; name: string; children: string; version: number; updatedAt: string }[];
    return rows.map((r) => ({ ...r, children: JSON.parse(r.children) }));
  }

  async putBlock(id: string, name: string, children: unknown, notes?: string): Promise<number> {
    const now = new Date().toISOString();
    const json = JSON.stringify(children);
    return this.db.transaction(() => {
      const current = this.db.prepare(`SELECT MAX(version) AS version FROM block_versions WHERE blockId = ?`).get(id) as { version: number | null };
      const version = (current.version ?? 0) + 1;
      this.db.prepare(`INSERT INTO block_versions (blockId, version, name, children, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?)`).run(id, version, name, json, notes ?? null, now);
      this.db
        .prepare(`INSERT INTO blocks (id, name, children, version, updatedAt) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, children = excluded.children, version = excluded.version, updatedAt = excluded.updatedAt`)
        .run(id, name, json, version, now);
      return version;
    })();
  }

  async getBlock(id: string, version?: number): Promise<BlockRecord | undefined> {
    const row = (version === undefined
      ? this.db.prepare(`SELECT * FROM block_versions WHERE blockId = ? ORDER BY version DESC LIMIT 1`).get(id)
      : this.db.prepare(`SELECT * FROM block_versions WHERE blockId = ? AND version = ?`).get(id, version)) as { blockId: string; version: number; name: string; children: string; notes: string | null; createdAt: string } | undefined;
    return row ? { id: row.blockId, name: row.name, children: JSON.parse(row.children), version: row.version, ...(row.notes ? { notes: row.notes } : {}), updatedAt: row.createdAt } : undefined;
  }

  async listBlockVersions(id: string): Promise<{ version: number; name: string; notes?: string; createdAt: string }[]> {
    const rows = this.db.prepare(`SELECT version, name, notes, createdAt FROM block_versions WHERE blockId = ? ORDER BY version DESC`).all(id) as { version: number; name: string; notes: string | null; createdAt: string }[];
    return rows.map((r) => ({ version: r.version, name: r.name, ...(r.notes ? { notes: r.notes } : {}), createdAt: r.createdAt }));
  }

  async deleteBlock(id: string): Promise<void> {
    this.db.transaction(() => {
      this.db.prepare(`DELETE FROM blocks WHERE id = ?`).run(id);
      this.db.prepare(`DELETE FROM block_versions WHERE blockId = ?`).run(id);
    })();
  }

  async listPrinterProfiles(): Promise<SavedPrinterProfile[]> {
    const rows = this.db.prepare(`SELECT * FROM printer_profiles ORDER BY name COLLATE NOCASE`).all() as Array<Omit<SavedPrinterProfile, "print" | "page"> & { print: string; page: string }>;
    return rows.map((row) => ({ ...row, print: JSON.parse(row.print), page: JSON.parse(row.page) }));
  }

  async putPrinterProfile(id: string, name: string, print: SavedPrinterProfile["print"], page: SavedPrinterProfile["page"]): Promise<SavedPrinterProfile> {
    const updatedAt = new Date().toISOString();
    this.db.prepare(`INSERT INTO printer_profiles (id, name, print, page, updatedAt) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, print = excluded.print, page = excluded.page, updatedAt = excluded.updatedAt`)
      .run(id, name, JSON.stringify(print), JSON.stringify(page), updatedAt);
    return { id, name, print, page, updatedAt };
  }

  async deletePrinterProfile(id: string): Promise<void> {
    this.db.prepare(`DELETE FROM printer_profiles WHERE id = ?`).run(id);
  }

  close(): void {
    this.db.close();
  }
}

export function assertVersionIsMutable(version: TemplateVersionRecord): void {
  if (version.status === "published") {
    throw new VersionImmutableError(version.templateId, version.version);
  }
}
