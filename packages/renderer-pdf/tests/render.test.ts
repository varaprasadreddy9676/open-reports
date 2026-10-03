import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

  it("draws explicit line height at the same advance used for layout", async () => {
    const report = { schemaVersion: "1.0", id: "line-height", name: "Line height", sections: [
      { type: "detail", children: [{ type: "text", value: "ONE\nTWO\nTHREE", width: 200, height: 100, style: { fontSize: 12, lineHeight: 1.8 } }] },
    ] };
    const pdf = (await renderPdf(report)).content as Buffer;
    const file = path.join(os.tmpdir(), `report-line-height-${process.pid}-${Date.now()}.pdf`);
    fs.writeFileSync(file, pdf);
    try {
      const boxes = execFileSync("pdftotext", ["-bbox", file, "-"], { encoding: "utf-8" });
      const words = [...boxes.matchAll(/<word xMin="[\d.]+" yMin="([\d.]+)" xMax="[\d.]+" yMax="[\d.]+">(ONE|TWO|THREE)<\/word>/g)].map((match) => ({ text: match[2], y: Number(match[1]) }));
      expect(words.map((word) => word.text)).toEqual(["ONE", "TWO", "THREE"]);
      expect(words[1]!.y - words[0]!.y).toBeCloseTo(21.6, 1);
      expect(words[2]!.y - words[1]!.y).toBeCloseTo(21.6, 1);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  it("prints hugged and fixed text at their distributed row positions", async () => {
    const report = { schemaVersion: "1.0", id: "row-hug", name: "Row hug", page: {
      size: "custom", width: 300, height: 300, unit: "pt", orientation: "portrait", margin: { top: 10, right: 10, bottom: 10, left: 10 },
    }, sections: [{ type: "detail", layout: "row", gap: 12, justifyContent: "space-between", children: [
      { type: "text", value: "PATIENTLABEL", width: "auto" },
      { type: "text", value: "ASHA", width: 60 },
    ] }] };
    const pdf = (await renderPdf(report)).content as Buffer;
    const file = path.join(os.tmpdir(), `report-row-hug-${process.pid}-${Date.now()}.pdf`);
    fs.writeFileSync(file, pdf);
    try {
      const boxes = execFileSync("pdftotext", ["-bbox", file, "-"], { encoding: "utf-8" });
      const words = [...boxes.matchAll(/<word xMin="([\d.]+)" yMin="[\d.]+" xMax="([\d.]+)" yMax="[\d.]+">(PATIENTLABEL|ASHA)<\/word>/g)]
        .map((match) => ({ text: match[3], left: Number(match[1]), right: Number(match[2]) }));
      expect(words.map((word) => word.text)).toEqual(["PATIENTLABEL", "ASHA"]);
      expect(words[1]!.left - words[0]!.right).toBeGreaterThan(100);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  it("keeps fixed-height text inside its box instead of adding PDFKit pages", async () => {
    const longText = Array.from({ length: 90 }, (_, index) => `MARKER${String(index).padStart(3, "0")}`).join("\n");
    for (const overflow of ["clip", "ellipsis"] as const) {
      const report = { schemaVersion: "1.0", id: `overflow-${overflow}`, name: "Overflow", sections: [
        { type: "detail", children: [
          { type: "text", id: "limited", value: longText, width: 150, height: 35, style: { fontSize: 10, overflow } },
          { type: "text", id: "after", value: "AFTER-BOX", height: 18 },
        ] },
      ] };
      const result = await renderPdf(report);
      const extracted = await extractPdfText(result.content as Buffer);
      expect(extracted.numPages).toBe(1);
      expect(extracted.text).toContain("AFTER-BOX");
      expect(extracted.text).not.toContain("MARKER089");
      expect(result.warnings.some((warning) => warning.code === "TEXT_TRUNCATED_BY_POLICY")).toBe(true);
    }
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

  it("renders Telugu text with null OpenType mark anchors", async () => {
    const telugu = "మా ఆసుపత్రికి స్వాగతం. దయచేసి ఈ పత్రాన్ని భద్రంగా ఉంచండి.";
    const report = {
      ...invoiceReport,
      sections: [{ type: "detail", children: [{ type: "text", value: telugu, style: { fontSize: 12 } }] }],
    };
    const parsed = parseReportDefinition(report);
    if (!parsed.valid) throw new Error("fixture invalid");
    const pipeline = await resolveReport(parsed.report, { registry: registry(), parameters: {} });
    const font = fileURLToPath(new URL("./fixtures/fonts/NotoSansTelugu-Regular.ttf", import.meta.url));
    const renderer = new PdfRenderer({ fonts: { families: { Telugu: { regular: font } }, scriptFamilies: { telugu: "Telugu" } } });
    const result = await renderer.render({ resolved: pipeline.resolved, resolvePageSection: pipeline.resolvePageSection });
    const pdf = result.content as Buffer;
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect((await extractPdfText(pdf)).text).toMatch(/[ఀ-౿]/u);
  });

  it("flags a missing/unfetchable image with a warning instead of throwing", async () => {
    const withImage = {
      ...invoiceReport,
      sections: [{ type: "detail", children: [{ type: "image", src: "https://example.com/logo.png" }] }],
    };
    const result = await renderPdf(withImage);
    expect(result.warnings.some((w) => w.code === "IMAGE_NOT_EMBEDDED")).toBe(true);
  });

  it("never reads a local file path itself; linked files are resolved by the server first", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-local-image-"));
    const file = path.join(dir, "secret.png");
    // A valid 1x1 PNG, so a read would embed it rather than fail.
    fs.writeFileSync(file, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==", "base64"));
    try {
      const withImage = { ...invoiceReport, sections: [{ type: "detail", children: [{ type: "image", id: "logo", src: file }] }] };
      const result = await renderPdf(withImage);
      const warning = result.warnings.find((w) => w.code === "IMAGE_NOT_EMBEDDED");
      expect(warning?.message).toMatch(/server/i);
      expect((result.content as Buffer).includes(Buffer.from("/Subtype /Image"))).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("surfaces a warning when a merged body cell covers different data", async () => {
    const withMerge = {
      ...invoiceReport,
      sections: [{
        type: "detail",
        children: [{
          type: "table",
          dataset: "items",
          columns: invoiceReport.sections[1]!.children![0]!.columns,
          cellSpans: [{ row: 0, column: 0, colSpan: 2 }],
        }],
      }],
    };
    const result = await renderPdf(withMerge);
    expect(result.warnings.some((warning) => warning.code === "TABLE_MERGE_HIDES_DATA")).toBe(true);
  });
});
