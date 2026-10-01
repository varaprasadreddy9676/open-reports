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
