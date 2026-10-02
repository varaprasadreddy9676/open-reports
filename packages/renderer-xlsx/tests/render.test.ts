import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import type { ResolvedReport, ResolvedTableComponent } from "@reporting/core";
import { XlsxRenderer } from "../src/render.js";

function table(overrides: Partial<ResolvedTableComponent> = {}): ResolvedTableComponent {
  return {
    type: "table",
    id: "items",
    dataset: "items",
    columns: [
      { id: "name", header: "Name" },
      { id: "amount", header: "Amount", format: "currency" },
      { id: "date", header: "Date", format: "date" },
    ],
    rows: [
      { raw: { name: "Widget", amount: 1000, date: new Date("2024-01-15") }, formatted: { name: "Widget", amount: "$1,000.00", date: "2024-01-15" } },
      { raw: { name: "Gadget", amount: 2000, date: new Date("2024-02-20") }, formatted: { name: "Gadget", amount: "$2,000.00", date: "2024-02-20" } },
    ],
    showHeader: true,
    showFooter: false,
    repeatHeaderOnPageBreak: true,
    keepRowTogether: true,
    ...overrides,
  } as ResolvedTableComponent;
}

function report(tables: ResolvedTableComponent[], exportsConfig?: ResolvedReport["exports"]): ResolvedReport {
  return {
    id: "r",
    name: "Invoice Report",
    locale: "en-US",
    page: { size: "A4", orientation: "portrait", unit: "mm", margin: { top: 0, right: 0, bottom: 0, left: 0 } } as any,
    sections: [{ type: "detail", children: tables }],
    exports: exportsConfig,
    warnings: [],
  };
}

async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

describe("XlsxRenderer", () => {
  it("produces a valid XLSX file with the configured sheet name", async () => {
    const renderer = new XlsxRenderer();
    const result = await renderer.render({ resolved: report([table()], { xlsx: { sheetName: "Invoice" } }), resolvePageSection: (s) => s.children });
    expect(result.mimeType).toContain("spreadsheetml");
    const wb = await loadWorkbook(result.content as Buffer);
    expect(wb.worksheets).toHaveLength(1);
    expect(wb.worksheets[0]!.name).toBe("Invoice");
  });

  it("writes real typed cells: numbers stay numbers, dates stay dates", async () => {
    const renderer = new XlsxRenderer();
    const result = await renderer.render({ resolved: report([table()]), resolvePageSection: (s) => s.children });
    const wb = await loadWorkbook(result.content as Buffer);
    const sheet = wb.worksheets[0]!;

    const row2 = sheet.getRow(2);
    expect(row2.getCell(1).value).toBe("Widget");
    expect(row2.getCell(2).value).toBe(1000);
    expect(typeof row2.getCell(2).value).toBe("number");
    expect(row2.getCell(2).numFmt).toContain("0.00");
    expect(row2.getCell(3).value).toBeInstanceOf(Date);
  });

  it("bolds the header row and freezes it", async () => {
    const renderer = new XlsxRenderer();
    const result = await renderer.render({ resolved: report([table()]), resolvePageSection: (s) => s.children });
    const wb = await loadWorkbook(result.content as Buffer);
    const sheet = wb.worksheets[0]!;
    expect(sheet.getRow(1).getCell(1).font?.bold).toBe(true);
    expect(sheet.views?.[0]?.state).toBe("frozen");
  });

  it("merges horizontal and vertical multi-level headers and keeps typed data below them", async () => {
    const t = table({ headerRows: [
      [{ column: 0, text: "Product", rowSpan: 2 }, { column: 1, text: "Sale", colSpan: 2 }],
      [{ column: 1, text: "Amount" }, { column: 2, text: "Date" }],
    ] });
    const result = await new XlsxRenderer().render({ resolved: report([t]), resolvePageSection: (s) => s.children });
    const sheet = (await loadWorkbook(result.content as Buffer)).worksheets[0]!;
    expect(sheet.getCell("A1").value).toBe("Product");
    expect(sheet.getCell("B1").value).toBe("Sale");
    expect(sheet.getCell("B2").value).toBe("Amount");
    expect(sheet.getCell("C2").value).toBe("Date");
    expect(sheet.getCell("A2").isMerged).toBe(true);
    expect(sheet.getCell("C1").isMerged).toBe(true);
    expect(sheet.getCell("A3").value).toBe("Widget");
    expect(sheet.getCell("B3").value).toBe(1000);
    expect(sheet.views?.[0]?.ySplit).toBe(2);
  });

  it("writes footer totals as real numbers (not formatted strings)", async () => {
    const t = table({
      showFooter: true,
      columns: [
        { id: "name", header: "Name" },
        { id: "amount", header: "Amount", format: "currency", footer: { label: "Total", value: "$3,000.00", raw: 3000 } },
      ],
    } as any);
    const renderer = new XlsxRenderer();
    const result = await renderer.render({ resolved: report([t]), resolvePageSection: (s) => s.children });
    const wb = await loadWorkbook(result.content as Buffer);
    const sheet = wb.worksheets[0]!;
    const footerRow = sheet.getRow(sheet.rowCount);
    expect(footerRow.getCell(2).value).toBe(3000);
    expect(typeof footerRow.getCell(2).value).toBe("number");
    expect(footerRow.getCell(1).font?.bold).toBe(true);
  });

  it("writes one worksheet per table for multiple datasets", async () => {
    const t1 = table({ id: "a", dataset: "a" } as any);
    const t2 = table({ id: "b", dataset: "b" } as any);
    const renderer = new XlsxRenderer();
    const result = await renderer.render({ resolved: report([t1, t2]), resolvePageSection: (s) => s.children });
    const wb = await loadWorkbook(result.content as Buffer);
    expect(wb.worksheets).toHaveLength(2);
    expect(wb.worksheets.map((s) => s.name)).toEqual(["a", "b"]);
  });

  it("handles a large (10,000-row) export correctly and fully", async () => {
    const bigTable = table({
      columns: [{ id: "n", header: "N" }],
      rows: Array.from({ length: 10_000 }, (_, i) => ({ raw: { n: i }, formatted: { n: String(i) } })),
    } as any);
    const renderer = new XlsxRenderer();
    const result = await renderer.render({ resolved: report([bigTable]), resolvePageSection: (s) => s.children });
    const wb = await loadWorkbook(result.content as Buffer);
    const sheet = wb.worksheets[0]!;
    expect(sheet.rowCount).toBe(10_001); // header + 10000 data rows
    expect(sheet.getRow(10001).getCell(1).value).toBe(9999);
  });
});
