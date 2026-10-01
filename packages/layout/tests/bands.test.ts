import { describe, it, expect } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, InlineDataSource, resolveReport } from "@reporting/core";
import { paginate } from "../src/paginate.js";
import type { PositionedNode } from "../src/types.js";

const registry = new DataSourceRegistry();
registry.register(new InlineDataSource());

const rows = (n: number, groups = 3) => Array.from({ length: n }, (_, i) => ({ id: i + 1, g: `G${(i % groups) + 1}`, h: `H${Math.floor(i / 4) % 2}`, n: 1 }));
const T = (t: string, extra: Record<string, unknown> = {}) => ({ type: "text", value: t, ...extra });
const B = (b: string, extra: Record<string, unknown> = {}) => ({ type: "text", binding: b, ...extra });
const X = (e: string) => ({ type: "text", expression: e });

async function run(def: { sections: unknown[]; groups?: unknown[]; data?: unknown; height?: number; extra?: object }) {
  const doc = {
    schemaVersion: "1.0", id: "b", name: "b",
    page: { size: "custom", width: 300, height: def.height ?? 300, unit: "pt", orientation: (def.height ?? 300) < 300 ? "landscape" : "portrait", margin: { top: 0, right: 0, bottom: 0, left: 0 } },
    datasets: [{ id: "d", source: "inline", query: { data: def.data ?? rows(9) } }],
    groups: def.groups ?? [],
    sections: def.sections,
    ...(def.extra ?? {}),
  };
  const p = parseReportDefinition(doc);
  if (!p.valid) throw new Error(JSON.stringify(p.issues));
  const r = await resolveReport(p.report, { registry, parameters: {} });
  const pag = paginate(r.resolved, { resolvePageDependentSection: r.resolvePageSection });
  return { pag, r };
}

function* all(nodes: PositionedNode[]): Generator<PositionedNode> {
  for (const n of nodes) {
    yield n;
    if (n.children) yield* all(n.children);
  }
}
const textsOf = (nodes: PositionedNode[]) => [...all(nodes)].map((n) => (n.component as any).text).filter((t) => typeof t === "string" && t !== "");
const pageTexts = (pag: Awaited<ReturnType<typeof run>>["pag"]) => pag.pages.map((p) => textsOf(p.content));
const flat = (pag: Awaited<ReturnType<typeof run>>["pag"]) => pageTexts(pag).flat();

describe("groups", () => {
  it("prints a header and footer once per group, sorted by the group expression, with group aggregates", async () => {
    const { pag } = await run({
      groups: [{ id: "g", dataset: "d", by: "row.g", sort: "desc" }],
      sections: [
        { type: "groupHeader", groupId: "g", children: [X('"HDR " + group.key')] },
        { type: "detail", dataset: "d", children: [B("row.id")] },
        { type: "groupFooter", groupId: "g", children: [X('"FTR " + group.key + " n=" + group.count + " sum=" + sumBy(group.rows, "id")')] },
      ],
    });
    expect(flat(pag)).toEqual(["HDR G3", "3", "6", "9", "FTR G3 n=3 sum=18", "HDR G2", "2", "5", "8", "FTR G2 n=3 sum=15", "HDR G1", "1", "4", "7", "FTR G1 n=3 sum=12"]);
  });

  it("nests groups: outer header, inner header, rows, inner footer ... outer footer", async () => {
    const { pag } = await run({
      data: [{ a: "A", b: "x", v: 1 }, { a: "A", b: "y", v: 2 }, { a: "B", b: "x", v: 3 }],
      groups: [{ id: "ga", dataset: "d", by: "row.a" }, { id: "gb", by: "row.b" }],
      sections: [
        { type: "groupHeader", groupId: "ga", children: [X('"A:" + group.key')] },
        { type: "groupHeader", groupId: "gb", children: [X('"b:" + group.key')] },
        { type: "detail", dataset: "d", children: [B("row.v")] },
        { type: "groupFooter", groupId: "gb", children: [X('"/b:" + group.key')] },
        { type: "groupFooter", groupId: "ga", children: [X('"/A:" + group.key + "(" + group.count + ")"')] },
      ],
    });
    expect(flat(pag)).toEqual(["A:A", "b:x", "1", "/b:x", "b:y", "2", "/b:y", "/A:A(2)", "A:B", "b:x", "3", "/b:x", "/A:B(1)"]);
  });

  it("legacy groupHeader with groupBy prints once per group (not once per row)", async () => {
    const { pag } = await run({
      sections: [
        { type: "groupHeader", dataset: "d", groupBy: "row.g", children: [B("row.g")] },
        { type: "detail", dataset: "d", children: [B("row.id")] },
        { type: "groupFooter", children: [T("--")] },
      ],
    });
    expect(flat(pag)).toEqual(["G1", "1", "4", "7", "--", "G2", "2", "5", "8", "--", "G3", "3", "6", "9", "--"]);
  });

  it("group-scoped variables aggregate only that group's rows", async () => {
    const { pag } = await run({
      groups: [{ id: "g", dataset: "d", by: "row.g" }],
      extra: { variables: [{ id: "gs", scope: "group", expression: 'sumBy(data.d, "id")' }] },
      sections: [{ type: "groupHeader", groupId: "g", children: [] }, { type: "detail", dataset: "d", children: [B("row.id")] }, { type: "groupFooter", groupId: "g", children: [X('"total " + vars.gs')] }],
    });
    expect(flat(pag).filter((t) => t.startsWith("total"))).toEqual(["total 12", "total 15", "total 18"]);
  });
});

describe("other bands", () => {
  it("noData replaces an empty region; dataHeader/dataFooter print once around records", async () => {
    const secs = [
      { type: "dataHeader", dataset: "d", children: [T("TABLE HEAD")] },
      { type: "detail", dataset: "d", children: [B("row.id")] },
      { type: "dataFooter", children: [X('"count " + data.d.length')] },
      { type: "noData", dataset: "d", children: [T("NOTHING TO SHOW")] },
    ];
    expect(flat((await run({ sections: secs, data: rows(2) })).pag)).toEqual(["TABLE HEAD", "1", "2", "count 2"]);
    expect(flat((await run({ sections: secs, data: [] })).pag)).toEqual(["NOTHING TO SHOW"]);
  });

  it("several detail bands print together per record, and child bands follow their parent", async () => {
    const { pag } = await run({
      data: rows(2),
      sections: [
        { type: "detail", id: "a", dataset: "d", children: [B("row.id")] },
        { type: "child", parent: "a", children: [T("child")] },
        { type: "detail", id: "b", dataset: "d", children: [X('"b" + row.id')] },
      ],
    });
    expect(flat(pag)).toEqual(["1", "child", "b1", "2", "child", "b2"]);
  });

  it("visibleWhen and suppressWhenBlank drop bands", async () => {
    const { pag } = await run({
      data: rows(3),
      sections: [
        { type: "detail", dataset: "d", visibleWhen: "row.id != 2", children: [B("row.id")] },
        { type: "detail", dataset: "d", suppressWhenBlank: true, children: [X('row.id == 3 ? "three" : ""')] },
      ],
    });
    expect(flat(pag)).toEqual(["1", "3", "three"]);
  });

  it("a fixed-height band keeps its height; the report header prints once, the report footer last", async () => {
    const { pag } = await run({
      sections: [
        { type: "reportHeader", height: 50, children: [T("TITLE")] },
        { type: "detail", dataset: "d", children: [B("row.id")] },
        { type: "reportFooter", children: [T("THE END")] },
      ],
    });
    const header = pag.pages[0]!.content[0]!;
    expect(header.box.height).toBe(50);
    const t = flat(pag);
    expect(t[0]).toBe("TITLE");
    expect(t[t.length - 1]).toBe("THE END");
  });
});

describe("group pagination rules", () => {
  const sections = (repeat: boolean, extra: object = {}) => [
    { type: "groupHeader", groupId: "g", children: [X('"HDR " + group.key')] },
    { type: "detail", dataset: "d", children: [B("row.id")] },
    { type: "groupFooter", groupId: "g", children: [X('"FTR " + group.key')] },
  ].map((s) => ({ ...s, ...(s.type === "groupHeader" ? extra : {}) }));

  it("repeats a group header at the top of every page the group continues onto, and only that group's", async () => {
    const { pag } = await run({
      height: 120,
      data: Array.from({ length: 40 }, (_, i) => ({ id: i + 1, g: i < 30 ? "ONE" : "TWO" })),
      groups: [{ id: "g", dataset: "d", by: "row.g", repeatHeader: true }],
      sections: sections(true),
    });
    const pages = pageTexts(pag);
    expect(pages.length).toBeGreaterThan(3);
    // every continuation page of group ONE starts with its header
    const onePages = pages.filter((p) => p.some((t) => /^\d+$/.test(t) && Number(t) <= 30));
    for (const p of onePages.slice(1)) expect(p[0]).toBe("HDR ONE");
    // group TWO's header is not duplicated on ONE's last page and ONE's header never leaks onto TWO-only pages
    const twoOnly = pages.filter((p) => p.every((t) => !/^\d+$/.test(t) || Number(t) > 30));
    for (const p of twoOnly) expect(p).not.toContain("HDR ONE");
    // all rows exactly once, in order
    const ids = flat(pag).filter((t) => /^\d+$/.test(t)).map(Number);
    expect(ids).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(pag.decisions.some((d) => d.kind === "group-header-repeated")).toBe(true);
    expect(pag.decisions.filter((d) => d.kind === "group-header-repeated").every((d) => d.page > 1 && (pag.pages[d.page - 1]?.content ?? []).some((n) => (n.component as any).band?.repeated))).toBe(true);
    expect(pag.pages.flatMap((p) => p.content).some((n) => (n.component as any).band?.repeated)).toBe(true);
  });

  it("without repeatHeader the header prints once", async () => {
    const { pag } = await run({ height: 120, data: Array.from({ length: 40 }, (_, i) => ({ id: i + 1, g: "ONE" })), groups: [{ id: "g", dataset: "d", by: "row.g" }], sections: sections(false) });
    expect(flat(pag).filter((t) => t === "HDR ONE")).toHaveLength(1);
  });

  it("never leaves a group header alone at the bottom of a page (minDetailRows), for every possible fill", async () => {
    for (let before = 0; before < 14; before++) {
      const data = [...Array.from({ length: before }, (_, i) => ({ id: i + 1, g: "A" })), ...Array.from({ length: 6 }, (_, i) => ({ id: 100 + i, g: "B" }))];
      const { pag } = await run({ height: 100, data, groups: [{ id: "g", dataset: "d", by: "row.g" }], sections: sections(false) });
      for (const p of pageTexts(pag)) expect(p[p.length - 1], `before=${before}`).not.toBe("HDR B");
    }
  });

  it("keepTogether moves a whole group to the next page when it fits there, and splits one taller than a page", async () => {
    const small = await run({ height: 150, data: [...Array.from({ length: 5 }, (_, i) => ({ id: i + 1, g: "A" })), ...Array.from({ length: 4 }, (_, i) => ({ id: 10 + i, g: "B" }))], groups: [{ id: "g", dataset: "d", by: "row.g", keepTogether: true }], sections: sections(false) });
    for (const p of pageTexts(small.pag)) {
      const b = p.filter((t) => t === "HDR B" || t === "FTR B").length;
      expect(b === 0 || b === 2, "group B is whole on its page").toBe(true);
    }
    const huge = await run({ height: 100, data: Array.from({ length: 30 }, (_, i) => ({ id: i + 1, g: "A" })), groups: [{ id: "g", dataset: "d", by: "row.g", keepTogether: true }], sections: sections(false) });
    expect(flat(huge.pag).filter((t) => /^\d+$/.test(t))).toHaveLength(30);
  });

  it("newPage before/after starts groups on their own pages", async () => {
    const { pag } = await run({ height: 400, groups: [{ id: "g", dataset: "d", by: "row.g", newPage: "before" }], sections: sections(false) });
    const pages = pageTexts(pag);
    expect(pages).toHaveLength(3);
    for (const p of pages) expect(p[0]).toMatch(/^HDR G/);
  });
});

describe("content taller than a page is never lost", () => {
  const many = Array.from({ length: 300 }, (_, i) => ({ k: `R${String(i + 1).padStart(4, "0")}` }));
  const tbl = { type: "table", dataset: "d", columns: [{ id: "k", header: "K", binding: "row.k" }] };
  const rep = { type: "repeater", dataset: "d", children: [B("row.k")] };
  const shapes: [string, unknown[]][] = [
    ["container > table", [{ type: "container", children: [T("Heading"), tbl] }]],
    ["column > table", [{ type: "column", children: [tbl] }]],
    ["keepTogether > table", [{ type: "keepTogether", children: [tbl] }]],
    ["repeater x300", [rep]],
    ["nested container > container > repeater", [{ type: "container", children: [{ type: "container", children: [rep] }] }]],
    ["group component", [{ type: "group", dataset: "d", groupBy: "'all'", header: [T("GH")], children: [B("row.k")], footer: [T("GF")] }]],
    ["static band with 300 text lines", many.map((r) => T(r.k))],
  ];
  for (const [name, children] of shapes) {
    it(`${name}: every row appears exactly once and stays on the page`, async () => {
      const { pag } = await run({ height: 842, data: many, sections: [{ type: "detail", children: children as any[] }] });
      const ids = flat(pag).filter((t) => /^R\d{4}$/.test(t));
      // table rows live in rowRange slices; count them separately
      const tableRows = pag.pages.flatMap((p) => [...all(p.content)].filter((n) => n.component.type === "table")).reduce((a, n) => a + ((n.rowRange?.end ?? 0) - (n.rowRange?.start ?? 0)), 0);
      expect(ids.length + tableRows).toBe(300);
      expect(pag.warnings.filter((w) => w.code === "CONTENT_OVERFLOWS_PAGE")).toEqual([]);
      for (const p of pag.pages) for (const n of p.content) expect(n.box.y + n.box.height).toBeLessThanOrEqual(842 + 1);
      expect(pag.pages.length).toBeGreaterThan(1);
    });
  }
});

describe("backgrounds", () => {
  it("lays background bands out per page, behind the content", async () => {
    const { pag } = await run({ sections: [{ type: "background", children: [{ type: "text", value: "BG", x: 10, y: 10 }] }, { type: "detail", dataset: "d", children: [B("row.id")] }] });
    expect(pag.pages[0]!.background.length).toBe(1);
    expect(textsOf(pag.pages[0]!.background)).toEqual(["BG"]);
    expect(textsOf(pag.pages[0]!.content)).not.toContain("BG");
  });
});

describe("design structure view", () => {
  it("shows every band once in reading order with real heights, collapse and fixed heights", async () => {
    const doc: any = {
      schemaVersion: "1.0", id: "s", name: "s",
      page: { size: "custom", width: 300, height: 600, unit: "pt", margin: { top: 10, right: 10, bottom: 10, left: 10 } },
      datasets: [{ id: "d", source: "inline", query: { data: rows(30) } }],
      groups: [{ id: "g", dataset: "d", by: "row.g" }],
      sections: [
        { type: "pageFooter", name: "Foot", children: [T("pf")] },
        { type: "reportHeader", height: 50, children: [T("rh")] },
        { type: "pageHeader", children: [T("ph")] },
        { type: "groupHeader", groupId: "g", children: [X('"gh " + group.key')] },
        { type: "detail", dataset: "d", collapsed: true, children: [B("row.id")] },
        { type: "groupFooter", groupId: "g", children: [T("gf")] },
        { type: "noData", dataset: "d", children: [T("nd")] },
        { type: "reportFooter", children: [T("rf")] },
      ],
    };
    const p = parseReportDefinition(doc);
    if (!p.valid) throw new Error(JSON.stringify(p.issues));
    const r = await resolveReport(p.report, { registry, parameters: {}, design: { ghosts: 0 } });
    const { layoutStructure } = await import("../src/design.js");
    const s = layoutStructure(r.resolved, p.report.sections);
    expect(s.bands.map((b) => b.type)).toEqual(["reportHeader", "pageHeader", "groupHeader", "detail", "groupFooter", "noData", "reportFooter", "pageFooter"]);
    expect(s.bands[0]!.height).toBe(50);
    expect(s.bands[0]!.fixedHeight).toBe(true);
    expect(s.bands[3]!.collapsed).toBe(true);
    expect(s.bands[3]!.height).toBe(20);
    // one record, one group: exactly one group header text, bands are contiguous
    expect(textsOf(s.pages[0]!.content).filter((t) => t.startsWith("gh"))).toEqual(["gh G1"]);
    for (let i = 1; i < s.bands.length; i++) expect(s.bands[i]!.y).toBeCloseTo(s.bands[i - 1]!.y + s.bands[i - 1]!.height, 5);
    expect(s.pageSize.height).toBeCloseTo(s.bands.at(-1)!.y + s.bands.at(-1)!.height + 10, 5);
  });

  it("ghost records repeat the detail band inside the same group", async () => {
    const doc: any = { schemaVersion: "1.0", id: "s", name: "s", datasets: [{ id: "d", source: "inline", query: { data: rows(9) } }], groups: [{ id: "g", dataset: "d", by: "row.g" }], sections: [{ type: "groupHeader", groupId: "g", children: [T("GH")] }, { type: "detail", dataset: "d", children: [B("row.id")] }, { type: "groupFooter", groupId: "g", children: [T("GF")] }] };
    const p = parseReportDefinition(doc);
    if (!p.valid) throw new Error("x");
    const r = await resolveReport(p.report, { registry, parameters: {}, design: { ghosts: 3 } });
    const { layoutStructure } = await import("../src/design.js");
    const s = layoutStructure(r.resolved, p.report.sections);
    expect(s.bands.map((b) => b.type)).toEqual(["groupHeader", "detail", "detail", "detail", "groupFooter"]);
  });

  it("works with no sample data yet (blank record) and tolerates unevaluable group keys", async () => {
    const doc: any = { schemaVersion: "1.0", id: "s", name: "s", datasets: [{ id: "d", source: "inline", query: { data: [] } }], groups: [{ id: "g", dataset: "d", by: "row.missing.deep" }], sections: [{ type: "groupHeader", groupId: "g", children: [T("GH")] }, { type: "detail", dataset: "d", children: [T("row")] }] };
    const p = parseReportDefinition(doc);
    if (!p.valid) throw new Error("x");
    const r = await resolveReport(p.report, { registry, parameters: {}, design: { ghosts: 0 }, tolerant: true });
    const { layoutStructure } = await import("../src/design.js");
    expect(layoutStructure(r.resolved, p.report.sections).bands.map((b) => b.type)).toEqual(["groupHeader", "detail"]);
  });
});
