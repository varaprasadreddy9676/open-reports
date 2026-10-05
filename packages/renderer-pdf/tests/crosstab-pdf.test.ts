import { describe, it, expect } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, InlineDataSource, resolveReport } from "@reporting/core";
import { PdfRenderer } from "../src/render.js";
import { extractPdfPages } from "./pdf-helpers.js";

const registry = new DataSourceRegistry();
registry.register(new InlineDataSource());

const regions = ["North", "South", "East", "West"];
const months = ["Jan", "Feb", "Mar"];
const sales = Array.from({ length: 400 }, (_, i) => ({ region: regions[i % 4], month: months[i % 3], doctor: `Dr ${String(i % 100).padStart(3, "0")}`, amount: 10 }));

async function render(crosstab: Record<string, unknown>) {
  const parsed = parseReportDefinition({
    schemaVersion: "1.0", id: "x", name: "x",
    datasets: [{ id: "sales", source: "inline", query: { data: sales } }],
    sections: [{ type: "detail", children: [{ id: "pivot", type: "crosstab", dataset: "sales", columns: [{ binding: "row.month" }], ...crosstab }] }],
  });
  if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
  const p = await resolveReport(parsed.report, { registry, parameters: {} });
  return extractPdfPages((await new PdfRenderer().render({ resolved: p.resolved, resolvePageSection: p.resolvePageSection })).content as Buffer);
}

describe("crosstab in PDF", () => {
  it("prints row and column headings, cells and totals", async () => {
    const [page] = await render({ rows: [{ binding: "row.region", header: "Region" }], measures: [{ binding: "row.amount" }] });
    for (const text of ["Region", "Jan", "Feb", "Mar", "North", "West", "Total", "4000"]) expect(page).toContain(text);
  });

  it("repeats its two-level header on every page of a long crosstab", async () => {
    const pages = await render({ rows: [{ binding: "row.doctor", header: "Doctor" }, { binding: "row.region", header: "Region" }], measures: [{ binding: "row.amount", header: "Sales" }, { binding: "row.amount", aggregate: "count", header: "Visits" }] });
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page).toContain("Doctor");
      expect(page).toContain("Visits");
    }
    expect(pages.at(-1)).toContain("Total");
  });
});

describe("links in PDF", () => {
  it("adds clickable web links for elements and table cells, and leaves out drill-through links", async () => {
    const parsed = parseReportDefinition({
      schemaVersion: "1.0", id: "l", name: "l",
      datasets: [{ id: "o", source: "inline", query: { data: [{ id: 7, site: "https://example.com/orders/7" }] } }],
      sections: [{ type: "detail", children: [
        { type: "text", value: "Help", link: { url: "https://example.com/help" } },
        { type: "table", dataset: "o", columns: [{ id: "order", header: "Order", binding: "row.id", link: { expression: "row.site" } }, { id: "invoice", header: "Invoice", binding: "row.id", link: { report: "invoice", parameters: { invoiceId: "row.id" } } }] },
      ] }],
    });
    if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
    const p = await resolveReport(parsed.report, { registry, parameters: {} });
    const pdf = ((await new PdfRenderer().render({ resolved: p.resolved, resolvePageSection: p.resolvePageSection })).content as Buffer).toString("latin1");
    expect(pdf).toContain("https://example.com/help");
    expect(pdf).toContain("https://example.com/orders/7");
    expect(pdf).not.toContain("report:invoice");
  });
});
