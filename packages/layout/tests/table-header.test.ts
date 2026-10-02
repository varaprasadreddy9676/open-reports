import { describe, expect, it } from "vitest";
import type { ResolvedTableComponent } from "@reporting/core";
import { defaultTextMeasurer, measureHeaderHeight, measureHeaderRowHeights, resolveColumnWidths } from "../src/index.js";

describe("multi-level table header layout", () => {
  it("measures each row and gives a wrapped spanning cell enough height", () => {
    const table = {
      type: "table", columns: [{ id: "a", header: "A" }, { id: "b", header: "B" }], rows: [],
      headerRows: [
        [{ column: 0, text: "A long category heading that wraps across two columns", colSpan: 2 }],
        [{ column: 0, text: "A" }, { column: 1, text: "B" }],
      ],
    } as ResolvedTableComponent;
    const widths = resolveColumnWidths(table, 90);
    const heights = measureHeaderRowHeights(table, widths, defaultTextMeasurer);
    expect(heights).toHaveLength(2);
    expect(heights[0]).toBeGreaterThan(heights[1]!);
    expect(measureHeaderHeight(table, defaultTextMeasurer, widths)).toBeCloseTo(heights[0]! + heights[1]!);
  });
});
