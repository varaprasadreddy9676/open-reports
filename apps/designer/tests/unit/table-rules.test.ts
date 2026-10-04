import { describe, expect, it } from "vitest";
import { cardToRule, columnHideCondition, migratedRowRules, ruleToCard, withColumnHideCondition } from "../../src/lib/table-rules";

describe("table rule cards", () => {
  it("round-trip a row rule with style and hide", () => {
    const rule = { when: "row.amount < 0", set: { "style.color": "#b91c1c", "style.fontWeight": "bold", visible: false } };
    const card = ruleToCard(rule)!;
    expect(card).toEqual({ when: "row.amount < 0", style: { color: "#b91c1c", fontWeight: "bold" }, hide: true });
    expect(cardToRule(card)).toEqual(rule);
  });

  it("round-trip a cell rule with replacement text, dropping empty values", () => {
    const card = { when: "value == 0", style: { color: undefined, background: "#fef9c3" }, text: "—" };
    expect(cardToRule(card)).toEqual({ when: "value == 0", set: { "style.background": "#fef9c3", text: "—" } });
    expect(ruleToCard(cardToRule(card))).toEqual({ when: "value == 0", style: { background: "#fef9c3" }, text: "—" });
  });

  it("leave rules the card cannot show to the code view", () => {
    expect(ruleToCard({ cases: [{ when: "true", set: { "style.color": "#000000" } }] } as any)).toBeNull();
    expect(ruleToCard({ when: { field: "row.a", op: "==", value: 1 }, set: {} } as any)).toBeNull();
    expect(ruleToCard({ when: "true", set: { text: { expr: "upper(value)" } } } as any)).toBeNull();
    expect(ruleToCard({ when: "true", set: { "style.color": "#000" }, else: { "style.color": "#fff" } } as any)).toBeNull();
  });
});

describe("legacy rowStyleWhen", () => {
  it("becomes row rules that run first, in order", () => {
    const table = { rowStyleWhen: [{ when: "row.flag == \"H\"", style: { color: "#b91c1c" } }], rowRules: [{ when: "true", set: { "style.italic": true } }] };
    expect(migratedRowRules(table)).toEqual([
      { when: "row.flag == \"H\"", set: { "style.color": "#b91c1c" } },
      { when: "true", set: { "style.italic": true } },
    ]);
    expect(migratedRowRules({})).toEqual([]);
  });
});

describe("column visibility", () => {
  it("reads and writes the hide condition next to cell rules", () => {
    const column = { id: "cost", rules: [{ when: "value < 0", set: { "style.color": "#b91c1c" } }] };
    const hidden = withColumnHideCondition(column, "!params.showCost");
    expect(hidden.rules).toEqual([{ when: "value < 0", set: { "style.color": "#b91c1c" } }, { when: "!params.showCost", set: { visible: false } }]);
    expect(columnHideCondition(hidden)).toBe("!params.showCost");
    expect(withColumnHideCondition(hidden, "").rules).toEqual([{ when: "value < 0", set: { "style.color": "#b91c1c" } }]);
    const plain: { id: string; rules?: [] } = { id: "x" };
    expect(withColumnHideCondition(plain, "").rules).toBeUndefined();
  });
});
