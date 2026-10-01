import { describe, it, expect } from "vitest";
import { parseCsv } from "../../src/lib/csv";

describe("parseCsv", () => {
  it("parses quoted fields, escaped quotes, embedded newlines and CRLF", () => {
    const rows = parseCsv('name,note,qty\r\n"Smith, J","He said ""hi""",3\r\n"Line\nbreak",x,4.5\r\n');
    expect(rows).toEqual([
      { name: "Smith, J", note: 'He said "hi"', qty: 3 },
      { name: "Line\nbreak", note: "x", qty: 4.5 },
    ]);
  });
  it("detects semicolons, keeps leading-zero ids as strings, nulls blanks and dedupes headers", () => {
    const rows = parseCsv("id;a;a\n007;1;\n");
    expect(rows).toEqual([{ id: "007", a: 1, a_2: null }]);
  });
  it("handles an empty file and a BOM", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("﻿x\n1")).toEqual([{ x: 1 }]);
  });
});
