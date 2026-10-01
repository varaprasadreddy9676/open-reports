import { DataSourceRegistry, InlineDataSource } from "@reporting/core";
import { RestDataSource } from "@reporting/datasource-rest";

/** Default registry for the dev server: inline data (always safe) and REST
 * (SSRF-guarded by default). SQL datasources need real credentials
 * configured by the host application, so they're intentionally not wired up
 * here -- see @reporting/datasource-sql and SqlConnectionRegistry for how a
 * production deployment would register one. */
export function createDefaultDataSourceRegistry(): DataSourceRegistry {
  const registry = new DataSourceRegistry();
  registry.register(new InlineDataSource());
  registry.register(new RestDataSource());
  return registry;
}
