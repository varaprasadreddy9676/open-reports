import { DataSourceRegistry, InlineDataSource } from "@reporting/core";
import { RestDataSource } from "@reporting/datasource-rest";
import { JsonDataSource } from "@reporting/datasource-json";

/** Default registry for the dev server: inline data (always safe) and REST
 * (SSRF-guarded by default). SQL datasources need real credentials
 * configured by the host application, so they're intentionally not wired up
 * here -- see @reporting/datasource-sql and SqlConnectionRegistry for how a
 * production deployment would register one. */
export function createDefaultDataSourceRegistry(): DataSourceRegistry {
  const registry = new DataSourceRegistry();
  registry.register(new InlineDataSource());
  registry.register(new RestDataSource({ secrets: secretsFromEnv() }));
  // File-based JSON datasets are off unless the operator names a directory they may read from (JSON_DATA_ROOT).
  if (process.env.JSON_DATA_ROOT) registry.register(new JsonDataSource({ rootDir: process.env.JSON_DATA_ROOT }));
  return registry;
}

/** Secrets are named `REPORT_SECRET_<NAME>` in the server environment and referenced from datasets as {{secrets.NAME}}. */
export function secretsFromEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (k.startsWith("REPORT_SECRET_") && v) out[k.slice("REPORT_SECRET_".length)] = v;
  }
  return out;
}
