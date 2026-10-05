import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, InlineDataSource, resolveReport } from "@reporting/core";
import { DocxRenderer } from "../src/render.js";

async function render(doc: unknown) {
  const parsed = parseReportDefinition(doc);
  if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
  const registry = new DataSourceRegistry();
  registry.register(new InlineDataSource());
  const p = await resolveReport(parsed.report, { registry, parameters: { customer: "Alex Morgan" } });
  const result = await new DocxRenderer().render({ resolved: p.resolved, resolvePageSection: p.resolvePageSection });
  const zip = await JSZip.loadAsync(result.content as Buffer);
  const xml = async (name: string) => (await zip.file(name)?.async("string")) ?? "";
  const files = Object.keys(zip.files);
  return { result, xml, files };
}

const invoice = {
  schemaVersion: "1.0", id: "inv", name: "Invoice",
  page: { size: "A4", orientation: "portrait" },
  parameters: [{ id: "customer", type: "string" }],
  datasets: [{ id: "items", source: "inline", query: { data: [{ item: "Eye exam", qty: 1, amount: 500 }, { item: "Lenses", qty: 2, amount: 6400 }] } }],
  sections: [
    { type: "pageHeader", children: [{ type: "text", value: "ACME HEALTH", style: { fontWeight: "bold", color: "#2563eb" } }] },
    { type: "detail", children: [
      { type: "text", value: "Invoice", bookmark: true, style: { fontSize: 20, fontWeight: "bold" } },
      { type: "text", expression: '"Bill to " + params.customer' },
      { type: "text", value: "Help", link: { url: "https://example.com/help" } },
      { type: "row", children: [{ type: "text", value: "Left column" }, { type: "text", value: "Right column", style: { align: "right" } }] },
      { type: "table", dataset: "items", showFooter: true, columns: [
        { header: "Item", binding: "row.item" },
        { header: "Qty", binding: "row.qty", align: "right" },
        { header: "Amount", binding: "row.amount", align: "right", format: "number:2", footer: { aggregate: "sum" } },
      ] },
      { type: "pageBreak" },
      { type: "qrcode", value: "INV-1001", width: 60, height: 60 },
    ] },
    { type: "pageFooter", children: [{ type: "text", expression: '"Page " + page.number + " of " + page.total', style: { align: "center" } }] },
  ],
};

describe("DOCX renderer", () => {
  it("produces a Word document with the report's text, in reading order", async () => {
    const { result, xml } = await render(invoice);
    expect(result.mimeType).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(result.extension).toBe("docx");
    const body = await xml("word/document.xml");
    for (const text of ["Invoice", "Bill to Alex Morgan", "Left column", "Right column", "Eye exam", "6,900.00"]) expect(body).toContain(text);
    expect(body.indexOf("Bill to")).toBeLessThan(body.indexOf("Eye exam"));
  });

  it("makes bookmarked text a Word heading, so it appears in the navigation pane", async () => {
    const body = await (await render(invoice)).xml("word/document.xml");
    expect(body).toMatch(/<w:pStyle w:val="Heading1"\/>[\s\S]{0,400}Invoice/);
  });

  it("writes tables as real Word tables whose header row repeats on every page", async () => {
    const body = await (await render(invoice)).xml("word/document.xml");
    expect(body).toContain("<w:tbl>");
    expect(body).toContain("<w:tblHeader/>");
  });

  it("keeps text styles: bold, colour, size and alignment", async () => {
    const { xml } = await render(invoice);
    const header = (await Promise.all(["word/header1.xml", "word/header2.xml", "word/header3.xml"].map(xml))).join("");
    expect(header).toContain("ACME HEALTH");
    expect(header).toContain('<w:color w:val="2563EB"/>');
    expect(header).toContain("<w:b/>");
  });

  it("turns page numbers in headers and footers into live Word fields", async () => {
    const { xml } = await render(invoice);
    const footer = (await Promise.all(["word/footer1.xml", "word/footer2.xml", "word/footer3.xml"].map(xml))).join("");
    expect(footer).toContain("Page ");
    expect(footer).toMatch(/PAGE/);
    expect(footer).toMatch(/NUMPAGES/);
    expect(footer).not.toMatch(/9876|1234/);
  });

  it("keeps links clickable and page breaks in place", async () => {
    const { xml } = await render(invoice);
    const body = await xml("word/document.xml");
    expect(body).toContain("<w:hyperlink");
    expect(await xml("word/_rels/document.xml.rels")).toContain("https://example.com/help");
    expect(body).toMatch(/<w:br w:type="page"\/>/);
  });

  it("embeds QR codes and barcodes as images", async () => {
    const { files } = await render(invoice);
    expect(files.some((name) => name.startsWith("word/media/"))).toBe(true);
  });

  it("uses the report's page size, orientation and margins", async () => {
    const body = await (await render({ ...invoice, page: { size: "A4", orientation: "landscape", unit: "mm", margin: { top: 20, right: 15, bottom: 20, left: 15 } } })).xml("word/document.xml");
    // A4 landscape in twentieths of a point: 297 mm = 16838, 210 mm = 11906; 15 mm = 850.
    expect(body).toMatch(/<w:pgSz w:w="1683\d" w:h="1190\d" w:orient="landscape"\/>/);
    expect(body).toMatch(/w:left="85\d"/);
  });

  it("explains what Word cannot show instead of silently dropping it", async () => {
    const { result } = await render({ ...invoice, sections: [{ type: "detail", children: [{ type: "chart", chartType: "bar", title: "Sales", series: [] }] }] });
    expect(result.warnings.map((warning) => warning.code)).toContain("DOCX_CHART_AS_TEXT");
  });
});
