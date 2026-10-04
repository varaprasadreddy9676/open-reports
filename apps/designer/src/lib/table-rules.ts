/** Converts table rules (universal rule shape) to the simple If/Then cards the Table Designer edits, and back. */

export type TableRule = { when: unknown; set: Record<string, unknown>; else?: Record<string, unknown>; cases?: unknown; [key: string]: unknown };
export interface RuleCard {
  when: string;
  style: Record<string, unknown>;
  /** Row cards: leave the row out. */
  hide?: boolean;
  /** Cell cards: print this text instead of the value. */
  text?: string;
}

const isLiteral = (value: unknown) => value === null || ["string", "number", "boolean"].includes(typeof value);

/** The card for a rule, or null when the rule uses features a card cannot show (cases, else, structured or computed values). */
export function ruleToCard(rule: TableRule): RuleCard | null {
  if (rule.cases || rule.else || typeof rule.when !== "string" || !rule.set) return null;
  const card: RuleCard = { when: rule.when, style: {} };
  for (const [key, value] of Object.entries(rule.set)) {
    if (!isLiteral(value)) return null;
    if (key.startsWith("style.") && !key.slice(6).includes(".")) card.style[key.slice(6)] = value;
    else if (key === "visible" && value === false) card.hide = true;
    else if (key === "text" && typeof value === "string") card.text = value;
    else return null;
  }
  return card;
}

export function cardToRule(card: RuleCard): TableRule {
  const set: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(card.style)) if (value !== undefined && value !== "") set[`style.${key}`] = value;
  if (card.hide) set.visible = false;
  if (card.text !== undefined) set.text = card.text;
  return { when: card.when, set };
}

/** Row rules with the legacy rowStyleWhen converted and placed first, which is the order the engine applies them in. */
export function migratedRowRules(table: { rowStyleWhen?: { when: string; style: Record<string, unknown> }[]; rowRules?: TableRule[] }): TableRule[] {
  const legacy = (table.rowStyleWhen ?? []).map((rule) => cardToRule({ when: rule.when, style: rule.style }));
  return [...legacy, ...(table.rowRules ?? [])];
}

const isHideRule = (rule: TableRule) => typeof rule.when === "string" && !rule.cases && !rule.else && Object.keys(rule.set ?? {}).length === 1 && rule.set.visible === false;

/** The condition that hides a column, as written by withColumnHideCondition. */
export function columnHideCondition(column: { rules?: TableRule[] }): string {
  return (column.rules?.find(isHideRule)?.when as string | undefined) ?? "";
}

/** Sets (or, with an empty condition, removes) the rule that hides the whole column. */
export function withColumnHideCondition<T extends { rules?: TableRule[] }>(column: T, condition: string): T {
  const others = (column.rules ?? []).filter((rule) => !isHideRule(rule));
  const rules = condition.trim() ? [...others, { when: condition.trim(), set: { visible: false } }] : others;
  return { ...column, rules: rules.length ? rules : undefined };
}
