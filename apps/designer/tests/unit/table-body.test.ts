import { describe, expect, it } from "vitest";
import { anchorOptions, describeAnchor, mergeBodyCells, removeBodyColumn, splitBodyCell } from "../../src/lib/table-body";

const columns = [{ id: "code", binding: "row.code" }, { id: "name", binding: "row.name" }, { id: "qty", expression: "row.qty * 2" }, { id: "when", binding: "row.when" }];
const rows = [
  { raw: { code: "A1", name: "Alpha", qty: 2, when: new Date(0) }, formatted: {} },
  { raw: { code: "B2", name: "Alpha", qty: 4, when: null }, formatted: {} },
  { raw: { code: "C3", name: "Gamma", qty: 6, when: null }, formatted: {} },
] as any[];

describe("table body merge editing", () => {
  it("merges a rectangle at a row position and splits it from any covered cell", () => {
    const config = mergeBodyCells({ config: [], resolved: [] }, { row: 1, column: 1 }, { row: 2, column: 2 }, 3, 4, { kind: "position" })!;
    expect(config).toEqual([{ row: 1, column: 1, rowSpan: 2, colSpan: 2 }]);
    const resolved = [{ row: 1, column: 1, rowSpan: 2, colSpan: 2, source: 0 }];
    expect(splitBodyCell({ config, resolved }, { row: 2, column: 2 })).toEqual([]);
  });

  it("anchors a merge to a record so it follows that record, replacing explicit merges inside the selection", () => {
    const existing = { config: [{ match: { field: "row.code", value: "B2" }, column: 1 }], resolved: [{ row: 1, column: 1, rowSpan: 1, colSpan: 1, source: 0 }] };
    const config = mergeBodyCells(existing, { row: 1, column: 0 }, { row: 2, column: 1 }, 3, 4, { kind: "record", field: "row.code", value: "B2" });
    expect(config).toEqual([{ match: { field: "row.code", value: "B2" }, column: 0, rowSpan: 2, colSpan: 2 }]);
  });

  it("rejects selections that cut through an existing explicit merge or leave the sample rows", () => {
    const existing = { config: [{ row: 1, column: 0, colSpan: 2, rowSpan: 2 }], resolved: [{ row: 1, column: 0, colSpan: 2, rowSpan: 2, source: 0 }] };
    expect(mergeBodyCells(existing, { row: 2, column: 1 }, { row: 2, column: 2 }, 3, 4, { kind: "position" })).toBeNull();
    expect(mergeBodyCells({ config: [], resolved: [] }, { row: 2, column: 0 }, { row: 3, column: 1 }, 3, 4, { kind: "position" })).toBeNull();
    expect(mergeBodyCells({ config: [], resolved: [] }, { row: 0, column: 0 }, { row: 0, column: 0 }, 3, 4, { kind: "position" })).toBeNull();
  });

  it("cannot split an automatic repeated-value merge", () => {
    const state = { config: [], resolved: [{ row: 0, column: 1, rowSpan: 2, splittable: true }] };
    expect(splitBodyCell(state, { row: 1, column: 1 })).toBeNull();
  });

  it("offers each primitive column value as a record anchor and says whether it is unique", () => {
    expect(anchorOptions(columns, rows, 1)).toEqual([
      { field: "row.code", value: "B2", unique: true, columnId: "code" },
      { field: "row.name", value: "Alpha", unique: false, columnId: "name" },
      { field: "row.qty * 2", value: 4, unique: true, columnId: "qty" },
      { field: "row.when", value: null, unique: false, columnId: "when" },
    ]);
    expect(anchorOptions(columns, rows, 0).map((option) => option.columnId)).toEqual(["code", "name", "qty"]);
  });

  it("describes where a merge is anchored", () => {
    expect(describeAnchor({ row: 4, column: 0 }, ["Code"], columns)).toBe("Fixed at row 5");
    expect(describeAnchor({ match: { field: "row.code", value: "B2" }, column: 0 }, ["Code", "Name"], columns)).toBe("Follows the record where Code = \"B2\"");
    expect(describeAnchor({ match: { field: "row.other", value: 7 }, column: 0 }, ["Code"], columns)).toBe("Follows the record where row.other = 7");
  });

  it("adjusts merges when a column is removed", () => {
    const spans = [{ row: 0, column: 0, colSpan: 2 }, { match: { field: "row.code", value: "A1" }, column: 3, rowSpan: 2 }];
    expect(removeBodyColumn(spans, 1)).toEqual([{ row: 0, column: 0, colSpan: 1 }, { match: { field: "row.code", value: "A1" }, column: 2, rowSpan: 2 }]);
  });
});
