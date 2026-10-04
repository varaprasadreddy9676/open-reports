import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, InlineDataSource, resolveReport } from "@reporting/core";
import { PdfRenderer } from "../src/render.js";
import { extractPdfPages, extractPdfText } from "./pdf-helpers.js";

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

  it("applies conditional rules through pagination: per-row style and content, and page-phase footer rules per page", async () => {
    const rows = Array.from({ length: 200 }, (_, index) => ({ n: index + 1, flag: index % 80 === 0 ? "H" : "N" }));
    const result = await renderPdf({
      schemaVersion: "1.0", id: "rules-pdf", name: "Rules",
      datasets: [{ id: "rows", source: "inline", query: { data: rows } }],
      sections: [
        { type: "pageFooter", children: [
          { type: "text", id: "signature", value: "SIGNED-BY-DOCTOR", rules: [{ when: "!page.isLast", set: { visible: false } }] },
          { type: "text", id: "pager", value: "x", rules: [{ when: "true", set: { value: { expr: "'Page ' + page.number + (page.isFirst ? ' FIRST' : '')" } } }] },
        ] },
        { type: "detail", children: [{ type: "repeater", dataset: "rows", children: [
          { type: "text", binding: "'Row ' + row.n", rules: [{ when: { field: "row.flag", op: "==", value: "H" }, set: { value: { expr: "'HIGH ' + row.n" } } }] },
        ] }] },
      ],
    });
    const pages = await extractPdfPages(result.content as Buffer);
    expect(pages.length).toBeGreaterThan(2);
    pages.forEach((text, index) => {
      const last = index === pages.length - 1;
      expect(text.includes("SIGNED-BY-DOCTOR")).toBe(last);
      expect(text).toContain(`Page ${index + 1}${index === 0 ? " FIRST" : ""}`);
    });
    const all = pages.join("\n");
    expect(all).toContain("HIGH 1");
    expect(all).toContain("HIGH 81");
    expect(all).toContain("HIGH 161");
    expect(all).not.toContain("Row 81");
    expect(all).toContain("Row 82");
  });

  it("merges repeated values and prints a continuing merged value again at the top of each page", async () => {
    const rows = Array.from({ length: 120 }, (_, index) => ({ region: index < 100 ? "REGION-EAST" : "REGION-WEST", n: index + 1 }));
    const result = await renderPdf({
      schemaVersion: "1.0", id: "merged-regions", name: "Merged regions",
      datasets: [{ id: "rows", source: "inline", query: { data: rows } }],
      sections: [{ type: "detail", children: [{ type: "table", dataset: "rows", columns: [
        { id: "region", header: "Region", binding: "row.region", mergeRepeated: true },
        { id: "n", header: "Item", binding: "'Item ' + row.n" },
      ] }] }],
    });
    expect(result.warnings.filter((w) => w.code.startsWith("TABLE_"))).toEqual([]);
    const pages = await extractPdfPages(result.content as Buffer);
    expect(pages.length).toBeGreaterThan(2);
    const count = (text: string, word: string) => text.split(word).length - 1;
    pages.forEach((text) => {
      // Each page shows the region of its first row exactly once, plus WEST once on the page where it starts.
      const east = count(text, "REGION-EAST");
      const west = count(text, "REGION-WEST");
      expect(east + west).toBeGreaterThan(0);
      expect(east).toBeLessThanOrEqual(1);
      expect(west).toBeLessThanOrEqual(1);
    });
    const all = pages.join("\n");
    expect(count(all, "REGION-WEST")).toBe(1);
    expect(all).toContain("Item 120");
  });

  it("draws table styles: header and stripe fills, text colours and each grid-line mode", async () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({ item: `Item ${index + 1}`, qty: index + 1 }));
    const doc = (lines: string) => ({
      schemaVersion: "1.0", id: `styled-${lines}`, name: "Styled",
      theme: { colors: { brand: "#1d4ed8" }, tableStyles: { ledger: { header: { background: "$brand", color: "#ffffff" }, alternateRow: { background: "#fde68a" } } } },
      datasets: [{ id: "rows", source: "inline", query: { data: rows } }],
      sections: [{ type: "detail", children: [{ type: "table", dataset: "rows", tableStyle: "ledger", styles: { grid: { lines, color: "#ff0000", width: 1 } }, columns: [
        { id: "item", header: "Item", binding: "row.item" }, { id: "qty", header: "Qty", binding: "row.qty" },
      ] }] }],
    });
    const pixels = async (definition: unknown) => {
      const result = await renderPdf(definition);
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "table-style-"));
      try {
        fs.writeFileSync(path.join(dir, "t.pdf"), result.content as Buffer);
        execFileSync("pdftoppm", ["-r", "72", "-f", "1", "-l", "1", path.join(dir, "t.pdf"), path.join(dir, "p")]);
        const ppm = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith(".ppm"))!));
        // P6 header: "P6\n<w> <h>\n255\n"
        const header = ppm.subarray(0, 32).toString("latin1").split(/\s+/);
        const offset = ppm.indexOf("\n255\n") + 5;
        const count = (r: number, g: number, b: number, tolerance = 24) => {
          let n = 0;
          for (let i = offset; i + 2 < ppm.length; i += 3) if (Math.abs(ppm[i]! - r) <= tolerance && Math.abs(ppm[i + 1]! - g) <= tolerance && Math.abs(ppm[i + 2]! - b) <= tolerance) n++;
          return n;
        };
        expect(header[0]).toBe("P6");
        return { count };
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    };
    const all = await pixels(doc("all"));
    expect(all.count(0x1d, 0x4e, 0xd8)).toBeGreaterThan(500);   // header fill
    expect(all.count(0xfd, 0xe6, 0x8a)).toBeGreaterThan(500);   // stripes on rows 2, 4, 6
    expect(all.count(255, 0, 0, 40)).toBeGreaterThan(300);      // full grid in red
    const none = await pixels(doc("none"));
    expect(none.count(255, 0, 0, 40)).toBe(0);
    expect(none.count(0x1d, 0x4e, 0xd8)).toBeGreaterThan(500);
    const plain = await pixels({ ...doc("header"), theme: undefined, sections: [{ type: "detail", children: [{ type: "table", dataset: "rows", columns: [{ id: "item", header: "Item", binding: "row.item" }] }] }] });
    expect(plain.count(0x1d, 0x4e, 0xd8)).toBe(0);
    expect(plain.count(0xfd, 0xe6, 0x8a)).toBe(0);
  });

  it("splits a tall row whose column stacks many items, printing every item exactly once", async () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ type: "text", value: `STACKITEM${String(i + 1).padStart(3, "0")}` }));
    const result = await renderPdf({
      schemaVersion: "1.0", id: "tall-row", name: "Tall row",
      sections: [{ type: "detail", children: [{ type: "row", gap: 12, children: [
        { type: "container", width: "45%", gap: 4, style: { padding: 4, border: { width: 0.5, style: "solid", color: "#64748b" } }, children: items },
        { type: "text", width: "45%", value: Array.from({ length: 50 }, (_, i) => `Note line ${i + 1}`).join("\n") },
      ] }] }],
    });
    expect(result.warnings.filter((w) => ["CONTENT_OVERFLOWS_PAGE", "CONTAINER_CONTENT_EXCEEDS_HEIGHT"].includes(w.code))).toEqual([]);
    const pages = await extractPdfPages(result.content as Buffer);
    expect(pages.length).toBeGreaterThan(1);
    const all = pages.join("\n");
    for (let i = 1; i <= 60; i++) expect(all.split(`STACKITEM${String(i).padStart(3, "0")}`).length - 1).toBe(1);
    expect(all).toContain("Note line 50");
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
