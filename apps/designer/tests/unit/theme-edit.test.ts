import { describe, expect, it } from "vitest";
import { countTextStyleUses, countTokenUses, renameTextStyle, renameToken, textStyleFromStyle } from "../../src/lib/theme-edit";

const doc = (): any => ({
  theme: {
    colors: { brand: "#1d4ed8", sm: "#ffffff" },
    fontSizes: { sm: 8 },
    spacing: { sm: 4 },
    textStyles: { title: { color: "$brand", fontSize: "$sm" }, note: { color: "$sm" } },
  },
  sections: [{
    type: "detail", gap: "$sm", style: { background: "$brand", padding: { top: "$sm", left: 2 } },
    children: [
      { id: "a", type: "text", textStyle: "title", style: { color: "$brand", fontSize: "$sm", border: { width: 1, style: "solid", color: "$brand" } } },
      { id: "b", type: "container", gap: "$sm", children: [{ id: "c", type: "text", style: { margin: "$sm", color: "$sm" }, styleWhen: [{ when: "true", style: { color: "$brand" } }] }] },
      { id: "d", type: "text", rules: [{ when: "true", set: { "style.color": "$brand", textStyle: "title" }, else: { "style.fontSize": "$sm", gap: "$sm" } }] },
    ],
  }],
});

describe("theme editing", () => {
  it("renames a colour token everywhere it is used as a colour, and nowhere else", () => {
    const next = renameToken(doc(), "colors", "brand", "primary");
    expect(next.theme.colors).toEqual({ primary: "#1d4ed8", sm: "#ffffff" });
    expect(next.theme.textStyles.title.color).toBe("$primary");
    const json = JSON.stringify(next);
    expect(json).not.toContain("$brand");
    expect(countTokenUses(next, "colors", "primary")).toBe(6);
    // "$sm" as a font size and as spacing stays put.
    expect(next.sections[0].children[0].style.fontSize).toBe("$sm");
    expect(next.sections[0].gap).toBe("$sm");
  });

  it("renames a spacing token without touching a colour or font size token of the same name", () => {
    const next = renameToken(doc(), "spacing", "sm", "small");
    expect(next.sections[0].gap).toBe("$small");
    expect(next.sections[0].style.padding).toEqual({ top: "$small", left: 2 });
    expect(next.sections[0].children[1].gap).toBe("$small");
    expect(next.sections[0].children[1].children[0].style).toMatchObject({ margin: "$small", color: "$sm" });
    expect(next.sections[0].children[2].rules[0].else).toEqual({ "style.fontSize": "$sm", gap: "$small" });
    expect(next.theme.textStyles.note.color).toBe("$sm");
    expect(countTokenUses(doc(), "spacing", "sm")).toBe(5);
    expect(countTokenUses(doc(), "fontSizes", "sm")).toBe(3);
  });

  it("renames a text style and its uses, including in rules", () => {
    expect(countTextStyleUses(doc(), "title")).toBe(2);
    const next = renameTextStyle(doc(), "title", "heading");
    expect(Object.keys(next.theme.textStyles)).toEqual(["heading", "note"]);
    expect(next.sections[0].children[0].textStyle).toBe("heading");
    expect(next.sections[0].children[2].rules[0].set.textStyle).toBe("heading");
  });

  it("captures only text properties as a text style", () => {
    expect(textStyleFromStyle({ fontSize: 12, fontWeight: "bold", color: "#111", background: "#eee", padding: 4 })).toEqual({ fontSize: 12, fontWeight: "bold", color: "#111" });
  });
});
