import { describe, expect, it } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, resolveReport, validateReport } from "../src/index.js";
import { sectionChildren } from "./helpers.js";

const theme = {
  colors: { brand: "#1d4ed8", danger: "#b91c1c", muted: "#64748b" },
  fonts: { heading: "Noto Serif", body: "Noto Sans" },
  fontSizes: { sm: 8, md: 10, xl: 18 },
  spacing: { xs: 2, sm: 4, md: 8 },
  textStyles: {
    title: { fontFamily: "$heading", fontSize: "$xl", fontWeight: "bold", color: "$brand" },
    caption: { fontSize: "$sm", color: "$muted", italic: true },
  },
};

function report(sections: unknown[], extra: Record<string, unknown> = {}) {
  const parsed = parseReportDefinition({ schemaVersion: "1.0", id: "themed", name: "Themed", theme, sections, ...extra });
  if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
  return parsed.report;
}
const registry = new DataSourceRegistry();
const first = async (component: Record<string, unknown>, sectionExtra: Record<string, unknown> = {}) => {
  const out = await resolveReport(report([{ type: "detail", ...sectionExtra, children: [component] }]), { registry });
  return { node: sectionChildren(out.resolved, 0)[0] as any, out };
};

describe("theme tokens and text styles", () => {
  it("applies a named text style with its tokens resolved, under the component's own style", async () => {
    const { node } = await first({ type: "text", value: "Quarterly report", textStyle: "title", style: { color: "#000000" } });
    expect(node.style).toEqual({ fontFamily: "Noto Serif", fontSize: 18, fontWeight: "bold", color: "#000000" });
  });

  it("resolves colour, font, size and spacing tokens anywhere in a style", async () => {
    const { node } = await first({ type: "container", gap: "$md", style: { background: "$brand", padding: "$sm", margin: { top: "$xs", right: 0, bottom: "$md", left: 0 }, border: { width: 1, style: "solid", color: "$danger" } }, children: [
      { type: "text", value: "x", style: { color: "$muted", fontFamily: "$body", fontSize: "$md" } },
    ] });
    expect(node.gap).toBe(8);
    expect(node.style).toEqual({ background: "#1d4ed8", padding: 4, margin: { top: 2, right: 0, bottom: 8, left: 0 }, border: { width: 1, style: "solid", color: "#b91c1c" } });
    expect(node.children[0].style).toEqual({ color: "#64748b", fontFamily: "Noto Sans", fontSize: 10 });
  });

  it("resolves tokens set by rules and legacy styleWhen", async () => {
    const { node } = await first({ type: "text", value: "x", textStyle: "caption",
      rules: [{ when: "true", set: { "style.color": "$danger", textStyle: "title" } }],
      styleWhen: [{ when: "true", style: { background: "$brand" } }] });
    // The rule switches the text style to "title" and sets a colour token that wins over the style's own colour.
    expect(node.style).toMatchObject({ color: "#b91c1c", fontSize: 18, fontWeight: "bold", background: "#1d4ed8" });
  });

  it("resolves tokens in band styles and gaps", async () => {
    const out = await resolveReport(report([{ type: "detail", id: "band", gap: "$sm", style: { background: "$muted" }, children: [{ type: "text", value: "x" }] }]), { registry });
    const band: any = out.resolved.sections.find((s) => s.type === "body")!.children.find((c: any) => c.id === "band");
    expect(band.gap).toBe(4);
    expect(band.style).toEqual({ background: "#64748b" });
  });

  it("drops an unknown token with a warning instead of passing it to a renderer", async () => {
    const { node, out } = await first({ type: "text", id: "t", value: "x", style: { color: "$nope", fontSize: 9 } });
    expect(node.style).toEqual({ fontSize: 9 });
    expect(out.resolved.warnings.find((w) => w.code === "THEME_UNKNOWN_TOKEN")).toMatchObject({ componentId: "t" });
  });
});

describe("theme validation", () => {
  const codes = (component: Record<string, unknown>, themeOverride?: unknown) =>
    validateReport(report([{ type: "detail", children: [component] }], themeOverride ? { theme: themeOverride } : {})).issues.map((i) => [i.code, i.path]);

  it("reports unknown tokens, unknown text styles and tokens of the wrong kind at their exact path", () => {
    expect(codes({ type: "text", value: "x", textStyle: "title", style: { color: "$brand", padding: "$sm" } })).toEqual([]);
    expect(codes({ type: "text", value: "x", style: { color: "$brnd" } })).toEqual([["THEME_UNKNOWN_TOKEN", "sections[0].children[0].style.color"]]);
    expect(codes({ type: "text", value: "x", style: { fontSize: "$brand" } })).toEqual([["THEME_UNKNOWN_TOKEN", "sections[0].children[0].style.fontSize"]]);
    expect(codes({ type: "text", value: "x", textStyle: "headline" })).toEqual([["THEME_UNKNOWN_TEXT_STYLE", "sections[0].children[0].textStyle"]]);
    expect(codes({ type: "text", value: "x", rules: [{ when: "true", set: { "style.color": "$nope", textStyle: "nope" } }] })).toEqual([
      ["THEME_UNKNOWN_TOKEN", "sections[0].children[0].rules[0].set.style.color"],
      ["THEME_UNKNOWN_TEXT_STYLE", "sections[0].children[0].rules[0].set.textStyle"],
    ]);
  });

  it("checks the theme's own text styles", () => {
    expect(codes({ type: "text", value: "x" }, { ...theme, textStyles: { bad: { color: "$missing" } } })).toEqual([["THEME_UNKNOWN_TOKEN", "theme.textStyles.bad.color"]]);
  });
});

describe("table styles", () => {
  const tableTheme = { ...theme, tableStyles: { ledger: { header: { background: "$brand", color: "#ffffff" }, alternateRow: { background: "#eef2ff" }, grid: { lines: "horizontal", color: "$muted" } } } };
  const resolveTable = async (table: Record<string, unknown>) => {
    const parsed = parseReportDefinition({ schemaVersion: "1.0", id: "t", name: "t", theme: tableTheme, datasets: [{ id: "d", source: "inline", query: { data: [{ a: 1 }] } }],
      sections: [{ type: "detail", children: [{ type: "table", dataset: "d", columns: [{ id: "a", header: "A", binding: "row.a" }], ...table }] }] });
    if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
    const registry2 = new DataSourceRegistry();
    const { InlineDataSource } = await import("../src/index.js");
    registry2.register(new InlineDataSource());
    return { node: sectionChildren((await resolveReport(parsed.report, { registry: registry2 })).resolved, 0)[0] as any, report: parsed.report };
  };

  it("merges defaults, a theme preset and the table's own styles, resolving tokens", async () => {
    const { node } = await resolveTable({ tableStyle: "ledger", styles: { header: { italic: true }, grid: { width: 1 } } });
    expect(node.styles).toEqual({
      header: { color: "#ffffff", fontWeight: "bold", background: "#1d4ed8", italic: true },
      body: { color: "#000000" },
      alternateRow: { background: "#eef2ff" },
      footer: { color: "#000000", fontWeight: "bold" },
      grid: { lines: "horizontal", color: "#64748b", width: 1 },
    });
  });

  it("leaves tables without table styles untouched", async () => {
    const { node } = await resolveTable({ alternateRowStyle: true });
    expect(node.styles).toBeUndefined();
  });

  it("validates preset names and table style tokens", async () => {
    const { report: bad } = await resolveTable({ tableStyle: "nope", styles: { body: { color: "$nope" } } });
    expect(validateReport(bad).issues.map((i) => [i.code, i.path])).toEqual([
      ["THEME_UNKNOWN_TOKEN", "sections[0].children[0].styles.body.color"],
      ["THEME_UNKNOWN_TABLE_STYLE", "sections[0].children[0].tableStyle"],
    ]);
  });
});
