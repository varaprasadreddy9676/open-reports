import { SUPPORTED_SCHEMA_VERSIONS } from "./report.js";

export class UnsupportedSchemaVersionError extends Error {
  constructor(public readonly version: unknown) {
    super(
      `Unsupported report schemaVersion "${String(version)}". Supported versions: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}.`
    );
    this.name = "UnsupportedSchemaVersionError";
  }
}

type Migration = { from: string; to: string; migrate: (doc: Record<string, unknown>) => Record<string, unknown> };

/**
 * Chain of migrations between successive schema versions. Empty today (only one
 * version exists) but the shape lets a future "1.0 -> 1.1" migration slot in
 * without touching callers of migrateToLatest.
 */
const MIGRATIONS: Migration[] = [];

/**
 * Upgrades a raw report document to the latest supported schemaVersion,
 * applying any registered migrations in sequence. Throws
 * UnsupportedSchemaVersionError if the document's version is unknown and no
 * migration path exists.
 */
export function migrateToLatest(doc: Record<string, unknown>): Record<string, unknown> {
  let current = doc;
  let version = String(current.schemaVersion);

  if ((SUPPORTED_SCHEMA_VERSIONS as readonly string[]).includes(version)) {
    return current;
  }

  let migrated = true;
  while (migrated) {
    migrated = false;
    for (const m of MIGRATIONS) {
      if (m.from === version) {
        current = m.migrate(current);
        version = m.to;
        migrated = true;
        break;
      }
    }
  }

  if (!(SUPPORTED_SCHEMA_VERSIONS as readonly string[]).includes(version)) {
    throw new UnsupportedSchemaVersionError(doc.schemaVersion);
  }
  return current;
}
