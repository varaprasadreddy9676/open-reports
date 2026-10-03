import { describe, expect, it } from "vitest";
import type { DatasetShape } from "@reporting/schema";
import { checkSchemaPreview, schemaIssueMessage } from "../../src/lib/schema-preview";
import { runEngine } from "../../src/engine";

const shape: DatasetShape = { kind: "array", fields: [
  { path: "name", kind: "string" },
  { path: "quantity", kind: "number" },
  { path: "date", kind: "date" },
] };

describe("declared field checks against a preview", () => {
  it("distinguishes unavailable data and a real zero-row result", () => {
    expect(checkSchemaPreview(shape, undefined)).toMatchObject({ state: "unavailable", checkedRows: 0, issues: [] });
    expect(checkSchemaPreview(shape, [])).toMatchObject({ state: "no-rows", totalRows: 0, checkedRows: 0, issues: [] });
  });

  it("groups missing and mistyped fields by path without treating null as a type", () => {
    const check = checkSchemaPreview(shape, [
      { name: "Flour", quantity: 2, date: "2026-10-02" },
      { name: "Rice", quantity: "3", date: "2026-10-03" },
      { name: "Salt", date: "2026-10-04" },
      { name: null, quantity: 4, date: null },
    ]);
    expect(check).toMatchObject({ state: "checked", checkedRows: 4, totalRows: 4, uncheckedValues: 2 });
    expect(check.issues).toMatchObject([
      { code: "FIELD_KIND", path: "quantity", expected: "number", actual: "string", examples: ["row 2"] },
      { code: "MISSING_FIELD", path: "quantity", actual: "missing", examples: ["row 3"] },
    ]);
    expect(schemaIssueMessage(check.issues[0]!)).toContain("row 2");
  });

  it("reports root and record shape mismatches", () => {
    expect(checkSchemaPreview(shape, { name: "one" }).issues[0]).toMatchObject({ code: "ROOT_KIND", expected: "list of records", actual: "object" });
    expect(checkSchemaPreview(shape, ["invalid"]).issues[0]).toMatchObject({ code: "ROW_KIND", actual: "string", examples: ["row 1"] });
  });

  it("checks nested records while bounding rows and nested items", () => {
    const nested: DatasetShape = { kind: "object", fields: [{ path: "items", kind: "array" }, { path: "items.amount", kind: "number" }] };
    const check = checkSchemaPreview(nested, { items: [{ amount: 12 }, { amount: "13" }] });
    expect(check.issues).toMatchObject([{ code: "FIELD_KIND", path: "items.amount", examples: ["object[2]"] }]);
    const many = checkSchemaPreview(shape, Array.from({ length: 25 }, (_, i) => ({ name: "N", quantity: i === 24 ? "bad" : i, date: "2026-10-02" })));
    expect(many).toMatchObject({ totalRows: 25, checkedRows: 20, issues: [] });
    expect(checkSchemaPreview({ kind: "object", fields: [{ path: "patient.name", kind: "string" }] }, { patient: null })).toMatchObject({ uncheckedValues: 1, issues: [] });
  });

  it("surfaces a saved dataset mismatch as a navigable designer warning", async () => {
    const doc = {
      schemaVersion: "1.0", id: "sample", name: "Sample",
      datasets: [{ id: "items", source: "inline", query: { data: [{ name: "Rice", quantity: "3" }] }, schema: shape }],
      sections: [{ type: "detail", children: [] }],
    };
    const result = await runEngine(doc, {}, {});
    expect(result.problems).toContainEqual(expect.objectContaining({ code: "DATASET_SCHEMA_MISMATCH", datasetId: "items", severity: "warning", message: expect.stringContaining("quantity") }));
  });

  it("treats accidental fixed-height text overflow as an error and deliberate clipping as a warning", async () => {
    const text = { type: "text", id: "short-note", value: Array.from({ length: 20 }, (_, index) => `Line ${index}`).join("\n"), height: 20, width: 120 };
    const doc = { schemaVersion: "1.0", id: "overflow", name: "Overflow", sections: [{ type: "detail", children: [text] }] };
    const blocked = await runEngine(doc, {}, {});
    expect(blocked.problems).toContainEqual(expect.objectContaining({ code: "TEXT_EXCEEDS_HEIGHT", componentId: "short-note", severity: "error" }));
    const clipped = await runEngine({ ...doc, sections: [{ type: "detail", children: [{ ...text, style: { overflow: "clip" } }] }] }, {}, {});
    expect(clipped.problems).toContainEqual(expect.objectContaining({ code: "TEXT_TRUNCATED_BY_POLICY", componentId: "short-note", severity: "warning" }));
    expect(clipped.problems.some((problem) => problem.code === "TEXT_EXCEEDS_HEIGHT")).toBe(false);
  });
});
