import { describe, expect, it } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, InlineDataSource, resolveReport, validateReport } from "../src/index.js";
import { sectionChildren } from "./helpers.js";

const rows = [
  { name: "Glucose", flag: "H", value: 180, note: "" },
  { name: "Sodium", flag: "N", value: 140, note: "fasting" },
  { name: "Potassium", flag: "L", value: 3.1, note: null },
];

function report(sections: unknown[], extra: Record<string, unknown> = {}) {
  const parsed = parseReportDefinition({
    schemaVersion: "1.0", id: "rules", name: "Rules",
    parameters: [{ id: "showNotes", type: "boolean", default: true }, { id: "patientType", type: "string", default: "OP" }],
    datasets: [{ id: "results", source: "inline", query: { data: rows } }],
    sections,
    ...extra,
  });
  if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
  return parsed.report;
}

function registry() {
  const r = new DataSourceRegistry();
  r.register(new InlineDataSource());
  return r;
}

const repeater = (children: unknown[], rules?: unknown[]) => ({ type: "repeater", id: "rows", dataset: "results", children: [{ type: "container", id: "row", children, ...(rules ? { rules } : {}) }] });
const texts = (components: any[]): any[] => components.flatMap((c: any) => (c.type === "text" ? [c] : texts(c.children ?? [])));

describe("component rules", () => {
  it("sets style properties per row from a structured condition, IF / ELSE IF / ELSE", async () => {
    const out = await resolveReport(report([{ type: "detail", children: [repeater([{
      type: "text", id: "value", binding: "row.name",
      rules: [{ name: "Flag colour", cases: [
        { when: { field: "row.flag", op: "==", value: "H" }, set: { "style.color": "#c00000", "style.bold": true } },
        { when: { field: "row.flag", op: "==", value: "L" }, set: { "style.color": "#0040c0" } },
      ], else: { "style.color": "#111111" } }],
    }])] }]), { registry: registry() });
    const styles = texts(sectionChildren(out.resolved, 0)).map((t) => [t.text, t.style?.color, t.style?.bold]);
    expect(styles).toEqual([["Glucose", "#c00000", true], ["Sodium", "#111111", undefined], ["Potassium", "#0040c0", undefined]]);
  });

  it("hides a component with the virtual visible property, using all / any / not", async () => {
    const out = await resolveReport(report([{ type: "detail", children: [repeater([
      { type: "text", id: "name", binding: "row.name" },
      { type: "text", id: "note", binding: "row.note", rules: [{
        when: { any: [{ not: { field: "row.note", op: "isNotEmpty" } }, { all: ["!params.showNotes", "true"] }] },
        set: { visible: false },
      }] },
    ])] }]), { registry: registry() });
    expect(texts(sectionChildren(out.resolved, 0)).map((t) => t.text)).toEqual(["Glucose", "Sodium", "fasting", "Potassium"]);
  });

  it("replaces content: a literal value clears the binding, and expression values are computed", async () => {
    const out = await resolveReport(report([{ type: "detail", children: [repeater([
      { type: "text", id: "label", binding: "row.name", rules: [
        { when: "row.flag == 'H'", set: { value: "HIGH" } },
        { when: "row.flag == 'L'", set: { value: { expr: "'Low: ' + row.name" } } },
      ] },
    ])] }]), { registry: registry() });
    expect(texts(sectionChildren(out.resolved, 0)).map((t) => t.text)).toEqual(["HIGH", "Sodium", "Low: Potassium"]);
  });

  it("applies rules in order so a later matching rule wins", async () => {
    const out = await resolveReport(report([{ type: "detail", children: [{ type: "text", id: "t", value: "x", rules: [
      { when: "true", set: { "style.color": "#111111", "style.fontSize": 9 } },
      { when: "params.patientType == 'OP'", set: { "style.color": "#222222" } },
      { when: "false", set: { "style.color": "#333333" } },
      { when: "true", disabled: true, set: { "style.color": "#444444" } },
    ] }] }]), { registry: registry() });
    const [text] = texts(sectionChildren(out.resolved, 0));
    expect(text.style).toMatchObject({ color: "#222222", fontSize: 9 });
  });

  it("overrides pagination properties that layout reads", async () => {
    const out = await resolveReport(report([{ type: "detail", children: [
      { type: "text", id: "summary", value: "Summary", rules: [{ when: "params.patientType == 'OP'", set: { pageBreakBefore: true, keepWithNext: true } }] },
    ] }]), { registry: registry() });
    const [text] = texts(sectionChildren(out.resolved, 0));
    expect(text.pageBreakBefore).toBe(true);
    expect(text.keepWithNext).toBe(true);
  });

  it("supports every comparison operator", async () => {
    const cases: [string, unknown, boolean][] = [
      ["!=", "N", true], [">", 150, true], [">=", 180, true], ["<", 200, true], ["<=", 179, false],
      ["contains", "luc", true], ["notContains", "luc", false], ["startsWith", "Glu", true], ["endsWith", "ose", true],
      ["in", ["Glucose", "Urea"], true], ["notIn", ["Glucose"], false], ["isEmpty", undefined, false], ["isNotEmpty", undefined, true],
    ];
    for (const [op, value, expected] of cases) {
      const field = op === ">" || op === ">=" || op === "<" || op === "<=" ? "row.value" : op === "!=" ? "row.flag" : "row.name";
      const out = await resolveReport(report([{ type: "detail", children: [{ type: "repeater", dataset: "results", children: [
        { type: "text", binding: "row.name", rules: [{ when: { field, op, value }, set: { "style.color": "#ff0000" } }] },
      ] }] }]), { registry: registry() });
      const first = texts(sectionChildren(out.resolved, 0))[0];
      expect([op, first.style?.color === "#ff0000"]).toEqual([op, expected]);
    }
  });

  it("skips a rule whose condition fails to evaluate and reports where", async () => {
    const out = await resolveReport(report([{ type: "detail", children: [
      { type: "text", id: "t", value: "x", rules: [{ id: "bad", when: "unknownFn(1)", set: { "style.color": "#ff0000" } }] },
    ] }]), { registry: registry() });
    const [text] = texts(sectionChildren(out.resolved, 0));
    expect(text.style?.color).toBeUndefined();
    expect(out.resolved.warnings.find((w) => w.code === "RULE_CONDITION_FAILED")).toMatchObject({ componentId: "t" });
  });
});

describe("band rules", () => {
  it("hides a band and changes its pagination per instance", async () => {
    const out = await resolveReport(report([
      { type: "reportHeader", id: "ip-only", rules: [{ when: "params.patientType != 'IP'", set: { visible: false } }], children: [{ type: "text", value: "Inpatient details" }] },
      { type: "detail", id: "body", rules: [{ when: "params.patientType == 'OP'", set: { newPageBefore: true, keepTogether: true } }], children: [{ type: "text", value: "Body" }] },
    ]), { registry: registry() });
    expect(sectionChildren(out.resolved, 0)).toEqual([]);
    const body = out.resolved.sections.find((s) => s.type === "body")!;
    const band: any = body.children.find((c: any) => c.id === "body");
    expect(band.pageBreakBefore).toBe(true);
    expect(band.keepTogether).toBe(true);
  });
});

describe("page-phase rules", () => {
  it("are decided per page in page footers, with isFirst / isLast / isOdd / isEven", async () => {
    const out = await resolveReport(report([
      { type: "pageFooter", children: [{ type: "text", id: "sign", value: "Signature", rules: [{ when: "!page.isLast", set: { visible: false } }] },
        { type: "text", id: "odd", value: "odd", rules: [{ when: "page.isOdd && !page.isFirst", set: { value: "odd, not first" } }] }] },
      { type: "detail", children: [{ type: "text", value: "Body" }] },
    ]), { registry: registry() });
    const footer = out.resolved.sections.find((s) => s.type === "pageFooter")!;
    const onPage = (number: number, total: number) => texts(out.resolvePageSection(footer, { number, total })).map((t) => t.text);
    expect(onPage(1, 3)).toEqual(["odd"]);
    expect(onPage(2, 3)).toEqual(["odd"]);
    expect(onPage(3, 3)).toEqual(["Signature", "odd, not first"]);
  });
});

describe("legacy conditions keep their behaviour", () => {
  it("still applies visibleWhen and styleWhen, including fail-open visibility", async () => {
    const out = await resolveReport(report([{ type: "detail", children: [{ type: "repeater", dataset: "results", children: [
      { type: "text", binding: "row.name", visibleWhen: "row.flag != 'N'", styleWhen: [{ when: "row.flag == 'H'", style: { color: "#c00000" } }] },
      { type: "text", value: "shown", visibleWhen: "unknownFn()" },
    ] }] }]), { registry: registry() });
    expect(texts(sectionChildren(out.resolved, 0)).map((t) => [t.text, t.style?.color])).toEqual([
      ["Glucose", "#c00000"], ["shown", undefined], ["shown", undefined], ["Potassium", undefined], ["shown", undefined],
    ]);
  });
});

describe("rule decisions (explainability)", () => {
  it("records each clause, its current value, the matched case and what was applied, including hidden components", async () => {
    const out = await resolveReport(report([{ type: "detail", children: [
      { type: "text", id: "insurance", value: "Insurance approval", rules: [{ name: "Insurance only", when: { all: [{ field: "params.patientType", op: "==", value: "INSURANCE" }, "params.showNotes"] }, set: {}, else: { visible: false } }] },
      { type: "text", id: "legacy", value: "Legacy", visibleWhen: "params.patientType == 'IP'" },
    ] }]), { registry: registry(), traceRules: true });
    expect(texts(sectionChildren(out.resolved, 0))).toEqual([]);
    const insurance = out.ruleDecisions.find((d) => d.target.id === "insurance")!;
    expect(insurance).toMatchObject({ source: "rules", rule: { index: 0, name: "Insurance only" }, phase: "data", matched: "else", applied: { visible: false } });
    expect(insurance.cases[0]!.condition).toMatchObject({
      kind: "all", result: false,
      children: [{ kind: "compare", label: "params.patientType == \"INSURANCE\"", value: "OP", result: false }, { kind: "expression", label: "params.showNotes", value: true, result: true }],
    });
    expect(out.ruleDecisions.find((d) => d.target.id === "legacy")).toMatchObject({ source: "visibleWhen", matched: "else", applied: { visible: false } });
  });

  it("records nothing unless tracing is requested", async () => {
    const out = await resolveReport(report([{ type: "detail", children: [{ type: "text", value: "x", rules: [{ when: "true", set: { visible: false } }] }] }]), { registry: registry() });
    expect(out.ruleDecisions).toEqual([]);
  });
});

describe("rule validation", () => {
  const issuesFor = (component: Record<string, unknown>, sectionType = "detail") =>
    validateReport(report([{ type: sectionType, children: [component] }])).issues.map((i) => [i.code, i.path]);

  it("accepts valid targets and rejects unknown paths, wrong literal types and reserved targets at the exact rule", () => {
    expect(issuesFor({ type: "text", value: "x", rules: [{ when: "true", set: { "style.color": "#fff", visible: false, value: { expr: "1 + 1" }, keepTogether: true } }] })).toEqual([]);
    expect(issuesFor({ type: "text", value: "x", rules: [{ when: "true", set: { "style.colr": "#fff" } }] })).toEqual([["RULE_UNKNOWN_TARGET", "sections[0].children[0].rules[0].set.style.colr"]]);
    expect(issuesFor({ type: "text", value: "x", rules: [{ when: "true", set: { "style.fontSize": "big" } }] })).toEqual([["RULE_INVALID_VALUE", "sections[0].children[0].rules[0].set.style.fontSize"]]);
    expect(issuesFor({ type: "text", value: "x", rules: [{ when: "true", set: { id: "other" } }] })).toEqual([["RULE_RESERVED_TARGET", "sections[0].children[0].rules[0].set.id"]]);
    expect(issuesFor({ type: "text", value: "x", rules: [{ cases: [{ when: "row.(", set: {} }] }] })).toEqual([["INVALID_EXPRESSION", "sections[0].children[0].rules[0].cases[0].when"]]);
  });

  it("rejects page-dependent rules where pages are not known yet, and output/print phases that are not supported", () => {
    expect(issuesFor({ type: "text", value: "x", rules: [{ when: "page.isLast", set: { visible: false } }] })).toEqual([["RULE_PHASE_UNSUPPORTED", "sections[0].children[0].rules[0]"]]);
    expect(issuesFor({ type: "text", value: "x", rules: [{ when: "page.isLast", set: { visible: false } }] }, "pageFooter")).toEqual([]);
    expect(issuesFor({ type: "text", value: "x", rules: [{ when: "true", phase: "print", set: { visible: false } }] }, "pageFooter")).toEqual([["RULE_PHASE_UNSUPPORTED", "sections[0].children[0].rules[0]"]]);
    expect(issuesFor({ type: "text", value: "x", rules: [{ when: "page.isLast", phase: "data", set: { visible: false } }] }, "pageFooter")).toEqual([["RULE_PHASE_TOO_EARLY", "sections[0].children[0].rules[0]"]]);
  });
});
