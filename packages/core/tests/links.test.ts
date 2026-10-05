import { describe, it, expect } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { resolveLink } from "../src/links.js";
import { DataSourceRegistry, InlineDataSource, resolveReport } from "../src/index.js";

const row = { id: 1042, awb: "AB 12" };
const evaluate = (expression: string) => {
  if (expression === "row.id") return row.id;
  if (expression === '"https://track.example.com/" + row.awb') return `https://track.example.com/${row.awb}`;
  if (expression === '"javascript:alert(1)"') return "javascript:alert(1)";
  return undefined;
};

describe("links", () => {
  it("keeps a static web, mail or phone link", () => {
    const warnings: string[] = [];
    expect(resolveLink({ url: "https://example.com/help" }, evaluate, (w) => warnings.push(w))).toEqual({ href: "https://example.com/help" });
    expect(resolveLink({ url: "mailto:billing@example.com" }, evaluate, (w) => warnings.push(w))?.href).toBe("mailto:billing@example.com");
    expect(resolveLink({ url: "tel:+911234567890" }, evaluate, (w) => warnings.push(w))?.href).toBe("tel:+911234567890");
    expect(warnings).toEqual([]);
  });

  it("evaluates a computed link per record", () => {
    expect(resolveLink({ expression: '"https://track.example.com/" + row.awb' }, evaluate, () => undefined)?.href).toBe("https://track.example.com/AB%2012");
  });

  it("refuses script and other unsafe schemes", () => {
    const warnings: string[] = [];
    expect(resolveLink({ expression: '"javascript:alert(1)"' }, evaluate, (w) => warnings.push(w))).toBeUndefined();
    expect(resolveLink({ url: "data:text/html,<script>alert(1)</script>" }, evaluate, (w) => warnings.push(w))).toBeUndefined();
    expect(warnings).toHaveLength(2);
  });

  it("drills through to another report with evaluated parameters", () => {
    expect(resolveLink({ report: "invoice", parameters: { invoiceId: "row.id" } }, evaluate, () => undefined)).toEqual({
      href: "report:invoice?invoiceId=1042",
      report: { id: "invoice", parameters: { invoiceId: 1042 } },
    });
  });

  it("is attached to text and to table cells when a report resolves", async () => {
    const parsed = parseReportDefinition({
      schemaVersion: "1.0", id: "l", name: "l",
      datasets: [{ id: "invoices", source: "inline", query: { data: [{ id: 7, total: 10 }] } }],
      sections: [{ type: "detail", children: [
        { id: "help", type: "text", value: "Help", link: { url: "https://example.com" } },
        { id: "t", type: "table", dataset: "invoices", columns: [{ id: "no", header: "No", binding: "row.id", link: { report: "invoice", parameters: { invoiceId: "row.id" } } }, { id: "total", header: "Total", binding: "row.total" }] },
      ] }],
    });
    expect(parsed.valid, JSON.stringify(!parsed.valid && parsed.issues)).toBe(true);
    if (!parsed.valid) return;
    const registry = new DataSourceRegistry();
    registry.register(new InlineDataSource());
    const { resolved } = await resolveReport(parsed.report, { registry });
    const all = (nodes: any[]): any[] => nodes.flatMap((node) => [node, ...all(node.children ?? [])]);
    const nodes = all((resolved.sections as any[]).flatMap((section) => section.children ?? []));
    expect(nodes.find((node) => node.id === "help").link).toEqual({ href: "https://example.com" });
    expect(nodes.find((node) => node.id === "t").rows[0].links).toEqual({ no: { href: "report:invoice?invoiceId=7", report: { id: "invoice", parameters: { invoiceId: 7 } } } });
  });
});

describe("links being edited", () => {
  it("treats an empty report or formula as no link yet", () => {
    expect(resolveLink({ report: "" }, evaluate, () => undefined)).toBeUndefined();
    expect(resolveLink({ expression: " " }, evaluate, () => undefined)).toBeUndefined();
  });

  it("accepts an empty link while it is being typed, but not two kinds at once", () => {
    expect(parseReportDefinition({ schemaVersion: "1.0", id: "a", name: "a", sections: [{ type: "detail", children: [{ type: "text", value: "x", link: { expression: "" } }] }] }).valid).toBe(true);
    expect(parseReportDefinition({ schemaVersion: "1.0", id: "a", name: "a", sections: [{ type: "detail", children: [{ type: "text", value: "x", link: { url: "https://a.b", report: "c" } }] }] }).valid).toBe(false);
  });
});
