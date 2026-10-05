import { describe, it, expect } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, InlineDataSource, resolveReport } from "@reporting/core";
import { HtmlRenderer } from "../src/render.js";

async function html(doc: unknown): Promise<string> {
  const parsed = parseReportDefinition(doc);
  if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
  const registry = new DataSourceRegistry();
  registry.register(new InlineDataSource());
  const p = await resolveReport(parsed.report, { registry });
  return String((await new HtmlRenderer().render({ resolved: p.resolved, resolvePageSection: p.resolvePageSection })).content);
}

const report = {
  schemaVersion: "1.0", id: "i", name: "i",
  datasets: [{ id: "orders", source: "inline", query: { data: [{ id: 7, customer: "Ann & Co" }] } }],
  sections: [{ type: "detail", children: [
    { type: "text", value: "Orders", bookmark: true, bookmarkLevel: 1 },
    { type: "text", value: "Help", link: { url: "https://example.com/help?a=1&b=2" } },
    { id: "orders", type: "table", dataset: "orders", columns: [
      { id: "no", header: "No", binding: "row.id", link: { report: "invoice", parameters: { invoiceId: "row.id" } } },
      { id: "customer", header: "Customer", binding: "row.customer" },
    ] },
  ] }],
};

describe("interactive HTML output", () => {
  it("marks bookmarks so a viewer can build a document map", async () => {
    expect(await html(report)).toMatch(/data-bookmark="Orders" data-bookmark-level="1"/);
  });

  it("renders web links that open safely in a new tab", async () => {
    expect(await html(report)).toContain('<a href="https://example.com/help?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">Help</a>');
  });

  it("renders drill-through links in table cells with their report and parameters", async () => {
    const out = await html(report);
    expect(out).toContain('href="report:invoice?invoiceId=7" data-report="invoice" data-parameters="{&quot;invoiceId&quot;:7}"');
  });

  it("marks tables and their columns so a viewer can sort them", async () => {
    const out = await html(report);
    expect(out).toContain('data-component="orders"');
    expect(out).toMatch(/<th[^>]*data-column="no"/);
    expect(out).toMatch(/<th[^>]*data-column="customer"/);
  });
});
