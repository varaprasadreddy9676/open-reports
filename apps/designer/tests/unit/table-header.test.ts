import { describe, expect, it } from "vitest";
import { addHeaderLevel, appendHeaderColumn, defaultHeaderGrid, headerCellAt, mergeHeaderCells, removeHeaderColumn, splitHeaderCell } from "../../src/lib/table-header";

describe("table header editing", () => {
  it("adds a spanning level above the existing headers", () => {
    const rows = addHeaderLevel(defaultHeaderGrid([{ header: "Item" }, { header: "Qty" }]), 2);
    expect(rows).toEqual([[{ column: 0, text: "Group", colSpan: 2 }], [{ column: 0, text: "Item", align: undefined }, { column: 1, text: "Qty", align: undefined }]]);
  });

  it("merges a rectangle and splits it back into individual cells", () => {
    const rows = [
      [{ column: 0, text: "Product" }, { column: 1, text: "Sale" }],
      [{ column: 0, text: "Item" }, { column: 1, text: "Amount" }],
    ];
    const merged = mergeHeaderCells(rows, { row: 0, column: 0 }, { row: 1, column: 1 })!;
    expect(merged[0]).toEqual([{ column: 0, text: "Product", colSpan: 2, rowSpan: 2, align: undefined }]);
    expect(merged[1]).toEqual([]);
    expect(headerCellAt(merged, { row: 1, column: 1 })?.text).toBe("Product");
    const split = splitHeaderCell(merged, { row: 1, column: 1 });
    expect(split[0]).toHaveLength(2);
    expect(split[1]).toHaveLength(2);
    expect(split[0]![0]!.text).toBe("Product");
    expect(split[1]![1]!.text).toBe("");
  });

  it("does not partially absorb an existing merged cell", () => {
    const rows = [
      [{ column: 0, text: "A", colSpan: 2 }, { column: 2, text: "C" }],
      [{ column: 0, text: "D" }, { column: 1, text: "E" }, { column: 2, text: "F" }],
    ];
    expect(mergeHeaderCells(rows, { row: 0, column: 1 }, { row: 1, column: 2 })).toBeNull();
  });

  it("keeps a complete grid when a table column is added or removed", () => {
    const rows = [
      [{ column: 0, text: "Group", colSpan: 2 }],
      [{ column: 0, text: "A" }, { column: 1, text: "B" }],
    ];
    const added = appendHeaderColumn(rows, 2, "C");
    expect(added[0]![1]).toEqual({ column: 2, text: "C", rowSpan: 2 });
    expect(added[1]).toHaveLength(2);
    const removed = removeHeaderColumn(added, 0);
    expect(removed[0]).toEqual([{ column: 0, text: "Group", colSpan: 1 }, { column: 1, text: "C", rowSpan: 2 }]);
    expect(removed[1]).toEqual([{ column: 0, text: "B" }]);
  });
});
