import { describe, it, expect } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, InlineDataSource, resolveReport } from "@reporting/core";
import { PdfRenderer } from "../src/render.js";
import { extractPdfPages } from "./pdf-helpers.js";

const registry = new DataSourceRegistry();
registry.register(new InlineDataSource());

interface Opts {
  page?: Record<string, unknown>;
  cell?: (i: number) => string;
  extraColumns?: boolean;
  headerRows?: unknown[][];
  cellSpans?: unknown[];
}

function reportWith(n: number, o: Opts = {}) {
  const cell = o.cell ?? ((i) => `ROW${String(i).padStart(5, "0")}`);
  return {
    schemaVersion: "1.0",
    id: "boundary",
    name: "Boundary",
    datasets: [{ id: "d", source: "inline", query: { data: Array.from({ length: n }, (_, i) => ({ code: cell(i + 1), qty: i + 1 })) } }],
    page: { size: "A4", unit: "mm", margin: { top: 15, right: 15, bottom: 18, left: 15 }, ...o.page },
    sections: [
      { type: "pageHeader", children: [{ type: "text", value: "HEADERMARK" }] },
      {
        type: "detail",
        children: [
          {
            type: "table",
            dataset: "d",
            repeatHeaderOnPageBreak: true,
            headerRows: o.headerRows,
            cellSpans: o.cellSpans,
            columns: [
              { id: "code", header: "COLHEAD", binding: "row.code", width: "*" },
              { id: "qty", header: "Qty", binding: "row.qty", width: 60, align: "right" },
            ],
          },
        ],
      },
      { type: "pageFooter", children: [{ type: "text", expression: '"FOOT " + page.number + "/" + page.total' }] },
    ],
  };
}

async function render(doc: unknown, subreports?: Parameters<typeof resolveReport>[1]["subreports"]) {
  const parsed = parseReportDefinition(doc);
  if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
  const p = await resolveReport(parsed.report, { registry, parameters: {}, subreports });
  const r = await new PdfRenderer().render({ resolved: p.resolved, resolvePageSection: p.resolvePageSection });
  return extractPdfPages(r.content as Buffer);
}

/** Rows that fit on one page, found by probing: the smallest N whose render needs a second page, minus one. */
async function capacity(opts: Opts = {}) {
  let n = 5;
  while ((await render(reportWith(n, opts))).length === 1) n++;
  return n - 1;
}

function rowsOn(text: string, prefix = "ROW") {
  return [...text.matchAll(new RegExp(`${prefix}\\d{5}`, "g"))].map((m) => m[0]);
}

async function assertIntegrity(n: number, opts: Opts = {}, prefix = "ROW") {
  const pages = await render(reportWith(n, opts));
  const all = pages.flatMap((p) => rowsOn(p, prefix));
  // every row exactly once, in order
  expect(all).toHaveLength(n);
  expect(all).toEqual(Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(5, "0")}`));
  pages.forEach((p, i) => {
    expect(p, `page ${i + 1} header`).toContain("HEADERMARK");
    expect(p, `page ${i + 1} repeated column header`).toContain("COLHEAD");
    expect(p, `page ${i + 1} footer`).toContain(`FOOT ${i + 1}/${pages.length}`);
  });
  return pages;
}

describe("pagination boundaries (real PDF output)", () => {
  it("repeats a nested report's page header while its rows continue across pages", async () => {
    const items = Array.from({ length: 24 }, (_, index) => ({ name: `CHILDITEM${String(index + 1).padStart(2, "0")}` }));
    const child = {
      schemaVersion: "1.0", id: "receipt-lines", name: "Receipt lines",
      parameters: [],
      variables: [], groups: [], fragments: [],
      datasets: [{ id: "lines", source: "inline", query: { data: [] } }],
      sections: [
        { type: "pageHeader", id: "child-page-header", children: [{ type: "text", value: "CHILDHEADER" }] },
        { type: "detail", dataset: "lines", children: [{ type: "text", expression: "row.name" }] },
      ],
    };
    const parent = {
      schemaVersion: "1.0", id: "receipt", name: "Receipt",
      page: { size: "custom", unit: "pt", width: 240, height: 100, margin: { top: 4, right: 4, bottom: 4, left: 4 } },
      datasets: [{ id: "orders", source: "inline", query: { data: [{ lines: items }] } }],
      sections: [{ type: "detail", dataset: "orders", children: [
        { type: "subreport", id: "lines-component", reportId: "receipt-lines", dataset: "row.lines" },
        { type: "text", id: "parent-continuation", value: `PARENTFLOW\n${Array.from({ length: 20 }, (_, index) => `PARENTLINE${String(index + 1).padStart(2, "0")}`).join("\n")}`, pageBreakBefore: true },
      ] }],
    };

    const pages = await render(parent, { "receipt-lines": { report: child } });
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap((page) => [...page.matchAll(/CHILDITEM\d{2}/g)].map((match) => match[0]))).toEqual(items.map((item, index) => `CHILDITEM${String(index + 1).padStart(2, "0")}`));
    const parentPageIndex = pages.findIndex((page) => page.includes("PARENTFLOW"));
    expect(parentPageIndex).toBeGreaterThan(0);
    pages.slice(0, parentPageIndex).forEach((page) => expect(page).toContain("CHILDHEADER"));
    expect(pages.slice(parentPageIndex).every((page) => !page.includes("CHILDHEADER"))).toBe(true);
  });

  it("reuses one child definition from multiple parents and repeats a page-header reference", async () => {
    const sharedChild = {
      schemaVersion: "1.0", id: "shared-child-v1", name: "Shared child",
      parameters: [], variables: [], groups: [], fragments: [], datasets: [],
      sections: [{ type: "reportHeader", children: [{ type: "text", value: "SHAREDCHILD" }] }],
    };
    const parent = (id: string) => ({
      schemaVersion: "1.0", id, name: id,
      page: { size: "custom", unit: "pt", width: 240, height: 100, margin: { top: 4, right: 4, bottom: 4, left: 4 } },
      sections: [
        { type: "pageHeader", children: [{ type: "subreport", id: "shared-child", reportId: "shared-child-v1" }] },
        { type: "detail", children: [{ type: "text", value: Array.from({ length: 30 }, (_, index) => `BILL${String(index + 1).padStart(2, "0")}`).join("\n") }] },
      ],
    });
    const shared = { "shared-child-v1": { report: sharedChild } };

    for (const report of [parent("report-a"), parent("report-b")]) {
      const pages = await render(report, shared);
      expect(pages.length).toBeGreaterThan(1);
      pages.forEach((page) => expect(page).toContain("SHAREDCHILD"));
    }
  });

  it("repeats nested page footers and backgrounds only on pages used by the child report", async () => {
    const child = {
      schemaVersion: "1.0", id: "branded-lines", name: "Branded lines",
      parameters: [], variables: [], groups: [], fragments: [], datasets: [{ id: "lines", source: "inline", query: { data: [] } }],
      page: { size: "custom", unit: "pt", width: 240, height: 100, margin: { top: 4, right: 4, bottom: 4, left: 4 } },
      sections: [
        { type: "background", children: [{ type: "text", value: "CHILDBACKGROUND", x: 8, y: 8, width: 100, height: 8, style: { fontSize: 6 } }] },
        { type: "pageHeader", children: [{ type: "text", value: "CHILDHEADER", height: 8 }] },
        { type: "detail", dataset: "lines", children: [{ type: "text", binding: "row.label", height: 12 }] },
        { type: "pageFooter", children: [{ type: "text", value: "CHILDFOOTER", height: 8 }] },
      ],
    };
    const items = Array.from({ length: 48 }, (_, index) => ({ label: `CHILDLIN${String(index + 1).padStart(2, "0")}` }));
    const parent = {
      schemaVersion: "1.0", id: "parent-with-branded-lines", name: "Parent with branded lines",
      page: { size: "custom", unit: "pt", width: 240, height: 100, margin: { top: 4, right: 4, bottom: 4, left: 4 } },
      datasets: [{ id: "orders", source: "inline", query: { data: [{ lines: items }] } }],
      sections: [{ type: "detail", dataset: "orders", children: [
        { type: "subreport", id: "nested", reportId: "branded-lines", dataset: "row.lines" },
        { type: "text", id: "parent-after", value: "PARENTAFTER", pageBreakBefore: true },
      ] }],
    };

    const pages = await render(parent, { "branded-lines": { report: child } });
    expect(pages.length).toBeGreaterThan(2);
    const parentPage = pages.findIndex((page) => page.includes("PARENTAFTER"));
    expect(parentPage).toBeGreaterThan(0);
    for (const page of pages.slice(0, parentPage)) {
      expect(page).toContain("CHILDFOOTER");
      expect(page).toContain("CHILDBACKGROUND");
    }
    expect(pages.slice(parentPage).some((page) => page.includes("CHILDFOOTER"))).toBe(false);
    expect(pages.slice(parentPage).some((page) => page.includes("CHILDBACKGROUND"))).toBe(false);
  });

  it("prints every line of a long narrative once with repeated page furniture", async () => {
    const markers = Array.from({ length: 130 }, (_, index) => `NARRATIVE${String(index + 1).padStart(3, "0")}`);
    const pages = await render({
      schemaVersion: "1.0", id: "narrative", name: "Long narrative",
      page: { size: "custom", unit: "pt", width: 300, height: 320, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
      sections: [
        { type: "pageHeader", children: [{ type: "text", value: "HEADERMARK" }] },
        { type: "detail", children: [{ type: "text", id: "narrative", value: markers.join("\n"), width: 200, minLinesAtBottom: 2, minLinesAtTop: 2 }] },
        { type: "pageFooter", children: [{ type: "text", expression: '"FOOT " + page.number + "/" + page.total' }] },
      ],
    });
    expect(pages.length).toBeGreaterThan(2);
    expect(pages.flatMap((page) => [...page.matchAll(/NARRATIVE\d{3}/g)].map((match) => match[0]))).toEqual(markers);
    pages.forEach((page, index) => {
      expect(page).toContain("HEADERMARK");
      expect(page).toContain(`FOOT ${index + 1}/${pages.length}`);
    });
  });

  it("prints both columns of a tall row once with repeated page furniture", async () => {
    const left = Array.from({ length: 55 }, (_, index) => `LEFTCOL${String(index + 1).padStart(3, "0")}`);
    const right = Array.from({ length: 45 }, (_, index) => `RIGHTCOL${String(index + 1).padStart(3, "0")}`);
    const pages = await render({
      schemaVersion: "1.0", id: "tall-row", name: "Tall row",
      page: { size: "custom", unit: "pt", width: 320, height: 320, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
      sections: [
        { type: "pageHeader", children: [{ type: "text", value: "HEADERMARK" }] },
        { type: "detail", layout: "row", gap: 12, children: [
          { type: "text", id: "left", value: left.join("\n"), width: 145 },
          { type: "text", id: "right", value: right.join("\n"), width: 145 },
        ] },
        { type: "pageFooter", children: [{ type: "text", expression: '"FOOT " + page.number + "/" + page.total' }] },
      ],
    });
    expect(pages.length).toBeGreaterThan(2);
    expect(pages.flatMap((page) => [...page.matchAll(/LEFTCOL\d{3}/g)].map((match) => match[0]))).toEqual(left);
    expect(pages.flatMap((page) => [...page.matchAll(/RIGHTCOL\d{3}/g)].map((match) => match[0]))).toEqual(right);
    pages.forEach((page, index) => {
      expect(page).toContain("HEADERMARK");
      expect(page).toContain(`FOOT ${index + 1}/${pages.length}`);
    });
  });

  it("keeps a 100-page narrative complete and page-controlled", async () => {
    const markers = Array.from({ length: 2700 }, (_, index) => `LONG${String(index + 1).padStart(4, "0")}`);
    const pages = await render({
      schemaVersion: "1.0", id: "long-narrative", name: "Long narrative",
      page: { size: "custom", unit: "pt", width: 300, height: 320, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
      sections: [
        { type: "pageHeader", children: [{ type: "text", value: "HEADERMARK" }] },
        { type: "detail", children: [{ type: "text", id: "narrative", value: markers.join("\n"), width: 200 }] },
        { type: "pageFooter", children: [{ type: "text", expression: '"FOOT " + page.number + "/" + page.total' }] },
      ],
    });
    expect(pages.length).toBeGreaterThanOrEqual(100);
    expect(pages.flatMap((page) => [...page.matchAll(/LONG\d{4}/g)].map((match) => match[0]))).toEqual(markers);
    pages.forEach((page, index) => {
      expect(page).toContain("HEADERMARK");
      expect(page).toContain(`FOOT ${index + 1}/${pages.length}`);
    });
  }, 60_000);

  it("prints all words from a narrow auto-height paragraph across PDF pages", async () => {
    const words = Array.from({ length: 80 }, (_, index) => `WORD${String(index + 1).padStart(3, "0")}`);
    const pages = await render({
      schemaVersion: "1.0", id: "narrow-paragraph", name: "Narrow paragraph",
      page: { size: "custom", unit: "pt", width: 300, height: 320, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
      sections: [{ type: "detail", children: [{ type: "text", id: "paragraph", value: words.join(" "), width: 75 }] }],
    });
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap((page) => [...page.matchAll(/WORD\d{3}/g)].map((match) => match[0]))).toEqual(words);
  });

  it("keeps the totals row with a data row in the generated PDF", async () => {
    const pages = await render({
      schemaVersion: "1.0", id: "totals-boundary", name: "Totals boundary",
      page: { size: "custom", unit: "pt", width: 300, height: 90, orientation: "landscape", margin: { top: 0, right: 0, bottom: 0, left: 0 } },
      datasets: [{ id: "d", source: "inline", query: { data: Array.from({ length: 4 }, (_, index) => ({ code: `ROW${String(index + 1).padStart(5, "0")}` })) } }],
      sections: [{ type: "detail", children: [{
        type: "table", id: "totals-table", dataset: "d", showFooter: true,
        columns: [{ id: "code", header: "Code", binding: "row.code", footer: { expression: '"TOTALMARK"' } }],
      }] }],
    });
    expect(pages).toHaveLength(2);
    expect(rowsOn(pages[0]!)).toEqual(["ROW00001", "ROW00002", "ROW00003"]);
    expect(rowsOn(pages[1]!)).toEqual(["ROW00004"]);
    expect(pages[0]).not.toContain("TOTALMARK");
    expect(pages[1]).toContain("TOTALMARK");
  });

  it("N-1, N and N+1 rows around the page capacity keep every row once, in order, with header/footer on each page", async () => {
    const cap = await capacity();
    expect(cap).toBeGreaterThan(20);
    for (const n of [cap - 1, cap, cap + 1]) {
      const pages = await assertIntegrity(n);
      expect(pages.length).toBe(n <= cap ? 1 : 2);
    }
  }, 120_000);

  it("exactly two, and two-plus-one full pages: no blank trailing page, no orphan header", async () => {
    const cap = await capacity();
    // later pages hold the same rows as the first (header repeats), so capacity is stable
    const two = await assertIntegrity(cap * 2);
    expect(two.length).toBe(2);
    const three = await assertIntegrity(cap * 2 + 1);
    expect(three.length).toBe(3);
    expect(rowsOn(three[2]!)).toHaveLength(1);
  }, 180_000);

  it("0 and 1 rows render a single clean page", async () => {
    const zero = await render(reportWith(0));
    expect(zero).toHaveLength(1);
    expect(zero[0]).toContain("COLHEAD");
    await assertIntegrity(1);
  });

  it("other page sizes and landscape paginate without losing rows", async () => {
    for (const page of [{ size: "Letter" }, { size: "A5" }, { size: "A4", orientation: "landscape" }, { size: "custom", width: 100, height: 150 }]) {
      const cap = await capacity({ page });
      await assertIntegrity(cap + 1, { page });
    }
  }, 300_000);

  it("long wrapped cells and multiscript text still paginate cleanly", async () => {
    const long = (i: number) => `ROW${String(i).padStart(5, "0")} ` + "wrapping text that is long enough to take several lines in a narrow cell ".repeat(2);
    const pages = await render(reportWith(60, { cell: long }));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap((p) => rowsOn(p))).toHaveLength(60);

    const multi = (i: number) => `ROW${String(i).padStart(5, "0")} నమస్తే தமிழ் हिन्दी العربية`;
    const mp = await render(reportWith(45, { cell: multi }));
    expect(mp.flatMap((p) => rowsOn(p))).toHaveLength(45);
  }, 120_000);

  it("repeats both levels of a merged header on every PDF page", async () => {
    const headerRows = [
      [{ column: 0, text: "SALES GROUP", colSpan: 2 }],
      [{ column: 0, text: "COLHEAD" }, { column: 1, text: "Qty" }],
    ];
    const pages = await render(reportWith(80, { headerRows }));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap((page) => rowsOn(page))).toHaveLength(80);
    for (const page of pages) {
      expect(page).toContain("SALES GROUP");
      expect(page).toContain("COLHEAD");
    }
  });

  it("keeps a vertical body merge on one PDF page", async () => {
    const cap = await capacity();
    const pages = await render(reportWith(cap + 5, { cellSpans: [{ row: cap - 1, column: 0, rowSpan: 3 }] }));
    expect(pages.length).toBeGreaterThan(1);
    const anchor = `ROW${String(cap).padStart(5, "0")}`;
    const covered = `ROW${String(cap + 1).padStart(5, "0")}`;
    expect(pages[0]).not.toContain(anchor);
    expect(pages[1]).toContain(anchor);
    expect(pages.join("\n")).not.toContain(covered);
  }, 120_000);

  it("renders wrapped and shrunk row items once in the generated PDF", async () => {
    const children = [
      { type: "text", id: "left", value: "LEFTMARK", width: 400 },
      { type: "text", id: "right", value: "RIGHTMARK", width: 400 },
    ];
    const doc = (wrap: boolean, shrink: number | undefined) => ({
      schemaVersion: "1.0", id: "row-layout", name: "Row layout",
      page: { size: "A4", unit: "pt", margin: { top: 40, right: 40, bottom: 40, left: 40 } },
      sections: [{ type: "detail", layout: "row", gap: 12, wrap, children: children.map((item) => ({ ...item, shrink })) }],
    });
    for (const [wrap, shrink] of [[true, undefined], [false, 1]] as const) {
      const pages = await render(doc(wrap, shrink));
      expect(pages).toHaveLength(1);
      expect(pages[0]!.match(/LEFTMARK/g)).toHaveLength(1);
      expect(pages[0]!.match(/RIGHTMARK/g)).toHaveLength(1);
    }
  });
});
