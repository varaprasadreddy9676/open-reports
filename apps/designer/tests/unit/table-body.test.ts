import { describe, expect, it } from "vitest";
import { mergeBodyCells, removeBodyColumn, splitBodyCell } from "../../src/lib/table-body";

describe("table body merge editing", () => {
  it("merges horizontal and vertical rectangles and splits either covered position", () => {
    const spans = mergeBodyCells([], { row: 2, column: 1 }, { row: 3, column: 2 }, 5, 4)!;
    expect(spans).toEqual([{ row: 2, column: 1, rowSpan: 2, colSpan: 2 }]);
    expect(splitBodyCell(spans, { row: 3, column: 2 })).toEqual([]);
  });

  it("rejects partial overlaps and positions outside the resolved data", () => {
    const existing = [{ row: 1, column: 0, colSpan: 2, rowSpan: 2 }];
    expect(mergeBodyCells(existing, { row: 2, column: 1 }, { row: 3, column: 2 }, 5, 4)).toBeNull();
    expect(mergeBodyCells([], { row: 4, column: 0 }, { row: 5, column: 1 }, 5, 4)).toBeNull();
  });

  it("adjusts positional merges when a column is removed", () => {
    const spans = [{ row: 0, column: 0, colSpan: 2 }, { row: 2, column: 3, rowSpan: 2 }];
    expect(removeBodyColumn(spans, 1)).toEqual([{ row: 0, column: 0, colSpan: 1 }, { row: 2, column: 2, rowSpan: 2 }]);
  });
});
