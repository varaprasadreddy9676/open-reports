import { describe, it, expect } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, InlineDataSource, resolveReport } from "@reporting/core";
import { EscPosRenderer } from "../src/index.js";

const registry = new DataSourceRegistry();
registry.register(new InlineDataSource());

async function render(doc: any) {
  const parsed = parseReportDefinition(doc);
  if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
  const p = await resolveReport(parsed.report, { registry, parameters: {} });
  return new EscPosRenderer().render({ resolved: p.resolved, resolvePageSection: p.resolvePageSection });
}
const receipt = (width: number, children: unknown[], extra: object = {}) => ({
  schemaVersion: "1.0", id: "r", name: "r", theme: { currency: "INR" },
  page: { size: "custom", width, height: 200, unit: "mm", margin: { top: 3, right: 3, bottom: 3, left: 3 } },
  datasets: [{ id: "s", source: "inline", query: { data: { items: [{ n: "Paracetamol 500", q: 2, p: 24 }, { n: "ORS", q: 3, p: 18 }] } } }],
  sections: [{ type: "detail", children }], ...extra,
});
const ascii = (b: Buffer) => b.toString("latin1");

describe("EscPosRenderer", () => {
  it("starts with reset, ends with a cut, and prints centred bold headings", async () => {
    const r = await render(receipt(80, [{ type: "text", value: "ACME PHARMACY", style: { align: "center", fontWeight: "bold" } }]));
    const b = r.content as Buffer;
    expect([...b.subarray(0, 2)]).toEqual([0x1b, 0x40]);
    expect([...b.subarray(b.length - 4)]).toEqual([0x1d, 0x56, 0x42, 0x00]);
    expect(ascii(b)).toContain("ACME PHARMACY");
    expect(b.includes(Buffer.from([0x1b, 0x61, 1]))).toBe(true); // centre
    expect(b.includes(Buffer.from([0x1b, 0x45, 1]))).toBe(true); // bold on
  });

  it("uses 48 columns on 80 mm and ~32 on 58 mm, wrapping long text", async () => {
    const long = "word ".repeat(30).trim();
    const r80 = ascii((await render(receipt(80, [{ type: "text", value: long }]))).content as Buffer).split("\n");
    const r58 = ascii((await render(receipt(58, [{ type: "text", value: long }]))).content as Buffer).split("\n");
    const strip = (l: string) => l.replace(/\x1b[\s\S][\s\S]?|\x1d[\s\S][\s\S]/g, "").replace(/[\x00-\x1f]/g, "");
    const max = (ls: string[]) => Math.max(...ls.map((l) => strip(l).length));
    expect(max(r80)).toBeLessThanOrEqual(52);
    expect(max(r58)).toBeLessThanOrEqual(36);
    expect(max(r58)).toBeLessThan(max(r80));
  });

  it("right-aligns a label/value row and prints tables with aligned columns", async () => {
    const r = await render(receipt(80, [
      { type: "table", dataset: "s.items", columns: [{ id: "n", header: "Item", binding: "row.n", width: "*" }, { id: "q", header: "Qty", binding: "row.q", width: 30, align: "right" }, { id: "a", header: "Amt", expression: "row.q * row.p", format: "number:2", width: 50, align: "right" }] },
      { type: "row", children: [{ type: "text", value: "TOTAL", style: { fontWeight: "bold" } }, { type: "text", value: "102.00" }] },
    ]));
    const text = ascii(r.content as Buffer);
    expect(text).toContain("Paracetamol 500");
    const total = text.split("\n").find((l) => l.includes("TOTAL"))!.replace(/[\x00-\x1f]/g, "");
    expect(total.trimEnd().endsWith("102.00")).toBe(true);
    expect(total.length).toBeGreaterThan(40);
  });

  it("prints both levels of an explicit merged table header", async () => {
    const r = await render(receipt(80, [{
      type: "table", dataset: "s.items", columns: [{ id: "n", header: "Name", binding: "row.n", width: "*" }, { id: "q", header: "Qty", binding: "row.q", width: 30 }],
      headerRows: [[{ column: 0, text: "Sale", colSpan: 2 }], [{ column: 0, text: "Item" }, { column: 1, text: "Qty" }]],
    }]));
    const printed = ascii(r.content as Buffer);
    expect(printed).toContain("Sale");
    expect(printed).toContain("Item");
    expect(printed).toContain("Paracetamol 500");
    expect(r.warnings).toEqual([]);
  });

  it.each([58, 80])("keeps all 500 items in order on a continuous %i mm receipt", async (width) => {
    const doc = receipt(width, [{
      type: "table", dataset: "s.items", columns: [
        { id: "n", header: "Item", binding: "row.n", width: "*" },
        { id: "q", header: "Qty", binding: "row.q", width: 30, align: "right" },
      ],
    }]);
    doc.datasets[0]!.query.data.items = Array.from({ length: 500 }, (_, i) => ({ n: `Item${String(i).padStart(4, "0")}`, q: i + 1, p: 1 }));
    const result = await render(doc);
    const bytes = result.content as Buffer;
    const printed = [...ascii(bytes).matchAll(/Item\d{4}/g)].map((match) => match[0]);
    expect(printed).toEqual(Array.from({ length: 500 }, (_, i) => `Item${String(i).padStart(4, "0")}`));
    expect(bytes.subarray(bytes.length - 4).equals(Buffer.from([0x1d, 0x56, 0x42, 0x00]))).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("emits QR and Code 128 commands", async () => {
    const r = await render(receipt(80, [{ type: "qrcode", value: "https://x.test/1" }, { type: "barcode", value: "UH12345", symbology: "code128" }]));
    const b = r.content as Buffer;
    expect(b.includes(Buffer.from([0x1d, 0x28, 0x6b]))).toBe(true);
    expect(b.includes(Buffer.from("https://x.test/1"))).toBe(true);
    expect(b.includes(Buffer.from([0x1d, 0x6b, 0x49]))).toBe(true);
    expect(b.includes(Buffer.from("{BUH12345"))).toBe(true);
  });

  it("substitutes ₹ and warns once per unsupported character", async () => {
    const r = await render(receipt(80, [{ type: "text", value: "Total ₹100 नमस्ते नमस्ते" }]));
    expect(ascii(r.content as Buffer)).toContain("Total Rs.100");
    expect(r.warnings.filter((w) => w.code === "ESCPOS_UNSUPPORTED_CHAR").length).toBeGreaterThanOrEqual(1);
    const chars = r.warnings.map((w) => w.message);
    expect(new Set(chars).size).toBe(chars.length);
  });

  it("warns about components it cannot print", async () => {
    const r = await render(receipt(80, [{ type: "chart", chartType: "bar", dataset: "s.items", series: [], height: 100 }]));
    expect(r.warnings.some((w) => w.code === "ESCPOS_UNSUPPORTED_COMPONENT")).toBe(true);
  });
});
