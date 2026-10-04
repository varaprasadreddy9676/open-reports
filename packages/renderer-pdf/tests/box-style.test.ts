import { afterEach, describe, expect, it, vi } from "vitest";
import PDFDocument from "pdfkit";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, InlineDataSource, resolveReport } from "@reporting/core";
import { extractPdfPages } from "./pdf-helpers.js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PdfRenderer } from "../src/render.js";

async function render(children: unknown[]) {
  const parsed = parseReportDefinition({ schemaVersion: "1.0", id: "box", name: "Box", sections: [{ type: "detail", children }] });
  if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
  const pipeline = await resolveReport(parsed.report, { registry: new DataSourceRegistry() });
  return new PdfRenderer().render({ resolved: pipeline.resolved, resolvePageSection: pipeline.resolvePageSection });
}

/** PDF y (from the bottom) of each text string on page 1. */
async function textYs(buffer: Buffer): Promise<Record<string, number>> {
  const doc = await getDocument({ data: new Uint8Array(buffer), disableFontFace: true, verbosity: 0 }).promise;
  const content = await (await doc.getPage(1)).getTextContent();
  return Object.fromEntries(content.items.filter((item: any) => item.str.trim()).map((item: any) => [item.str, item.transform[5]]));
}

afterEach(() => vi.restoreAllMocks());

describe("verticalAlign", () => {
  it("places text at the top, middle or bottom of a fixed-height box", async () => {
    const box = (id: string, verticalAlign?: string) => ({ type: "text", id, value: id, height: 60, style: { padding: 4, ...(verticalAlign ? { verticalAlign } : {}) } });
    const result = await render([{ type: "row", children: [box("TOP"), box("MIDDLE", "middle"), box("BOTTOM", "bottom")] }]);
    const y = await textYs(result.content);
    // PDF y grows upwards: lower text has a smaller y.
    expect(y.TOP! - y.MIDDLE!).toBeGreaterThan(15);
    expect(y.MIDDLE! - y.BOTTOM!).toBeGreaterThan(15);
    expect(y.TOP! - y.BOTTOM!).toBeCloseTo(60 - 8 - 12, -1);
  });
});

describe("borderRadius", () => {
  it("draws rounded backgrounds and borders", async () => {
    const rounded = vi.spyOn(PDFDocument.prototype as any, "roundedRect");
    await render([{ type: "rectangle", width: 80, height: 40, style: { background: "#e0f2fe", border: { width: 1, color: "#0369a1" }, borderRadius: 6 } }]);
    expect(rounded).toHaveBeenCalledTimes(2);
    expect(rounded.mock.calls[0]!.slice(2)).toEqual([80, 40, 6]);
  });
  it("keeps square corners without a radius", async () => {
    const rounded = vi.spyOn(PDFDocument.prototype as any, "roundedRect");
    await render([{ type: "rectangle", width: 80, height: 40, style: { background: "#e0f2fe" } }]);
    expect(rounded).not.toHaveBeenCalled();
  });
});

describe("allowRowSplit", () => {
  it("prints every line of a row taller than a page, across pages", async () => {
    const note = Array.from({ length: 90 }, (_, i) => `line${i}`).join("\n");
    const parsed = parseReportDefinition({ schemaVersion: "1.0", id: "split", name: "Split",
      datasets: [{ id: "notes", source: "inline", query: { data: [{ note }] } }],
      sections: [{ type: "detail", children: [{ type: "table", dataset: "notes", allowRowSplit: true, columns: [{ id: "note", header: "Note", binding: "row.note" }] }] }],
    });
    if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
    const registry = new DataSourceRegistry();
    registry.register(new InlineDataSource());
    const pipeline = await resolveReport(parsed.report, { registry });
    const result = await new PdfRenderer().render({ resolved: pipeline.resolved, resolvePageSection: pipeline.resolvePageSection });
    const pages = await extractPdfPages(result.content);
    expect(pages.length).toBeGreaterThan(1);
    const printed = pages.join(" ").match(/line\d+/g)!;
    expect(printed).toEqual(Array.from({ length: 90 }, (_, i) => `line${i}`));
    for (const page of pages) expect(page).toContain("Note");
  });
});
