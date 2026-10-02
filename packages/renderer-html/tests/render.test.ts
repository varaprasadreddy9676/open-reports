import { describe, it, expect } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, InlineDataSource, resolveReport } from "@reporting/core";
import { HtmlRenderer } from "../src/render.js";

function registry() {
  const r = new DataSourceRegistry();
  r.register(new InlineDataSource());
  return r;
}

async function renderReport(doc: unknown, parameters: Record<string, unknown> = {}) {
  const parsed = parseReportDefinition(doc);
  if (!parsed.valid) throw new Error("fixture should be schema-valid: " + JSON.stringify(parsed.issues));
  const pipeline = await resolveReport(parsed.report, { registry: registry(), parameters });
  const renderer = new HtmlRenderer();
  return renderer.render({ resolved: pipeline.resolved, resolvePageSection: pipeline.resolvePageSection });
}

const invoiceReport = {
  schemaVersion: "1.0",
  id: "invoice",
  name: "Invoice <Test>",
  datasets: [
    {
      id: "items",
      source: "inline",
      query: { data: [{ description: "Widget", quantity: 2, price: 500 }] },
    },
  ],
  sections: [
    { type: "reportHeader", children: [{ type: "text", value: "My Company" }] },
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

describe("HtmlRenderer", () => {
  it("renders basic report structure as a single page with correct mime type", async () => {
    const result = await renderReport(invoiceReport);
    expect(result.mimeType).toBe("text/html");
    expect(result.extension).toBe("html");
    const html = result.content as string;
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('class="page"');
    expect(html).toContain("My Company");
  });

  it("renders table rows and footer totals with correctly formatted currency", async () => {
    const html = (await renderReport(invoiceReport)).content as string;
    expect(html).toContain("Widget");
    expect(html).toContain("$1,000.00"); // 2 * 500
  });

  it("embeds the QR code as a self-contained PNG data URL image", async () => {
    const html = (await renderReport(invoiceReport)).content as string;
    expect(html).toMatch(/<img src="data:image\/png;base64,[^"]+"/);
  });

  it("escapes report name and user-provided text to prevent HTML/script injection", async () => {
    const malicious = {
      ...invoiceReport,
      sections: [{ type: "detail", children: [{ type: "text", value: '<script>alert(1)</script>' }] }],
    };
    const html = (await renderReport(malicious)).content as string;
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("splits a long table across multiple HTML pages with a repeated header", async () => {
    const manyRows = {
      ...invoiceReport,
      page: { size: "custom", width: 300, height: 320, unit: "pt", orientation: "portrait", margin: { top: 0, right: 0, bottom: 0, left: 0 } },
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
    const html = (await renderReport(manyRows)).content as string;
    const pageCount = (html.match(/class="page"/g) ?? []).length;
    expect(pageCount).toBeGreaterThan(1);
    const theadCount = (html.match(/<thead>/g) ?? []).length;
    expect(theadCount).toBe(pageCount); // header repeated on every page
  });

  it("renders multi-level header spans on each paginated page", async () => {
    const doc = {
      ...invoiceReport,
      page: { size: "custom", width: 300, height: 320, unit: "pt", orientation: "portrait", margin: { top: 0, right: 0, bottom: 0, left: 0 } },
      datasets: [{ id: "items", source: "inline", query: { data: Array.from({ length: 40 }, (_, i) => ({ description: `Item ${i}`, price: i })) } }],
      sections: [{ type: "detail", children: [{
        type: "table", dataset: "items", columns: [{ id: "description", header: "Item", binding: "row.description" }, { id: "price", header: "Price", binding: "row.price" }],
        headerRows: [[{ column: 0, text: "Sale", colSpan: 2 }], [{ column: 0, text: "Item" }, { column: 1, text: "Price" }]],
      }] }],
    };
    const html = String((await renderReport(doc)).content);
    const pageCount = (html.match(/class="page"/g) ?? []).length;
    expect(pageCount).toBeGreaterThan(1);
    expect((html.match(/colspan="2"/g) ?? []).length).toBe(pageCount);
    expect((html.match(/<thead>/g) ?? []).length).toBe(pageCount);
    expect((html.match(/<th(?:\s|>)/g) ?? []).length).toBe(pageCount * 3);
  });

  it("renders a chart as inline SVG", async () => {
    const withChart = {
      ...invoiceReport,
      sections: [
        {
          type: "detail",
          children: [
            { type: "chart", chartType: "bar", dataset: "items", categoryBinding: "row.description", series: [{ name: "Amount", binding: "row.price" }] },
          ],
        },
      ],
    };
    const html = (await renderReport(withChart)).content as string;
    expect(html).toContain("<svg");
    expect(html).toContain("<rect");
  });
});

describe("watermark", () => {
  it("is drawn on each page and its text is escaped", async () => {
    const r = await renderReport({ schemaVersion: "1.0", id: "w", name: "w", watermark: { text: "<DRAFT>" }, sections: [{ type: "detail", children: [{ type: "text", value: "x" }] }] });
    const html = String(r.content);
    expect(html).toContain('class="watermark"');
    expect(html).toContain("&lt;DRAFT&gt;");
    expect(html).not.toContain("<DRAFT>");
  });
});
