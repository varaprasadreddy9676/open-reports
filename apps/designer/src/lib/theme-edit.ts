import type { Doc } from "../model/ops";

export type TokenCategory = "colors" | "fonts" | "fontSizes" | "spacing";

/** Which token table a style property reads (mirrors @reporting/core theme resolution). */
const CATEGORY_OF: Record<string, TokenCategory> = {
  color: "colors", background: "colors", fontFamily: "fonts", fontSize: "fontSizes", padding: "spacing", margin: "spacing",
};
const TEXT_PROPERTIES = ["fontFamily", "fontSize", "fontWeight", "italic", "underline", "strikethrough", "align", "lineHeight", "letterSpacing", "color"];
const CHILD_KEYS = ["children", "header", "footer", "otherwise"];

type Visit = (value: unknown, category: TokenCategory) => unknown;

/** Rewrites every token-capable value in a style with `visit`, returning a new style. */
function mapStyle(style: unknown, visit: Visit): unknown {
  if (!style || typeof style !== "object") return style;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style as Record<string, unknown>)) {
    if (key === "border" && value && typeof value === "object") {
      const border = value as Record<string, unknown>;
      out[key] = "color" in border || "width" in border || "style" in border
        ? { ...border, ...(border.color !== undefined ? { color: visit(border.color, "colors") } : {}) }
        : Object.fromEntries(Object.entries(border).map(([side, part]) => [side, part && typeof part === "object" ? { ...(part as object), ...((part as Record<string, unknown>).color !== undefined ? { color: visit((part as Record<string, unknown>).color, "colors") } : {}) } : part]));
    } else if (CATEGORY_OF[key] === "spacing" && value && typeof value === "object") {
      out[key] = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([side, part]) => [side, visit(part, "spacing")]));
    } else out[key] = CATEGORY_OF[key] ? visit(value, CATEGORY_OF[key]!) : value;
  }
  return out;
}

/** Rule `set` values: "style.*" paths and gaps carry tokens. */
function mapRuleSet(set: Record<string, unknown>, visit: Visit): Record<string, unknown> {
  return Object.fromEntries(Object.entries(set).map(([key, value]) => {
    if (key === "gap") return [key, visit(value, "spacing")];
    if (!key.startsWith("style.")) return [key, value];
    const parts = key.slice(6).split(".");
    const nested = parts.reduceRight<unknown>((inner, part) => ({ [part]: inner }), value);
    let mapped = mapStyle(nested, visit);
    for (const part of parts) mapped = (mapped as Record<string, unknown>)[part];
    return [key, mapped];
  }));
}

function mapRules(rules: any[] | undefined, visit: Visit): any[] | undefined {
  return rules?.map((rule) => ({
    ...rule,
    ...(rule.set ? { set: mapRuleSet(rule.set, visit) } : {}),
    ...(rule.cases ? { cases: rule.cases.map((c: any) => ({ ...c, set: mapRuleSet(c.set, visit) })) } : {}),
    ...(rule.else ? { else: mapRuleSet(rule.else, visit) } : {}),
  }));
}

/** Table styles: colours in each section and the grid line colour. */
function mapTableStyles(styles: Record<string, any> | undefined, visit: Visit): Record<string, any> | undefined {
  if (!styles) return styles;
  const next: Record<string, any> = { ...styles };
  for (const part of ["header", "body", "alternateRow", "footer"]) if (styles[part]) next[part] = mapStyle(styles[part], visit);
  if (styles.grid?.color !== undefined) next.grid = { ...styles.grid, color: visit(styles.grid.color, "colors") };
  return next;
}

function mapOwner<T extends Record<string, any>>(owner: T, visit: Visit): T {
  const next: Record<string, any> = { ...owner };
  if (owner.type === "table" && owner.styles) next.styles = mapTableStyles(owner.styles, visit);
  if (owner.style) next.style = mapStyle(owner.style, visit);
  if (owner.gap !== undefined) next.gap = visit(owner.gap, "spacing");
  if (owner.styleWhen) next.styleWhen = owner.styleWhen.map((r: any) => ({ ...r, style: mapStyle(r.style, visit) }));
  if (owner.rowStyleWhen) next.rowStyleWhen = owner.rowStyleWhen.map((r: any) => ({ ...r, style: mapStyle(r.style, visit) }));
  if (owner.rules) next.rules = mapRules(owner.rules, visit);
  for (const key of CHILD_KEYS) if (Array.isArray(owner[key])) next[key] = owner[key].map((child: any) => mapOwner(child, visit));
  return next as T;
}

/** Applies `visit` to every token-capable value in the report: components, bands, fragments and the theme's text styles. */
function mapDoc(doc: Doc, visit: Visit): Doc {
  return {
    ...doc,
    sections: (doc.sections ?? []).map((section: any) => mapOwner(section, visit)),
    ...(doc.fragments ? { fragments: doc.fragments.map((fragment: any) => mapOwner(fragment, visit)) } : {}),
    ...(doc.theme ? { theme: {
      ...doc.theme,
      ...(doc.theme.textStyles ? { textStyles: Object.fromEntries(Object.entries(doc.theme.textStyles).map(([name, style]) => [name, mapStyle(style, visit)])) } : {}),
      ...(doc.theme.tableStyles ? { tableStyles: Object.fromEntries(Object.entries(doc.theme.tableStyles).map(([name, styles]) => [name, mapTableStyles(styles as Record<string, any>, visit)])) } : {}),
    } } : {}),
  };
}

/** Renames a token and every `$old` reference of that kind; references of other kinds with the same name are untouched. */
export function renameToken(doc: Doc, category: TokenCategory, from: string, to: string): Doc {
  const theme = doc.theme ?? {};
  const table = { ...(theme[category] ?? {}) } as Record<string, unknown>;
  if (!(from in table) || from === to) return doc;
  const renamedTable = Object.fromEntries(Object.entries(table).map(([key, value]) => [key === from ? to : key, value]));
  const rewritten = mapDoc(doc, (value, kind) => (kind === category && value === `$${from}` ? `$${to}` : value));
  return { ...rewritten, theme: { ...(rewritten.theme ?? theme), [category]: renamedTable } };
}

/** How many values in the report reference a token. */
export function countTokenUses(doc: Doc, category: TokenCategory, name: string): number {
  let uses = 0;
  mapDoc(doc, (value, kind) => {
    if (kind === category && value === `$${name}`) uses++;
    return value;
  });
  return uses;
}

/** Renames a text style and the components (and rules) that use it. */
export function renameTextStyle(doc: Doc, from: string, to: string): Doc {
  const styles = doc.theme?.textStyles ?? {};
  if (!(from in styles) || from === to) return doc;
  const rename = (owner: any): any => {
    const next = { ...owner };
    if (owner.textStyle === from) next.textStyle = to;
    if (owner.rules) next.rules = owner.rules.map((rule: any) => {
      const fix = (set: Record<string, unknown>) => (set.textStyle === from ? { ...set, textStyle: to } : set);
      return { ...rule, ...(rule.set ? { set: fix(rule.set) } : {}), ...(rule.cases ? { cases: rule.cases.map((c: any) => ({ ...c, set: fix(c.set) })) } : {}), ...(rule.else ? { else: fix(rule.else) } : {}) };
    });
    for (const key of CHILD_KEYS) if (Array.isArray(owner[key])) next[key] = owner[key].map(rename);
    return next;
  };
  return {
    ...doc,
    sections: (doc.sections ?? []).map(rename),
    ...(doc.fragments ? { fragments: doc.fragments.map(rename) } : {}),
    theme: { ...doc.theme, textStyles: Object.fromEntries(Object.entries(styles).map(([key, value]) => [key === from ? to : key, value])) },
  };
}

export function countTextStyleUses(doc: Doc, name: string): number {
  let uses = 0;
  const visit = (owner: any) => {
    if (owner.textStyle === name) uses++;
    for (const rule of owner.rules ?? []) for (const set of [rule.set, rule.else, ...(rule.cases ?? []).map((c: any) => c.set)]) if (set?.textStyle === name) uses++;
    for (const key of CHILD_KEYS) if (Array.isArray(owner[key])) owner[key].forEach(visit);
  };
  (doc.sections ?? []).forEach(visit);
  (doc.fragments ?? []).forEach(visit);
  return uses;
}

/** The text-related part of a component's style, to save as a reusable text style. */
export function textStyleFromStyle(style: Record<string, unknown> | undefined): Record<string, unknown> {
  return Object.fromEntries(Object.entries(style ?? {}).filter(([key]) => TEXT_PROPERTIES.includes(key)));
}

export const TOKEN_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;

/** Renames a table style preset and the tables that use it. */
export function renameTableStyle(doc: Doc, from: string, to: string): Doc {
  const presets = doc.theme?.tableStyles ?? {};
  if (!(from in presets) || from === to) return doc;
  const rename = (owner: any): any => {
    const next = { ...owner };
    if (owner.type === "table" && owner.tableStyle === from) next.tableStyle = to;
    for (const key of CHILD_KEYS) if (Array.isArray(owner[key])) next[key] = owner[key].map(rename);
    return next;
  };
  return {
    ...doc,
    sections: (doc.sections ?? []).map(rename),
    ...(doc.fragments ? { fragments: doc.fragments.map(rename) } : {}),
    theme: { ...doc.theme, tableStyles: Object.fromEntries(Object.entries(presets).map(([key, value]) => [key === from ? to : key, value])) },
  };
}

export function countTableStyleUses(doc: Doc, name: string): number {
  let uses = 0;
  const visit = (owner: any) => {
    if (owner.type === "table" && owner.tableStyle === name) uses++;
    for (const key of CHILD_KEYS) if (Array.isArray(owner[key])) owner[key].forEach(visit);
  };
  (doc.sections ?? []).forEach(visit);
  (doc.fragments ?? []).forEach(visit);
  return uses;
}
