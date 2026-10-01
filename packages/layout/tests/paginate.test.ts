import { describe, it, expect } from "vitest";
import type { ResolvedReport, ResolvedTableComponent, ResolvedTextComponent } from "@reporting/core";
import { paginate } from "../src/paginate.js";

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

function reportWithContentHeight(height: number, sections: ResolvedReport["sections"]): ResolvedReport {
  const r = reportWith(sections);
  r.page = { ...r.page, height } as any;
  return r;
}

describe("paginate: table row-splitting boundaries", () => {
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
