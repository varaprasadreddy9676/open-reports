/** The subset of a report parameter definition the viewer needs (mirrors @reporting/schema). */
export interface ParameterDefinition {
  id: string;
  type: "string" | "number" | "boolean" | "date" | "datetime" | "array" | "object" | "enum";
  label?: string;
  required?: boolean;
  default?: unknown;
  enumValues?: (string | number)[];
}

/** Turns a form field's text into the parameter's type; blank or invalid input becomes undefined. */
export function coerceParameter(definition: ParameterDefinition, raw: string): unknown {
  const text = raw.trim();
  if (definition.type === "boolean") return text === "true" || text === "on";
  if (!text) return undefined;
  switch (definition.type) {
    case "number": {
      const value = Number(text);
      return Number.isFinite(value) ? value : undefined;
    }
    case "enum": {
      const match = definition.enumValues?.find((value) => String(value) === text);
      return match ?? text;
    }
    case "array":
    case "object":
      try {
        return JSON.parse(text);
      } catch {
        return undefined;
      }
    default:
      return text;
  }
}

/** Report defaults first, then whatever the host page passed in. */
export function initialParameters(definitions: ParameterDefinition[], provided: Record<string, unknown> = {}): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const definition of definitions) if (definition.default !== undefined) values[definition.id] = definition.default;
  return { ...values, ...provided };
}
