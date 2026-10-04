import { describe, expect, it } from "vitest";
import { bandRefs, describeStructure } from "../src/bands.js";
import { applyPatch, resolvePointer, summarizeChanges } from "../src/patch.js";
import { TOOLS, AUTHORING_GUIDE } from "../src/tools.js";

const report = () => ({
  id: "r", name: "Sales",
  datasets: [{ id: "sales", source: "inline", query: { data: [] } }],
  groups: [{ id: "byRegion", dataset: "sales", by: "row.region", repeatHeader: true }],
  sections: [
    { type: "reportHeader", children: [{ type: "text", id: "title", value: "Sales" }] },
    { type: "pageHeader", children: [{ type: "text", id: "runningTitle", value: "Sales" }] },
    { type: "pageHeader", appliesTo: "first", children: [] },
    { type: "groupHeader", groupId: "byRegion", keepWithNext: true, children: [{ type: "text", id: "regionName", expression: "group.key" }] },
    { type: "detail", dataset: "sales", children: [{ type: "text", id: "amount", binding: "row.amount" }] },
    { type: "detail", dataset: "sales", children: [] },
    { type: "groupFooter", groupId: "byRegion", printAtBottom: true, children: [] },
    { type: "pageFooter", id: "footer", children: [{ type: "text", id: "pageNo", expression: "page.number" }] },
  ],
});

describe("band references", () => {
  it("name each band by type, then by group, page variant or occurrence", () => {
    expect(bandRefs(report().sections)).toEqual([
      "@reportHeader", "@pageHeader", "@pageHeader:first", "@groupHeader:byRegion", "@detail#1", "@detail#2", "@groupFooter:byRegion", "#footer",
    ]);
  });

  it("resolve in patch paths", () => {
    const doc = report();
    expect(resolvePointer(doc, "@groupFooter:byRegion/children/-")).toBe("/sections/6/children/-");
    expect(resolvePointer(doc, "@pageHeader:first/children")).toBe("/sections/2/children");
    expect(resolvePointer(doc, "@pageHeader")).toBe("/sections/1");
    expect(resolvePointer(doc, "@detail#2/keepTogether")).toBe("/sections/5/keepTogether");
    expect(resolvePointer(doc, "#footer/children/0")).toBe("/sections/7/children/0");
  });

  it("explain ambiguous or unknown references", () => {
    expect(() => resolvePointer(report(), "@detail/children/-")).toThrow(/2 detail bands.*@detail#1, @detail#2/);
    expect(() => resolvePointer(report(), "@groupHeader:byCity")).toThrow(/No groupHeader band.*@groupHeader:byRegion/);
    expect(() => resolvePointer(report(), "@summary")).toThrow(/No summary band/);
  });

  it("let a patch add content to a band and change its print rules", () => {
    const r = applyPatch(report(), [
      { op: "add", path: "@groupFooter:byRegion/children/-", value: { type: "text", expression: "sumBy(group.rows, \"amount\")" } },
      { op: "add", path: "@detail#1/keepTogether", value: true },
      { op: "remove", path: "@pageHeader:first" },
    ]);
    expect(r.ok).toBe(true);
    expect(r.doc.sections.find((s: any) => s.type === "groupFooter").children[0].id).toMatch(/^text-/);
    expect(r.doc.sections.filter((s: any) => s.type === "detail").map((s: any) => s.keepTogether)).toEqual([true, undefined]);
    expect(r.doc.sections).toHaveLength(7);
  });
});

describe("structure outline", () => {
  it("lists bands in order with their print rules, groups and component ids", () => {
    const text = describeStructure(report());
    expect(text).toContain("Groups: byRegion by row.region (dataset sales, repeats header)");
    const lines = text.split("\n");
    const band = lines.findIndex((l) => l.startsWith("@groupHeader:byRegion"));
    expect(lines[band]).toContain("group byRegion");
    expect(lines[band]).toContain("keepWithNext");
    expect(lines[band + 1]).toMatch(/^\s+#regionName \[text\] group\.key$/);
    expect(text).toMatch(/@groupFooter:byRegion .*printAtBottom/);
    expect(text).toMatch(/@detail#1 .*dataset sales/);
    expect(text).toMatch(/#footer \[pageFooter\]/);
  });
});

describe("change summaries", () => {
  it("report added, removed and changed bands", () => {
    const before = report();
    const after = applyPatch(before, [
      { op: "add", path: "/sections/-", value: { type: "reportFooter", children: [] } },
      { op: "replace", path: "@groupFooter:byRegion/printAtBottom", value: false },
      { op: "remove", path: "@pageHeader:first" },
    ]).doc;
    const changes = summarizeChanges(before, after);
    expect(changes).toEqual(expect.arrayContaining([
      "added band @reportFooter",
      "removed band @pageHeader:first",
      "changed band @groupFooter:byRegion: printAtBottom",
    ]));
  });
});

describe("tools", () => {
  it("offer describe_report and explain bands in the guide", async () => {
    const tool = TOOLS.find((t) => t.name === "describe_report")!;
    expect(tool.readOnly).toBe(true);
    const out = await tool.handler({ report: report() }, {} as any);
    expect(out.text).toContain("@groupHeader:byRegion");
    expect(AUTHORING_GUIDE).toContain("@groupFooter:");
    expect(AUTHORING_GUIDE).toMatch(/pageHeader.*appliesTo/s);
  });
});
