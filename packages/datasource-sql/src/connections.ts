export interface SqlConnectionConfig {
  driver: "postgres" | "mysql";
  host: string;
  port?: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

/**
 * Connections are registered by the host application (server config, env
 * vars, a secrets manager) and referenced from report JSON only by
 * `connectionId` -- credentials are never embedded in a report/template
 * definition (per spec section 37: "Secrets must never be persisted
 * directly inside report JSON. Use connection IDs/references.").
 */
export class SqlConnectionRegistry {
  private connections = new Map<string, SqlConnectionConfig>();

  register(id: string, config: SqlConnectionConfig): void {
    this.connections.set(id, config);
  }

  get(id: string): SqlConnectionConfig {
    const config = this.connections.get(id);
    if (!config) {
      throw new Error(`No SQL connection registered with id "${id}".`);
    }
    return config;
  }
}

/** postgres://user:pass@host:5432/db?ssl=true  or  mysql://user:pass@host/db */
export function parseConnectionUrl(url: string): SqlConnectionConfig {
  const u = new URL(url);
  const scheme = u.protocol.replace(":", "");
  const driver = scheme === "postgres" || scheme === "postgresql" ? "postgres" : scheme === "mysql" || scheme === "mariadb" ? "mysql" : undefined;
  if (!driver) throw new Error(`Unsupported database URL scheme "${scheme}" (use postgres:// or mysql://).`);
  const database = decodeURIComponent(u.pathname.replace(/^\//, ""));
  if (!u.hostname || !database) throw new Error("Database URL needs a host and a database name.");
  return {
    driver,
    host: u.hostname,
    port: u.port ? Number(u.port) : undefined,
    database,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    ssl: ["1", "true", "require"].includes(u.searchParams.get("ssl") ?? ""),
  };
}

/** REPORT_SQL_<NAME>=postgres://... registers connection id "<name>" (lower-case, "_" -> "-"). Reports reference only the id. */
export function connectionsFromEnv(env: NodeJS.ProcessEnv = process.env): Record<string, SqlConnectionConfig> {
  const out: Record<string, SqlConnectionConfig> = {};
  for (const [k, v] of Object.entries(env)) {
    if (!k.startsWith("REPORT_SQL_") || !v) continue;
    const id = k.slice("REPORT_SQL_".length).toLowerCase().replace(/_/g, "-");
    out[id] = parseConnectionUrl(v);
  }
  return out;
}
