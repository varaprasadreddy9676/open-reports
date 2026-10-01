const PLACEHOLDER = /^\{\{\s*params\.([a-zA-Z0-9_.]+)\s*\}\}$/;

/** Resolves a query's declared `params` array against the execution
 * context's parameters. A whole-string placeholder like "{{params.id}}" is
 * replaced with the *typed* value (number stays a number, etc) so it binds
 * correctly through the driver's native parameterized-query mechanism --
 * this never touches the SQL text itself, which is what keeps it immune to
 * SQL injection regardless of what the parameter value contains. */
export function resolveSqlParams(rawParams: unknown[] | undefined, parameters: Record<string, unknown>): unknown[] {
  if (!rawParams) return [];
  return rawParams.map((raw) => {
    if (typeof raw !== "string") return raw;
    const match = PLACEHOLDER.exec(raw);
    if (!match) return raw;
    return getPath(parameters, match[1]!);
  });
}

function getPath(obj: unknown, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}
