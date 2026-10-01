import Database from "better-sqlite3";
import {
  TemplateNotFoundError,
  VersionImmutableError,
  VersionNotFoundError,
  type CreateTemplateInput,
  type StorageProvider,
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
      CREATE TABLE IF NOT EXISTS template_versions (
        templateId TEXT NOT NULL,
        version INTEGER NOT NULL,
        definition TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        createdAt TEXT NOT NULL,
        createdBy TEXT,
        PRIMARY KEY (templateId, version)
      );
    `);
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

  async publishVersion(templateId: string, version: number): Promise<TemplateVersionRecord> {
    const existing = await this.getVersion(templateId, version);
    if (!existing) throw new VersionNotFoundError(templateId, version);
    this.db.prepare(`UPDATE template_versions SET status = 'published' WHERE templateId = ? AND version = ?`).run(templateId, version);
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
  async listBlocks(): Promise<{ id: string; name: string; children: unknown; updatedAt: string }[]> {
    const rows = this.db.prepare(`SELECT * FROM blocks ORDER BY name`).all() as { id: string; name: string; children: string; updatedAt: string }[];
    return rows.map((r) => ({ ...r, children: JSON.parse(r.children) }));
  }

  async putBlock(id: string, name: string, children: unknown): Promise<void> {
    this.db
      .prepare(`INSERT INTO blocks (id, name, children, updatedAt) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, children = excluded.children, updatedAt = excluded.updatedAt`)
      .run(id, name, JSON.stringify(children), new Date().toISOString());
  }

  async deleteBlock(id: string): Promise<void> {
    this.db.prepare(`DELETE FROM blocks WHERE id = ?`).run(id);
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
