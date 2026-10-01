import { describe, it, expect } from "vitest";
import type { ResolvedReport, ResolvedTableComponent } from "@reporting/core";
import { CsvRenderer, streamCsvRows } from "../src/render.js";
import { AmbiguousCsvTargetError, NoTableFoundError, findCsvTable } from "../src/find-table.js";

function table(overrides: Partial<ResolvedTableComponent> = {}): ResolvedTableComponent {
  return {
    type: "table",
    id: "items",
    dataset: "items",
    columns: [
      { id: "name", header: "Name" },
      { id: "amount", header: "Amount" },
    ],
    rows: [
      { raw: { name: "Widget", amount: 1000 }, formatted: { name: "Widget", amount: "$1,000.00" } },
      { raw: { name: 'Say "Hi", please', amount: 2000 }, formatted: { name: 'Say "Hi", please', amount: "$2,000.00" } },
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
    name: "R",
    locale: "en-US",
    page: { size: "A4", orientation: "portrait", unit: "mm", margin: { top: 0, right: 0, bottom: 0, left: 0 } } as any,
    sections: [{ type: "detail", children: tables }],
    exports: exportsConfig,
    warnings: [],
  };
}

describe("CsvRenderer", () => {
  it("uses raw (not formatted) values, so numbers export as plain numbers", async () => {
    const renderer = new CsvRenderer();
    const result = await renderer.render({ resolved: report([table()]), resolvePageSection: (s) => s.children });
    const text = result.content as string;
    expect(text).toContain("Widget,1000");
    expect(text).not.toContain("$1,000.00");
  });

  it("escapes embedded commas, quotes, and preserves UTF-8", async () => {
    const t = table({
      rows: [{ raw: { name: "Grüße, mon ami", amount: 5 }, formatted: { name: "Grüße, mon ami", amount: "5" } }],
    } as any);
    const renderer = new CsvRenderer();
    const result = await renderer.render({ resolved: report([t]), resolvePageSection: (s) => s.children });
    const text = result.content as string;
    expect(text).toContain('"Grüße, mon ami"');
  });

  it("doubles embedded quotes per RFC 4180", async () => {
    const renderer = new CsvRenderer();
    const result = await renderer.render({ resolved: report([table()]), resolvePageSection: (s) => s.children });
    const text = result.content as string;
    expect(text).toContain('"Say ""Hi"", please"');
  });

  it("supports a configurable delimiter and newline", async () => {
    const renderer = new CsvRenderer();
    const result = await renderer.render({
      resolved: report([table()], { csv: { delimiter: ";", newline: "\r\n" } }),
      resolvePageSection: (s) => s.children,
    });
    const text = result.content as string;
    expect(text.split("\r\n")[0]).toBe("Name;Amount");
  });

  it("can omit headers", async () => {
    const renderer = new CsvRenderer();
    const result = await renderer.render({ resolved: report([table()], { csv: { includeHeaders: false } }), resolvePageSection: (s) => s.children });
    const text = result.content as string;
    expect(text.split("\n")[0]).toBe("Widget,1000");
  });

  it("streams rows without materializing the whole table upfront", () => {
    const bigTable = table({
      rows: Array.from({ length: 10_000 }, (_, i) => ({ raw: { name: `Row ${i}`, amount: i }, formatted: {} })),
    } as any);
    let count = 0;
    for (const _line of streamCsvRows(bigTable)) {
      count++;
      if (count > 5) break; // prove we can stop early without generating the rest
    }
    expect(count).toBe(6);
  });

  it("exports all 10,000 rows correctly when fully consumed", async () => {
    const bigTable = table({
      rows: Array.from({ length: 10_000 }, (_, i) => ({ raw: { name: `Row ${i}`, amount: i }, formatted: {} })),
    } as any);
    const renderer = new CsvRenderer();
    const result = await renderer.render({ resolved: report([bigTable]), resolvePageSection: (s) => s.children });
    const lines = (result.content as string).trim().split("\n");
    expect(lines).toHaveLength(10_001); // header + 10000 rows
    expect(lines[10000]).toBe("Row 9999,9999");
  });
});

describe("findCsvTable", () => {
  it("picks the single table automatically when there is only one", () => {
    const t = table();
    expect(findCsvTable(report([t]))).toBe(t);
  });

  it("throws AmbiguousCsvTargetError with multiple tables and no target", () => {
    const t1 = table({ id: "a", dataset: "a" } as any);
    const t2 = table({ id: "b", dataset: "b" } as any);
    expect(() => findCsvTable(report([t1, t2]))).toThrow(AmbiguousCsvTargetError);
  });

  it("resolves the named target among multiple tables", () => {
    const t1 = table({ id: "a", dataset: "a" } as any);
    const t2 = table({ id: "b", dataset: "b" } as any);
    expect(findCsvTable(report([t1, t2]), "b")).toBe(t2);
  });

  it("throws NoTableFoundError when the report has no tables", () => {
    expect(() => findCsvTable(report([]))).toThrow(NoTableFoundError);
  });
});
