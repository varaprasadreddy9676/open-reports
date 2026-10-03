import type { Theme } from "@reporting/schema";

/** "$name" references a theme token; which token table it reads depends on the property. */
const TOKEN = /^\$([A-Za-z][A-Za-z0-9_-]*)$/;
type Category = "colors" | "fonts" | "fontSizes" | "spacing";

const CATEGORY_OF: Record<string, Category> = {
  color: "colors",
  background: "colors",
  fontFamily: "fonts",
  fontSize: "fontSizes",
  padding: "spacing",
  margin: "spacing",
  gap: "spacing",
};

export interface UnknownToken {
  /** Path inside the style, e.g. "border.color" or "margin.top". */
  key: string;
  token: string;
  category: Category;
}

type Lookup = (category: Category, name: string) => unknown;

function lookupIn(theme: Theme | undefined): Lookup {
  return (category, name) => (theme?.[category] as Record<string, unknown> | undefined)?.[name];
}

/** Resolves one value; returns undefined (and records it) for an unknown token. */
function resolveValue(value: unknown, category: Category, key: string, lookup: Lookup, unknown: UnknownToken[]): unknown {
  if (typeof value !== "string") return value;
  const match = TOKEN.exec(value);
  if (!match) return value;
  const resolved = lookup(category, match[1]!);
  if (resolved === undefined) unknown.push({ key, token: value, category });
  return resolved;
}

function resolveSides(value: unknown, category: Category, key: string, lookup: Lookup, unknown: UnknownToken[]): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const out: Record<string, unknown> = {};
    for (const [side, part] of Object.entries(value)) {
      const resolved = resolveValue(part, category, `${key}.${side}`, lookup, unknown);
      if (resolved !== undefined) out[side] = resolved;
    }
    return out;
  }
  return resolveValue(value, category, key, lookup, unknown);
}

/** Replaces every token in a style with its theme value. Unknown tokens are left out and reported. */
export function resolveStyleTokens(style: Record<string, unknown> | undefined, theme: Theme | undefined, unknown: UnknownToken[] = []): Record<string, unknown> | undefined {
  if (!style) return style;
  const lookup = lookupIn(theme);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style)) {
    let resolved: unknown = value;
    if (key === "border" && value && typeof value === "object") {
      const border = value as Record<string, unknown>;
      // Either one side ({ width, style, color }) or per-side objects.
      resolved = "color" in border || "width" in border || "style" in border
        ? { ...border, ...(border.color !== undefined ? { color: resolveValue(border.color, "colors", "border.color", lookup, unknown) } : {}) }
        : Object.fromEntries(Object.entries(border).map(([side, part]) => [side, part && typeof part === "object"
          ? { ...(part as Record<string, unknown>), ...((part as Record<string, unknown>).color !== undefined ? { color: resolveValue((part as Record<string, unknown>).color, "colors", `border.${side}.color`, lookup, unknown) } : {}) }
          : part]));
    } else if (CATEGORY_OF[key]) {
      resolved = key === "padding" || key === "margin" ? resolveSides(value, CATEGORY_OF[key]!, key, lookup, unknown) : resolveValue(value, CATEGORY_OF[key]!, key, lookup, unknown);
    }
    if (resolved !== undefined) out[key] = resolved;
  }
  return out;
}

/** Resolves a component or band gap token. */
export function resolveGapToken(gap: unknown, theme: Theme | undefined, unknown: UnknownToken[] = []): unknown {
  return resolveValue(gap, "spacing", "gap", lookupIn(theme), unknown);
}

/** The effective style of something that names a text style: the text style beneath its own style. */
export function withTextStyle(style: Record<string, unknown> | undefined, textStyle: string | undefined, theme: Theme | undefined): Record<string, unknown> | undefined {
  const named = textStyle ? theme?.textStyles?.[textStyle] : undefined;
  if (!named) return style;
  return { ...(named as Record<string, unknown>), ...(style ?? {}) };
}

/** Tokens used in a style (or a single property value) that the theme does not define. */
export function unknownTokens(style: Record<string, unknown> | undefined, theme: Theme | undefined): UnknownToken[] {
  const unknown: UnknownToken[] = [];
  resolveStyleTokens(style, theme, unknown);
  return unknown;
}

export const isTokenRef = (value: unknown): value is string => typeof value === "string" && TOKEN.test(value);
