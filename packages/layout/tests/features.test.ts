import { describe, it, expect } from "vitest";
import type { ResolvedReport, ResolvedTableComponent } from "@reporting/core";
import { paginate, pickMaster } from "../src/paginate.js";
import { layoutFlow, layoutRow } from "../src/box-layout.js";
import { defaultTextMeasurer } from "../src/measure.js";

const text = (t: string, extra: Record<string, unknown> = {}) => ({ type: "text", text: t, ...extra }) as any;

function table(rows: number): ResolvedTableComponent {
  return {
    type: "table",
    id: "t",
    columns: [{ id: "n", header: "N" }],
    rows: Array.from({ length: rows }, (_, i) => ({ raw: { n: i }, formatted: { n: String(i) } })),
    showHeader: true,
    showFooter: false,
    repeatHeaderOnPageBreak: true,
    keepRowTogether: true,
  } as any;
}

function report(sections: ResolvedReport["sections"], height = 300): ResolvedReport {
  return {
    id: "r", name: "R", locale: "en", warnings: [], sections,
    page: { size: "custom", width: 300, height, unit: "pt", orientation: 300 > height ? "landscape" : "portrait", margin: { top: 0, right: 0, bottom: 0, left: 0 } } as any,
  };
}

describe("page masters", () => {
  const sections = [
    { type: "pageHeader", sourceIndex: 0, appliesTo: "first", children: [text("BIG LETTERHEAD", { style: { fontSize: 24 } })] },
    { type: "pageHeader", sourceIndex: 1, appliesTo: "standard", children: [text("small")] },
    { type: "pageFooter", sourceIndex: 2, appliesTo: "last", children: [text("signature and terms")] },
  ] as any[];

  it("picks the most specific master per page", () => {
    const headers = sections.filter((s) => s.type === "pageHeader");
    expect(pickMaster(headers, 1, 3)?.children[0].text).toBe("BIG LETTERHEAD");
    expect(pickMaster(headers, 2, 3)?.children[0].text).toBe("small");
    const footers = sections.filter((s) => s.type === "pageFooter");
    expect(pickMaster(footers, 3, 3)?.children[0].text).toBe("signature and terms");
    expect(pickMaster(footers, 2, 3)).toBeUndefined();
  });

  it("uses a different header on page 1 and a last-page footer only on the final page", () => {
    const r = paginate(report([...sections, { type: "detail", sourceIndex: 3, children: [table(40)] }]));
    expect(r.pages.length).toBeGreaterThan(2);
    expect((r.pages[0]!.header[0]!.component as any).text).toBe("BIG LETTERHEAD");
    expect((r.pages[1]!.header[0]!.component as any).text).toBe("small");
    const last = r.pages[r.pages.length - 1]!;
    expect((last.footer[0]!.component as any).text).toBe("signature and terms");
    expect(r.pages[1]!.footer).toHaveLength(0);
  });

  it("gives pages different body heights when their masters differ in height", () => {
    const r = paginate(report([...sections, { type: "detail", sourceIndex: 3, children: [table(40)] }]));
    expect(r.pages[0]!.zones.header.height).toBeGreaterThan(r.pages[1]!.zones.header.height);
  });
});

describe("auto-layout", () => {
  const box = { x: 0, y: 0, width: 300, height: 0 };

  it("flow honors gap and margins", () => {
    const { nodes, height } = layoutFlow([text("a"), text("b", { style: { margin: { top: 5, bottom: 5, left: 0, right: 0 } } })], box, defaultTextMeasurer, { gap: 10 });
    expect(nodes[1]!.box.y).toBeGreaterThanOrEqual(nodes[0]!.box.y + nodes[0]!.box.height + 10 + 5);
    expect(height).toBeGreaterThan(nodes[1]!.box.y + nodes[1]!.box.height - 1);
  });

  it("row splits remaining width by grow weight", () => {
    const { nodes } = layoutRow([text("a", { grow: 1 }), text("b", { grow: 3 })], box, defaultTextMeasurer);
    expect(nodes[1]!.box.width).toBeCloseTo(nodes[0]!.box.width * 3, 5);
  });

  it("row justifies fixed-width children with space-between", () => {
    const { nodes } = layoutRow([text("a", { width: 50 }), text("b", { width: 50 })], box, defaultTextMeasurer, { justifyContent: "space-between" });
    expect(nodes[0]!.box.x).toBe(0);
    expect(nodes[1]!.box.x + nodes[1]!.box.width).toBeCloseTo(300, 5);
  });

  it("row centers children vertically with alignItems", () => {
    const { nodes } = layoutRow([text("a", { width: 50, height: 40 }), text("b", { width: 50, height: 10 })], box, defaultTextMeasurer, { alignItems: "center" });
    expect(nodes[1]!.box.y).toBeCloseTo(15, 5);
  });

  it("clamps width with maxWidth", () => {
    const { nodes } = layoutRow([text("a", { maxWidth: 80 })], box, defaultTextMeasurer);
    expect(nodes[0]!.box.width).toBeLessThanOrEqual(80);
  });
});

describe("pagination decisions", () => {
  it("explains why a table continues and why a keepTogether block moved", () => {
    const r = paginate(report([{ type: "detail", sourceIndex: 0, children: [table(25), text("sig", { id: "sig", keepTogether: true, height: 120 })] }], 200));
    const kinds = r.decisions.map((d) => d.kind);
    expect(kinds).toContain("table-split");
    const split = r.decisions.find((d) => d.kind === "table-split")!;
    expect(split.message).toMatch(/needs .*but only .* left/);
    expect(split.componentId).toBe("t");
    expect(kinds.some((k) => k === "keep-together" || k === "cannot-split")).toBe(true);
    const keep = r.decisions.find((d) => d.componentId === "sig");
    expect(keep?.actions?.[0]?.patch).toEqual({ keepTogether: false });
  });
});
