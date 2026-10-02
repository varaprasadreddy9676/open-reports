import { describe, expect, it } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { listFor } from "../../src/lib/generate";

const rows = [{ testName: "Glucose", result: 92, flag: "H" }, { testName: "Sodium", result: 139, flag: "N" }];

describe("array display generation", () => {
  it("creates bound columns by default and one editable column when automatic fields are off", () => {
    const table = listFor("clinical.investigations", "investigations", rows, "table", true);
    expect(table.columns.map((column: any) => column.binding)).toEqual(["row.testName", "row.result", "row.flag"]);
    const blank = listFor("clinical.investigations", "investigations", rows, "table", false);
    expect(blank.columns).toEqual([{ id: "field-1", header: "New column" }]);
  });

  it("creates editable list and card components bound to each row", () => {
    const list = listFor("clinical.investigations", "investigations", rows, "repeater", true);
    const cards = listFor("clinical.investigations", "investigations", rows, "cards", true);
    expect(list.type).toBe("repeater");
    expect(list.children[0].children[1].binding).toBe("row.testName");
    expect(cards.children[0].type).toBe("container");
    expect(cards.children[0].children[0].binding).toBe("row.testName");
    expect(cards.children[0].children[1].children[1].binding).toBe("row.result");
    expect(parseReportDefinition({ schemaVersion: "1.0", id: "cards", name: "Cards", datasets: [{ id: "clinical", source: "inline", query: { data: { investigations: rows } } }], sections: [{ type: "detail", children: [cards] }] }).valid).toBe(true);
  });

  it("uses a blank editable field when sample data has no schema", () => {
    const cards = listFor("clinical.investigations", "investigations", [], "cards", true);
    expect(cards.children[0].children).toEqual([{ type: "text", name: "Bind a field", value: "" }]);
  });
});
