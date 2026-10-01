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

async function render(doc: unknown) {
  const parsed = parseReportDefinition(doc);
  if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
  const p = await resolveReport(parsed.report, { registry, parameters: {} });
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
});
