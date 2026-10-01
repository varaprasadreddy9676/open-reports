import { describe, it, expect } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, InlineDataSource, resolveReport } from "@reporting/core";
import { PdfRenderer } from "../src/render.js";
import { extractPdfText } from "./pdf-helpers.js";

function registry() {
  const r = new DataSourceRegistry();
  r.register(new InlineDataSource());
  return r;
}

async function renderPdf(doc: unknown, parameters: Record<string, unknown> = {}) {
  const parsed = parseReportDefinition(doc);
  if (!parsed.valid) throw new Error("fixture should be schema-valid: " + JSON.stringify(parsed.issues));
  const pipeline = await resolveReport(parsed.report, { registry: registry(), parameters });
  const renderer = new PdfRenderer();
  return renderer.render({ resolved: pipeline.resolved, resolvePageSection: pipeline.resolvePageSection });
}

const invoiceReport = {
  schemaVersion: "1.0",
  id: "invoice",
  name: "Invoice",
  datasets: [
    {
      id: "items",
      source: "inline",
      query: { data: [{ description: "Eye Examination", quantity: 2, price: 500 }] },
    },
  ],
  sections: [
    { type: "reportHeader", children: [{ type: "text", value: "Acme Health" }] },
    {
      type: "detail",
      children: [
        {
          type: "table",
          dataset: "items",
          showFooter: true,
          columns: [
            { id: "description", header: "Description", binding: "row.description" },
            { id: "amount", header: "Amount", expression: "row.quantity * row.price", format: "currency", footer: { aggregate: "sum" } },
          ],
        },
        { type: "qrcode", value: "INV-1001" },
      ],
    },
  ],
};

describe("PdfRenderer", () => {
  it("produces a valid, parseable PDF with the right mime type", async () => {
    const result = await renderPdf(invoiceReport);
    expect(result.mimeType).toBe("application/pdf");
    expect(Buffer.isBuffer(result.content)).toBe(true);
    const buf = result.content as Buffer;
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");

    const parsed = await extractPdfText(buf);
    expect(parsed.numPages).toBe(1);
  });

  it("embeds real, extractable (searchable) text, not a rasterized image", async () => {
    const buf = (await renderPdf(invoiceReport)).content as Buffer;
    const parsed = await extractPdfText(buf);
    expect(parsed.text).toContain("Acme Health");
    expect(parsed.text).toContain("Eye Examination");
    expect(parsed.text).toContain("$1,000.00");
  });

  it("produces the correct number of pages for a report that spans multiple pages", async () => {
    const manyRows = {
      ...invoiceReport,
      page: { size: "custom", width: 300, height: 320, unit: "pt", orientation: "portrait", margin: { top: 10, right: 10, bottom: 10, left: 10 } },
      datasets: [
        {
          id: "items",
          source: "inline",
          query: { data: Array.from({ length: 40 }, (_, i) => ({ description: `Item ${i}`, quantity: 1, price: 10 })) },
        },
      ],
      sections: [
        {
          type: "detail",
          children: [{ type: "table", dataset: "items", columns: [{ id: "description", header: "Description", binding: "row.description" }] }],
        },
      ],
    };
    const buf = (await renderPdf(manyRows)).content as Buffer;
    const parsed = await extractPdfText(buf);
    expect(parsed.numPages).toBeGreaterThan(1);
    expect(parsed.text).toContain("Item 0");
    expect(parsed.text).toContain("Item 39");
  });

  it("renders Unicode text (Hindi/Devanagari and Arabic) without crashing, using an embedded font", async () => {
    const unicodeReport = {
      ...invoiceReport,
      sections: [
        {
          type: "detail",
          children: [
            { type: "text", value: "नमस्ते दुनिया" },
            { type: "text", value: "مرحبا بالعالم" },
          ],
        },
      ],
    };
    const renderer = new (await import("../src/render.js")).PdfRenderer({
      fonts: {
        families: {
          body: { regular: "/usr/share/fonts/truetype/freefont/FreeSerif.ttf" },
        },
        defaultFamily: "body",
      },
    });
    const parsed = parseReportDefinition(unicodeReport);
    if (!parsed.valid) throw new Error("fixture invalid");
    const pipeline = await resolveReport(parsed.report, { registry: registry(), parameters: {} });
    const result = await renderer.render({ resolved: pipeline.resolved, resolvePageSection: pipeline.resolvePageSection });
    expect((result.content as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
    expect(result.warnings).toEqual([]);
  });

  it("flags a missing/unfetchable image with a warning instead of throwing", async () => {
    const withImage = {
      ...invoiceReport,
      sections: [{ type: "detail", children: [{ type: "image", src: "https://example.com/logo.png" }] }],
    };
    const result = await renderPdf(withImage);
    expect(result.warnings.some((w) => w.code === "IMAGE_NOT_EMBEDDED")).toBe(true);
  });
});
