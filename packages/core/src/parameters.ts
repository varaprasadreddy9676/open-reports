import type { ParameterDefinition } from "@reporting/schema";

export interface ParameterIssue {
  severity: "error";
  code: string;
  path: string;
  message: string;
}

export interface ParameterResolution {
  values: Record<string, unknown>;
  issues: ParameterIssue[];
}

/** Merges supplied parameter values with declared defaults, enforces `required`,
 * and coerces primitive types (string/number/boolean/date/datetime) so expressions
 * and datasources always see consistent types regardless of how the caller
 * passed them in (REST request bodies are always strings/JSON primitives). */
export function resolveParameters(
  definitions: ParameterDefinition[],
  supplied: Record<string, unknown>
): ParameterResolution {
  const values: Record<string, unknown> = {};
  const issues: ParameterIssue[] = [];

  for (const def of definitions) {
    const path = `parameters.${def.id}`;
    const hasSupplied = Object.prototype.hasOwnProperty.call(supplied, def.id) && supplied[def.id] !== undefined;
    const raw = hasSupplied ? supplied[def.id] : def.default;

    if (raw === undefined || raw === null) {
      if (def.required) {
        issues.push({
          severity: "error",
          code: "MISSING_REQUIRED_PARAMETER",
          path,
          message: `Parameter "${def.id}" is required.`,
        });
      }
      values[def.id] = raw ?? null;
      continue;
    }

    try {
      values[def.id] = coerce(def, raw);
    } catch (err) {
      issues.push({
        severity: "error",
        code: "INVALID_PARAMETER_TYPE",
        path,
        message: err instanceof Error ? err.message : String(err),
      });
      values[def.id] = raw;
    }
  }

  // Pass through anything supplied that isn't formally declared, so ad-hoc params still work.
  for (const key of Object.keys(supplied)) {
    if (!(key in values)) values[key] = supplied[key];
  }

  return { values, issues };
}

function coerce(def: ParameterDefinition, raw: unknown): unknown {
  switch (def.type) {
    case "string":
      return String(raw);
    case "number": {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (Number.isNaN(n)) throw new Error(`Parameter "${def.id}" must be a number, got "${raw}".`);
      return n;
    }
    case "boolean":
      if (typeof raw === "boolean") return raw;
      if (raw === "true") return true;
      if (raw === "false") return false;
      throw new Error(`Parameter "${def.id}" must be a boolean, got "${raw}".`);
    case "date":
    case "datetime": {
      const d = raw instanceof Date ? raw : new Date(raw as string | number);
      if (Number.isNaN(d.getTime())) throw new Error(`Parameter "${def.id}" must be a valid date, got "${raw}".`);
      return d;
    }
    case "array":
      if (Array.isArray(raw)) return raw;
      throw new Error(`Parameter "${def.id}" must be an array.`);
    case "object":
      if (typeof raw === "object" && raw !== null) return raw;
      throw new Error(`Parameter "${def.id}" must be an object.`);
    case "enum":
      if (def.enumValues && !def.enumValues.includes(raw as string | number)) {
        throw new Error(`Parameter "${def.id}" must be one of [${def.enumValues.join(", ")}], got "${raw}".`);
      }
      return raw;
    default:
      return raw;
  }
}
