import { describe, it, expect } from "vitest";
import { buildContext, makeProposal, parseModelReply } from "../../src/lib/ai";

const doc: any = {
  schemaVersion: "1.0", id: "r", name: "R",
  datasets: [{ id: "p", source: "inline", query: { data: { name: "Alex Morgan", amount: 120.5 } } }],
  sections: [{ type: "detail", children: [{ type: "text", id: "title", value: "Hello", style: { fontSize: 12 } }, { type: "text", id: "who", binding: "data.p.name" }] }],
};

describe("parseModelReply", () => {
  it("accepts plain JSON, fenced JSON and JSON surrounded by prose", () => {
    const body = '{"explanation":"bigger","ops":[{"op":"replace","path":"#title/style/fontSize","value":20}]}';
    for (const text of [body, "```json\n" + body + "\n```", "Sure! Here you go:\n" + body + "\nHope that helps."]) {
      const r = parseModelReply(text);
      expect(r.ops).toHaveLength(1);
      expect(r.explanation).toBe("bigger");
    }
  });
  it("rejects replies that are not usable", () => {
    expect(() => parseModelReply("I cannot do that")).toThrow(/valid JSON/);
    expect(() => parseModelReply('{"explanation":"x"}')).toThrow(/ops/);
    expect(() => parseModelReply('{"ops":[{"op":"replace"}]}')).toThrow(/malformed/);
  });
});

describe("makeProposal", () => {
  it("applies ops to a copy, never the original, and lists changes", () => {
    const p = makeProposal("bigger", doc, ["title"], { explanation: "", ops: [{ op: "replace", path: "#title/style/fontSize", value: 20 }] });
    expect(p.doc.sections[0].children[0].style.fontSize).toBe(20);
    expect(doc.sections[0].children[0].style.fontSize).toBe(12);
    expect(p.changes[0]).toContain('"title"');
  });
  it("refuses an inapplicable patch instead of half-applying it", () => {
    expect(() => makeProposal("x", doc, [], { explanation: "", ops: [{ op: "replace", path: "#ghost/value", value: 1 }] })).toThrow(/Nothing was changed/);
  });
});

describe("buildContext privacy and scope", () => {
  it("never includes inline sample values, only field names and types", () => {
    const ctx = buildContext(doc, {}, [], []);
    expect(ctx).not.toContain("Alex Morgan");
    expect(ctx).not.toContain("120.5");
    expect(ctx).toContain("name:string");
    expect(ctx).toContain("amount:number");
  });
  it("selection scope includes the selected component JSON", () => {
    const ctx = buildContext(doc, {}, ["title"], [{ severity: "warning", message: "too wide", componentId: "title" }]);
    expect(ctx).toContain("SELECTED components");
    expect(ctx).toContain('"fontSize": 12');
    expect(ctx).toContain("too wide");
  });
});

describe("band awareness", () => {
  const banded: any = {
    ...doc,
    groups: [{ id: "byRegion", dataset: "p", by: "row.region" }],
    sections: [
      { type: "groupHeader", groupId: "byRegion", keepWithNext: true, children: [{ type: "text", id: "region", expression: "group.key" }] },
      ...doc.sections,
      { type: "groupFooter", groupId: "byRegion", children: [] },
    ],
  };
  it("outlines bands in order with their references and components", () => {
    const ctx = buildContext(banded, {}, [], []);
    expect(ctx).toMatch(/@groupHeader:byRegion \[groupHeader\] group byRegion · keepWithNext\n\s+#region \[text\] group\.key/);
    expect(ctx).toContain("@detail [detail]");
    expect(ctx).toContain("@groupFooter:byRegion [groupFooter]");
  });
  it("sends a selected band in full, by reference", () => {
    const ctx = buildContext(banded, {}, [], [], 2);
    expect(ctx).toContain("SELECTED band @groupFooter:byRegion");
    expect(ctx).toContain('"groupId": "byRegion"');
  });
  it("lists band changes in a proposal", () => {
    const proposal = makeProposal("total per region", banded, [], { explanation: "", ops: [
      { op: "add", path: "@groupFooter:byRegion/children/-", value: { type: "text", expression: "count(group.rows)" } },
      { op: "add", path: "@groupFooter:byRegion/printAtBottom", value: true },
    ] });
    expect(proposal.changes).toEqual(expect.arrayContaining([expect.stringMatching(/^added text "text-\d+"$/), "changed band @groupFooter:byRegion: printAtBottom"]));
  });
});

