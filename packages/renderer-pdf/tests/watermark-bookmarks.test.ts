import { describe, it, expect } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, InlineDataSource, resolveReport } from "@reporting/core";
import { PdfRenderer } from "../src/render.js";
import { extractPdfPages } from "./pdf-helpers.js";

const registry = new DataSourceRegistry();
registry.register(new InlineDataSource());

async function render(doc: unknown) {
  const parsed = parseReportDefinition(doc);
  if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
  const p = await resolveReport(parsed.report, { registry, parameters: {} });
  return (await new PdfRenderer().render({ resolved: p.resolved, resolvePageSection: p.resolvePageSection })).content as Buffer;
}

const base = (extra: Record<string, unknown>, children: unknown[]) => ({ schemaVersion: "1.0", id: "w", name: "w", sections: [{ type: "detail", children }], ...extra });
const longBody = Array.from({ length: 80 }, (_, i) => ({ type: "text", value: `Line ${i + 1}`, style: { fontSize: 14 } }));

describe("watermark", () => {
  it("appears on every page by default and only on page 1 when asked", async () => {
    const all = await extractPdfPages(await render(base({ watermark: { text: "CONFIDENTIAL" } }, longBody)));
    expect(all.length).toBeGreaterThan(1);
    for (const p of all) expect(p).toContain("CONFIDENTIAL");
    const first = await extractPdfPages(await render(base({ watermark: { text: "DRAFT", pages: "first" } }, longBody)));
    expect(first[0]).toContain("DRAFT");
    expect(first[1]).not.toContain("DRAFT");
  });
  it("supports non-Latin text", async () => {
    const pages = await extractPdfPages(await render(base({ watermark: { text: "गोपनीय" } }, [{ type: "text", value: "x" }])));
    expect(pages[0]).toContain("गोपनीय");
  });
});

describe("bookmarks", () => {
  it("builds a nested outline pointing at the right pages", async () => {
    const children = [
      { type: "text", value: "Chapter 1", bookmark: true },
      { type: "text", value: "Section 1.1", bookmark: true, bookmarkLevel: 2 },
      ...longBody.slice(0, 60),
      { type: "text", value: "Chapter 2", bookmark: "Second chapter" },
      { type: "text", value: "end" },
    ];
    const buf = await render(base({}, children));
    const pdf = await getDocument({ data: new Uint8Array(buf), verbosity: 0 }).promise;
    const outline: any[] = (await pdf.getOutline()) ?? [];
    expect(outline.map((o) => o.title)).toEqual(["Chapter 1", "Second chapter"]);
    expect(outline[0].items.map((o: any) => o.title)).toEqual(["Section 1.1"]);
    const pageOf = async (item: any) => { const d = Array.isArray(item.dest) ? item.dest : await pdf.getDestination(item.dest); return (await pdf.getPageIndex(d![0])) + 1; };
    expect(await pageOf(outline[0])).toBe(1);
    expect(await pageOf(outline[1])).toBeGreaterThan(1);
  });
});
