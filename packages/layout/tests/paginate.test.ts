import { describe, it, expect } from "vitest";
import type { ResolvedReport, ResolvedTableComponent, ResolvedTextComponent } from "@reporting/core";
import type { PaginationDecision, PositionedNode } from "../src/types.js";
import { fillMissingPageBreakDecisions, isDataLossWarningCode, paginate } from "../src/paginate.js";

function makeTable(rowCount: number, overrides: Partial<ResolvedTableComponent> = {}): ResolvedTableComponent {
  return {
    type: "table",
    columns: [{ id: "name", header: "Name" }],
    rows: Array.from({ length: rowCount }, (_, i) => ({ raw: { name: `Row ${i}` }, formatted: { name: `Row ${i}` } })),
    showHeader: true,
    showFooter: false,
    repeatHeaderOnPageBreak: true,
    keepRowTogether: true,
    ...overrides,
  } as ResolvedTableComponent;
}

function reportWith(sections: ResolvedReport["sections"]): ResolvedReport {
  return {
    id: "r",
    name: "R",
    locale: "en-US",
    page: {
      size: "custom",
      width: 300,
      height: 548 + 1, // content height will be computed below to exactly fit 30 rows
      unit: "pt",
      orientation: "portrait",
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    },
    sections,
    warnings: [],
  };
}

// With the default heuristic measurer: lineHeight(10) = 13, row height = 13 + 4 = 17,
// header height = 13 + 6 = 19. A content area of 19 + 17*30 = 529pt fits exactly 30 rows.
const EXACT_30_ROWS_HEIGHT = 529;

describe("page-break explanation coverage", () => {
  it("records measured space when a page starts without a named rule, without duplicating known reasons", () => {
    const node = (id: string, height: number): PositionedNode => ({ component: { type: "text", id, text: id } as ResolvedTextComponent, box: { x: 0, y: 0, width: 100, height } });
    const pages = [[node("previous", 82)], [node("continued", 30)], [node("final", 20)]];
    const decisions: PaginationDecision[] = [{ kind: "forced-break", page: 3, message: "Explicit break" }];
    fillMissingPageBreakDecisions(pages, decisions, () => 100);
    expect(decisions).toHaveLength(2);
    expect(decisions[1]).toMatchObject({ kind: "flow-break", page: 2, componentId: "continued", required: 30, available: 18 });
    expect(decisions[1]!.message).toMatch(/needs 30pt, with 18pt left/);
    fillMissingPageBreakDecisions(pages, decisions, () => 100);
    expect(decisions).toHaveLength(2);
  });

  it("gives every real table continuation page a specific reason", () => {
    const result = paginate(reportWithContentHeight(EXACT_30_ROWS_HEIGHT, [{ type: "detail", children: [makeTable(75)] }]));
    expect(result.pages.length).toBeGreaterThan(2);
    for (const page of result.pages.slice(1)) {
      expect(result.decisions.some((decision) => decision.page === page.number && decision.kind === "table-split")).toBe(true);
    }
  });
});

describe("table minimum rows before a break", () => {
  it("moves the first table slice when two rows fit on a fresh page but only one fits here", () => {
    const intro = { type: "text", id: "intro", text: "Intro", height: 55 } as unknown as ResolvedTextComponent;
    const table = makeTable(4, { id: "items", minRowsBeforeBreak: 2, repeatHeaderOnPageBreak: false } as Partial<ResolvedTableComponent>);
    const result = paginate(reportWithContentHeight(100, [{ type: "detail", children: [intro, table] }]));
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]!.content.map((node) => (node.component as any).id)).toEqual(["intro"]);
    expect(result.pages[1]!.content[0]!.rowRange).toEqual({ start: 0, end: 4 });
    expect((result.pages[1]!.content[0]!.component as ResolvedTableComponent).showHeader).toBe(true);
    const reason = result.decisions.find((decision) => decision.kind === "orphan-control");
    expect(reason).toMatchObject({ kind: "orphan-control", page: 2, componentId: "items", required: 53,
      actions: [expect.objectContaining({ patch: { minRowsBeforeBreak: 1 } })] });
    expect(reason?.available).toBeCloseTo(45);

    const allowed = paginate(reportWithContentHeight(100, [{ type: "detail", children: [intro, { ...table, minRowsBeforeBreak: 1 } as ResolvedTableComponent] }]));
    expect(allowed.pages[0]!.content[1]!.rowRange).toEqual({ start: 0, end: 1 });
  });
});

describe("table totals at a page break", () => {
  const footerTable = (overrides: Partial<ResolvedTableComponent> = {}) => makeTable(4, {
    id: "totals-table", showFooter: true, ...overrides,
  });

  it("keeps the last data row with totals by default and explains the move", () => {
    const result = paginate(reportWithContentHeight(100, [{ type: "detail", children: [footerTable()] }]));
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]!.content[0]!.rowRange).toEqual({ start: 0, end: 3 });
    expect((result.pages[0]!.content[0]!.component as ResolvedTableComponent).showFooter).toBe(false);
    expect(result.pages[1]!.content[0]!.rowRange).toEqual({ start: 3, end: 4 });
    expect((result.pages[1]!.content[0]!.component as ResolvedTableComponent).showFooter).toBe(true);
    expect(result.decisions).toContainEqual(expect.objectContaining({
      kind: "keep-together", page: 2, rowIndex: 3,
      actions: [expect.objectContaining({ patch: { keepFooterTogether: false } })],
    }));
  });

  it("allows totals on a page without data rows when explicitly configured", () => {
    const result = paginate(reportWithContentHeight(100, [{ type: "detail", children: [footerTable({ keepFooterTogether: false })] }]));
    expect(result.pages[0]!.content[0]!.rowRange).toEqual({ start: 0, end: 4 });
    expect((result.pages[0]!.content[0]!.component as ResolvedTableComponent).showFooter).toBe(false);
    expect(result.pages[1]!.content[0]!.rowRange).toEqual({ start: 4, end: 4 });
    expect((result.pages[1]!.content[0]!.component as ResolvedTableComponent).showFooter).toBe(true);
  });

  it("moves more rows with totals when the final-page minimum is feasible", () => {
    const result = paginate(reportWithContentHeight(100, [{ type: "detail", children: [footerTable({ minRowsAfterBreak: 3 })] }]));
    expect(result.pages[0]!.content[0]!.rowRange).toEqual({ start: 0, end: 1 });
    expect(result.pages[1]!.content[0]!.rowRange).toEqual({ start: 1, end: 4 });
    expect((result.pages[1]!.content[0]!.component as ResolvedTableComponent).showFooter).toBe(true);
  });
});

function reportWithContentHeight(height: number, sections: ResolvedReport["sections"]): ResolvedReport {
  const r = reportWith(sections);
  r.page = { ...r.page, height, orientation: 300 > height ? "landscape" : "portrait" } as any;
  return r;
}

describe("paginate: table row-splitting boundaries", () => {
  it("moves a vertically merged body cell and all its rows to the next page", () => {
    const table = makeTable(33, { cellSpans: [{ row: 29, column: 0, rowSpan: 3 }] });
    const result = paginate(reportWithContentHeight(EXACT_30_ROWS_HEIGHT, [{ type: "detail", children: [table] }]));
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]!.content[0]!.rowRange).toEqual({ start: 0, end: 29 });
    expect(result.pages[1]!.content[0]!.rowRange).toEqual({ start: 29, end: 33 });
    expect(result.decisions).toContainEqual(expect.objectContaining({ kind: "merged-cell", page: 2, rowIndex: 29 }));
    expect(result.decisions.find((decision) => decision.kind === "table-split")?.required).toBeUndefined();
  });

  it("fails explicitly when a vertical merge is taller than a whole page", () => {
    const table = makeTable(40, { cellSpans: [{ row: 0, column: 0, rowSpan: 40 }] });
    expect(() => paginate(reportWithContentHeight(EXACT_30_ROWS_HEIGHT, [{ type: "detail", children: [table] }]))).toThrow(/Merged table rows.*taller than a whole page/);
  });
  it("fits 29 rows on a single page", () => {
    const report = reportWithContentHeight(EXACT_30_ROWS_HEIGHT, [{ type: "detail", children: [makeTable(29)] }]);
    const result = paginate(report);
    expect(result.pages).toHaveLength(1);
  });

  it("fits exactly 30 rows on a single page (the exact boundary)", () => {
    const report = reportWithContentHeight(EXACT_30_ROWS_HEIGHT, [{ type: "detail", children: [makeTable(30)] }]);
    const result = paginate(report);
    expect(result.pages).toHaveLength(1);
    const node = result.pages[0]!.content[0]!;
    expect(node.rowRange).toEqual({ start: 0, end: 30 });
  });

  it("spills the 31st row onto a second page with the header repeated", () => {
    const report = reportWithContentHeight(EXACT_30_ROWS_HEIGHT, [{ type: "detail", children: [makeTable(31)] }]);
    const result = paginate(report);
    expect(result.pages).toHaveLength(2);

    const page1Table = result.pages[0]!.content[0]!;
    expect(page1Table.rowRange).toEqual({ start: 0, end: 30 });
    expect(page1Table.tableMetrics).toMatchObject({ headerRowHeights: [19], rowHeights: expect.arrayContaining([17]) });
    expect(page1Table.tableMetrics?.rowHeights).toHaveLength(31);
    expect((page1Table.component as ResolvedTableComponent).showHeader).toBe(true);

    const page2Table = result.pages[1]!.content[0]!;
    expect(page2Table.rowRange).toEqual({ start: 30, end: 31 });
    expect((page2Table.component as ResolvedTableComponent).showHeader).toBe(true); // repeated
  });

  it("does not repeat the header on continuation pages when repeatHeaderOnPageBreak is false", () => {
    const report = reportWithContentHeight(EXACT_30_ROWS_HEIGHT, [
      { type: "detail", children: [makeTable(31, { repeatHeaderOnPageBreak: false })] },
    ]);
    const result = paginate(report);
    const page2Table = result.pages[1]!.content[0]!;
    expect((page2Table.component as ResolvedTableComponent).showHeader).toBe(false);
  });
});

describe("paginate: widow control (minRowsAfterBreak)", () => {
  it("leaves a lone row on the final page when no widow protection is set", () => {
    const report = reportWithContentHeight(EXACT_30_ROWS_HEIGHT, [{ type: "detail", children: [makeTable(31)] }]);
    const result = paginate(report);
    const page2Table = result.pages[1]!.content[0]!;
    expect(page2Table.rowRange).toEqual({ start: 30, end: 31 }); // 1 row, "widowed"
  });

  it("pulls rows back from the first page so the last page never ends up with fewer than minRowsAfterBreak rows", () => {
    const report = reportWithContentHeight(EXACT_30_ROWS_HEIGHT, [
      { type: "detail", children: [makeTable(31, { minRowsAfterBreak: 3 } as Partial<ResolvedTableComponent>)] },
    ]);
    const result = paginate(report);
    expect(result.pages).toHaveLength(2);
    const page1Table = result.pages[0]!.content[0]!;
    const page2Table = result.pages[1]!.content[0]!;
    expect(page1Table.rowRange).toEqual({ start: 0, end: 28 });
    expect(page2Table.rowRange).toEqual({ start: 28, end: 31 }); // 3 rows, not 1
    expect(result.decisions).toContainEqual(expect.objectContaining({
      kind: "widow-control", page: 2,
      actions: [expect.objectContaining({ patch: { minRowsAfterBreak: 1 } })],
    }));
    expect(result.decisions.find((decision) => decision.kind === "table-split")?.message).toMatch(/minimum-row or merged-cell rule/);
    expect(result.decisions.find((decision) => decision.kind === "table-split")?.required).toBeUndefined();
  });
});

describe("paginate: stacking order", () => {
  it("places a table below whatever content precedes it on the same page, instead of overlapping it", () => {
    const heading = { type: "text", text: "Acme Health", style: { fontSize: 18 } } as unknown as ResolvedTextComponent;
    const table = makeTable(2);
    const report = reportWith([{ type: "detail", children: [heading, table] }]);
    const result = paginate(report);

    expect(result.pages).toHaveLength(1);
    const [headingNode, tableNode] = result.pages[0]!.content;
    expect(tableNode!.box.y).toBeGreaterThanOrEqual(headingNode!.box.y + headingNode!.box.height);
  });

  it("keeps a table's slice correctly offset below preceding content on a continuation page too", () => {
    const heading = { type: "text", text: "H", style: { fontSize: 10 } } as unknown as ResolvedTextComponent;
    const bigTable = makeTable(31);
    const report = reportWithContentHeight(EXACT_30_ROWS_HEIGHT, [{ type: "detail", children: [heading, bigTable] }]);
    const result = paginate(report);
    expect(result.pages).toHaveLength(2);
    const page2TableNode = result.pages[1]!.content.find((n) => n.component.type === "table")!;
    // Nothing precedes the table's continuation slice on page 2, so it should start at the page's top margin.
    expect(page2TableNode.box.y).toBe(result.pages[1]!.content[0]!.box.y);
  });
});

describe("paginate: long flow text", () => {
  const lines = Array.from({ length: 70 }, (_, index) => `LINE${String(index + 1).padStart(3, "0")}`);
  const paragraph = { type: "text", id: "narrative", text: lines.join("\n"), width: 200 } as unknown as ResolvedTextComponent;

  it("splits a long narrative into complete, ordered page fragments", () => {
    const result = paginate(reportWithContentHeight(300, [{ type: "detail", children: [paragraph] }]));
    const fragments = result.pages.flatMap((page) => page.content).filter((node) => node.textFragment);
    expect(fragments.length).toBeGreaterThan(1);
    expect(fragments.flatMap((node) => node.textFragment!.text.split("\n"))).toEqual(lines);
    expect(fragments[0]!.textFragment?.startLine).toBe(0);
    expect(fragments.at(-1)!.textFragment?.endLine).toBe(lines.length);
    expect(result.warnings.some((warning) => warning.code === "CONTENT_OVERFLOWS_PAGE")).toBe(false);
    expect(result.decisions.filter((decision) => decision.kind === "text-split")).toHaveLength(fragments.length - 1);
    for (const page of result.pages) for (const node of page.content) expect(node.box.y + node.box.height).toBeLessThanOrEqual(page.zones.body.height + 0.01);
  });

  it("keeps at least two lines on both sides of a break when possible", () => {
    const result = paginate(reportWithContentHeight(300, [{ type: "detail", children: [{ ...paragraph, text: lines.slice(0, 24).join("\n"), minLinesAtBottom: 2, minLinesAtTop: 2 }] }]));
    const counts = result.pages.map((page) => page.content.flatMap((node) => node.textFragment?.text.split("\n") ?? []).length);
    expect(counts.length).toBeGreaterThan(1);
    expect(counts.every((count) => count >= 2)).toBe(true);
    expect(result.decisions.some((decision) => decision.kind === "widow-control")).toBe(true);
  });

  it("explains a minimum-lines move when a partial page has too little room", () => {
    const heading = { type: "spacer", height: 279 } as any;
    const result = paginate(reportWithContentHeight(300, [{ type: "detail", children: [heading, { ...paragraph, text: lines.slice(0, 25).join("\n"), allowSplit: true, minLinesAtBottom: 2 }] }]));
    expect(result.decisions.some((decision) => decision.kind === "orphan-control" && decision.page === 2)).toBe(true);
    expect(result.pages[0]!.content).toHaveLength(1);
    expect(result.pages.slice(1).flatMap((page) => page.content).flatMap((node) => node.textFragment?.text.split("\n") ?? [])).toEqual(lines.slice(0, 25));
  });

  it("wraps at the component width before choosing page boundaries", () => {
    const words = Array.from({ length: 80 }, (_, index) => `WORD${String(index + 1).padStart(3, "0")}`);
    const result = paginate(reportWithContentHeight(300, [{ type: "detail", children: [{ ...paragraph, text: words.join(" "), width: 75 }] }]));
    expect(result.pages.length).toBeGreaterThan(1);
    const rendered = result.pages.flatMap((page) => page.content.map((node) => node.textFragment?.text ?? "")).join(" ");
    expect([...rendered.matchAll(/WORD\d{3}/g)].map((match) => match[0])).toEqual(words);
    expect(result.warnings.some((warning) => warning.code === "CONTENT_OVERFLOWS_PAGE")).toBe(false);
  });

  it("warns when a fixed-height text box is shorter than its contents", () => {
    const result = paginate(reportWithContentHeight(300, [{ type: "detail", children: [{ ...paragraph, height: 20 }] }]));
    expect(result.warnings.some((warning) => warning.code === "TEXT_EXCEEDS_HEIGHT")).toBe(true);
  });

  it("uses one measured ellipsis line when truncation is explicitly requested", () => {
    const result = paginate(reportWithContentHeight(300, [{ type: "detail", children: [{ ...paragraph, height: 20, width: 65, style: { overflow: "ellipsis" } }] }]));
    const node = result.pages[0]!.content[0]!;
    expect(node.renderText).toMatch(/^LINE001.*…$/u);
    expect(node.renderText).not.toContain("LINE070");
    expect(result.warnings.some((warning) => warning.code === "TEXT_TRUNCATED_BY_POLICY")).toBe(true);
    expect(result.warnings.some((warning) => warning.code === "TEXT_EXCEEDS_HEIGHT")).toBe(false);
  });

  it("treats an explicit clipping policy as intentional while flagging a box too short for even one line", () => {
    const clipped = paginate(reportWithContentHeight(300, [{ type: "detail", children: [{ ...paragraph, height: 20, style: { overflow: "clip" } }] }]));
    expect(clipped.warnings.some((warning) => warning.code === "TEXT_TRUNCATED_BY_POLICY")).toBe(true);
    expect(clipped.warnings.some((warning) => warning.code === "TEXT_EXCEEDS_HEIGHT")).toBe(false);
    const tooShort = paginate(reportWithContentHeight(300, [{ type: "detail", children: [{ ...paragraph, height: 2, style: { overflow: "ellipsis" } }] }]));
    expect(tooShort.warnings.some((warning) => warning.code === "TEXT_EXCEEDS_HEIGHT")).toBe(true);
  });

  it("flags descendants that extend outside a fixed-height container", () => {
    const container = { type: "container", id: "fixed-panel", height: 25, children: [{ type: "container", children: [{ ...paragraph, text: lines.slice(0, 5).join("\n") }] }] } as any;
    const result = paginate(reportWithContentHeight(300, [{ type: "detail", children: [container] }]));
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "CONTAINER_CONTENT_EXCEEDS_HEIGHT", path: "fixed-panel" }));
  });

  it("explains row width overflow and blocks output only when an item passes the printable edge", () => {
    const item = (id: string, width: number) => ({ type: "text", id, text: id, width }) as ResolvedTextComponent;
    const row = (width: number, secondWidth: number) => ({ type: "container", id: "line", layout: "row", width, gap: 10, children: [item("first", 150), item("second", secondWidth)] }) as any;
    const insidePage = paginate(reportWith([{ type: "detail", children: [row(200, 90)] }]));
    expect(insidePage.warnings).toContainEqual(expect.objectContaining({ code: "ROW_CONTENT_EXCEEDS_WIDTH", path: "second" }));
    expect(isDataLossWarningCode("ROW_CONTENT_EXCEEDS_WIDTH")).toBe(false);

    const beyondPage = paginate(reportWith([{ type: "detail", children: [row(300, 180)] }]));
    expect(beyondPage.warnings).toContainEqual(expect.objectContaining({ code: "CONTENT_EXCEEDS_PRINTABLE_WIDTH", path: "second" }));
    expect(beyondPage.warnings.some((warning) => warning.code === "ROW_CONTENT_EXCEEDS_WIDTH")).toBe(false);
    expect(isDataLossWarningCode("CONTENT_EXCEEDS_PRINTABLE_WIDTH")).toBe(true);

    const fitting = paginate(reportWith([{ type: "detail", children: [row(300, 100)] }]));
    expect(fitting.warnings.some((warning) => warning.code.includes("WIDTH"))).toBe(false);
  });
});

describe("paginate: forced breaks and keepTogether", () => {
  it("honors pageBreakBefore", () => {
    const text1 = { type: "text", text: "A" } as unknown as ResolvedTextComponent;
    const text2 = { type: "text", text: "B", pageBreakBefore: true } as unknown as ResolvedTextComponent;
    const report = reportWith([{ type: "detail", children: [text1, text2] }]);
    const result = paginate(report);
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]!.content).toHaveLength(1);
    expect(result.pages[1]!.content).toHaveLength(1);
  });

  it("honors pageBreakAfter", () => {
    const text1 = { type: "text", text: "A", pageBreakAfter: true } as unknown as ResolvedTextComponent;
    const text2 = { type: "text", text: "B" } as unknown as ResolvedTextComponent;
    const report = reportWith([{ type: "detail", children: [text1, text2] }]);
    const result = paginate(report);
    expect(result.pages).toHaveLength(2);
    expect(result.decisions).toContainEqual(expect.objectContaining({ kind: "forced-break", page: 2 }));
  });

  it("keeps a keepTogether block whole on the next page when it doesn't fit the remainder of the current one", () => {
    // A tiny page (just enough for ~2 "rows" worth of table) forces the second,
    // keepTogether table to move to page 2 instead of starting to split there.
    const smallTable1 = makeTable(1);
    const bigKeepTogetherTable = makeTable(5, { keepTogether: true } as any);
    // Page fits 6 rows worth of space: table1 (1 row = 36pt) leaves 85pt
    // remaining, not enough for the 5-row (104pt) table, but the 5-row table
    // does fit on a fresh page (104 <= 121), so it should move there whole.
    const report = reportWithContentHeight(19 + 17 * 6, [
      { type: "detail", children: [smallTable1, bigKeepTogetherTable] },
    ]);
    const result = paginate(report);
    // Page 1: just the 1-row table. Page 2: the whole 5-row keepTogether table (fits on a fresh page).
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]!.content).toHaveLength(1);
    expect(result.pages[1]!.content[0]!.rowRange).toEqual({ start: 0, end: 5 });
  });
});

describe("paginate: page headers/footers with real page numbers", () => {
  it("repeats the pageHeader on every page and substitutes real page.number/page.total", () => {
    const table = makeTable(31);
    const report = reportWithContentHeight(EXACT_30_ROWS_HEIGHT, [
      { type: "pageHeader", children: [{ type: "text", text: "placeholder" } as any] },
      { type: "detail", children: [table] },
    ]);

    const result = paginate(report, {
      resolvePageDependentSection: (section, page) => {
        if (section.type !== "pageHeader") return section.children;
        return [{ type: "text", text: `Page ${page.number} of ${page.total}` } as any];
      },
    });

    expect(result.pages).toHaveLength(2);
    const header1 = result.pages[0]!.header[0]!.component as ResolvedTextComponent;
    const header2 = result.pages[1]!.header[0]!.component as ResolvedTextComponent;
    expect(header1.text).toBe("Page 1 of 2");
    expect(header2.text).toBe("Page 2 of 2");
  });
});
