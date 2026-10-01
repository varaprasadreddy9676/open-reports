/** Replaces `{{params.x}}`-style placeholders with values from `parameters`.
 * Deliberately NOT the full expression engine: REST query definitions are
 * configuration, not report-author-supplied business logic, so a plain
 * dotted-path substitution is enough and keeps this independent of
 * @reporting/expressions. */
export function interpolate(input: string, parameters: Record<string, unknown>): string {
  return input.replace(/\{\{\s*params\.([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, pathExpr: string) => {
    const value = pathExpr.split(".").reduce<unknown>((acc, key) => {
      if (acc === null || acc === undefined || typeof acc !== "object") return undefined;
      return (acc as Record<string, unknown>)[key];
    }, parameters);
    return value === undefined || value === null ? "" : String(value);
  });
}

export function interpolateDeep(value: unknown, parameters: Record<string, unknown>): unknown {
  if (typeof value === "string") return interpolate(value, parameters);
  if (Array.isArray(value)) return value.map((v) => interpolateDeep(v, parameters));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, interpolateDeep(v, parameters)]));
  }
  return value;
}
