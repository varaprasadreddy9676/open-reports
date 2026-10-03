import type { PageConfig, PrintProfile } from "@reporting/schema";

export type TemplateStatus = "draft" | "published" | "archived";

export interface TemplateRecord {
  id: string;
  name: string;
  description?: string;
  currentVersion: number;
  status: TemplateStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateVersionRecord {
  templateId: string;
  version: number;
  definition: unknown;
  status: "draft" | "published";
  createdAt: string;
  createdBy?: string;
  notes?: string;
}

export interface CreateTemplateInput {
  id: string;
  name: string;
  description?: string;
  definition: unknown;
  createdBy?: string;
}

export interface SavedPrinterProfile {
  id: string;
  name: string;
  print: PrintProfile;
  page: PageConfig;
  updatedAt: string;
}

/**
 * Storage abstraction (spec section 50/41): the server depends only on this
 * interface, never directly on SQLite/Postgres, so a Postgres-backed
 * implementation can be dropped in for production without touching routes.
 */
export interface StorageProvider {
  createTemplate(input: CreateTemplateInput): Promise<TemplateRecord>;
  listTemplates(): Promise<TemplateRecord[]>;
  getTemplate(id: string): Promise<TemplateRecord | undefined>;
  updateTemplateMeta(id: string, patch: { name?: string; description?: string }): Promise<TemplateRecord>;
  deleteTemplate(id: string): Promise<void>;

  /** Creates the next version (draft) for a template. */
  createVersion(templateId: string, definition: unknown, createdBy?: string): Promise<TemplateVersionRecord>;
  /** Publishes a version; once published it is immutable (spec section 41). */
  publishVersion(templateId: string, version: number, notes?: string): Promise<TemplateVersionRecord>;
  listVersions(templateId: string): Promise<TemplateVersionRecord[]>;
  getVersion(templateId: string, version: number): Promise<TemplateVersionRecord | undefined>;
  getLatestPublishedVersion(templateId: string): Promise<TemplateVersionRecord | undefined>;

  /** Reusable blocks ("My Components"). */
  listBlocks(): Promise<{ id: string; name: string; children: unknown; updatedAt: string }[]>;
  putBlock(id: string, name: string, children: unknown): Promise<void>;
  deleteBlock(id: string): Promise<void>;
  /** Optional for storage plugins written before printer profiles were introduced. */
  listPrinterProfiles?(): Promise<SavedPrinterProfile[]>;
  putPrinterProfile?(id: string, name: string, print: PrintProfile, page: PageConfig): Promise<SavedPrinterProfile>;
  deletePrinterProfile?(id: string): Promise<void>;
  /** Release connections on shutdown. */
  close?(): void | Promise<void>;
}

const STORAGE_METHODS = ["createTemplate", "listTemplates", "getTemplate", "updateTemplateMeta", "deleteTemplate", "createVersion", "publishVersion", "listVersions", "getVersion", "getLatestPublishedVersion", "listBlocks", "putBlock", "deleteBlock"] as const;

/** Checks a plugin-supplied storage backend implements the full interface before the server uses it. */
export function assertStorageProvider(candidate: unknown): StorageProvider {
  const missing = STORAGE_METHODS.filter((m) => typeof (candidate as any)?.[m] !== "function");
  if (missing.length) throw new Error(`Storage plugin is missing: ${missing.join(", ")}.`);
  return candidate as StorageProvider;
}

export class TemplateNotFoundError extends Error {
  constructor(id: string) {
    super(`Template "${id}" not found.`);
    this.name = "TemplateNotFoundError";
  }
}

export class VersionNotFoundError extends Error {
  constructor(id: string, version: number) {
    super(`Template "${id}" has no version ${version}.`);
    this.name = "VersionNotFoundError";
  }
}

export class VersionImmutableError extends Error {
  constructor(id: string, version: number) {
    super(`Template "${id}" version ${version} is already published and cannot be modified.`);
    this.name = "VersionImmutableError";
  }
}
