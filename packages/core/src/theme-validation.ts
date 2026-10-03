import type { Rule, Theme } from "@reporting/schema";
import { ruleCases } from "./rules.js";
import { resolveGapToken, unknownTokens, type UnknownToken } from "./theme.js";
import type { ValidationIssue } from "./validator.js";

const tokenIssue = (item: UnknownToken, path: string, componentId?: string): ValidationIssue => ({
  severity: "error", code: "THEME_UNKNOWN_TOKEN", path, ...(componentId ? { componentId } : {}),
  message: `${item.token} is not a ${item.category === "colors" ? "colour" : item.category === "fonts" ? "font" : item.category === "fontSizes" ? "font size" : "spacing"} token in the theme.`,
});

/** Unknown tokens in a style, each at its exact property path. */
export function validateStyleTokens(style: Record<string, unknown> | undefined, theme: Theme | undefined, path: string, issues: ValidationIssue[], componentId?: string): void {
  for (const item of unknownTokens(style, theme)) issues.push(tokenIssue(item, `${path}.${item.key}`, componentId));
}

export function validateGapToken(gap: unknown, theme: Theme | undefined, path: string, issues: ValidationIssue[], componentId?: string): void {
  const unknown: UnknownToken[] = [];
  resolveGapToken(gap, theme, unknown);
  for (const item of unknown) issues.push(tokenIssue(item, path, componentId));
}

export function validateTextStyleRef(name: unknown, theme: Theme | undefined, path: string, issues: ValidationIssue[], componentId?: string): void {
  if (typeof name !== "string" || theme?.textStyles?.[name]) return;
  const known = Object.keys(theme?.textStyles ?? {});
  issues.push({ severity: "error", code: "THEME_UNKNOWN_TEXT_STYLE", path, ...(componentId ? { componentId } : {}), message: `Text style "${name}" is not defined in theme.textStyles.${known.length ? ` Defined: ${known.join(", ")}.` : ""}` });
}

/** Theme values written by rules: "style.*" tokens and "textStyle" names. */
export function validateRuleThemeValues(rules: Rule[] | undefined, theme: Theme | undefined, path: string, issues: ValidationIssue[], componentId?: string): void {
  rules?.forEach((rule, index) => {
    const rulePath = `${path}.rules[${index}]`;
    const sets: [string, Record<string, unknown>][] = ruleCases(rule).map((c, caseIndex) => ["cases" in rule ? `cases[${caseIndex}].set` : "set", c.set]);
    if (rule.else) sets.push(["else", rule.else]);
    for (const [where, set] of sets) for (const [key, value] of Object.entries(set)) {
      if (key === "textStyle") validateTextStyleRef(value, theme, `${rulePath}.${where}.textStyle`, issues, componentId);
      else if (key === "gap") validateGapToken(value, theme, `${rulePath}.${where}.gap`, issues, componentId);
      else if (key.startsWith("style.")) {
        const parts = key.slice("style.".length).split(".");
        const style = parts.reduceRight<unknown>((inner, part) => ({ [part]: inner }), value) as Record<string, unknown>;
        for (const item of unknownTokens(style, theme)) issues.push(tokenIssue(item, `${rulePath}.${where}.${key}`, componentId));
      }
    }
  });
}

/** The theme's own text styles may only use tokens the theme defines. */
export function validateTheme(theme: Theme | undefined, issues: ValidationIssue[]): void {
  for (const [name, style] of Object.entries(theme?.textStyles ?? {})) validateStyleTokens(style as Record<string, unknown>, theme, `theme.textStyles.${name}`, issues);
}
