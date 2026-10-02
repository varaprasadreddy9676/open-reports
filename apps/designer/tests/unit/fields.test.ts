import { describe, expect, it } from "vitest";
import { arrayRefs, datasetFields, datasetIsArray, fieldSample, filterFields, inferFields } from "../../src/lib/fields";

describe("data field discovery", () => {
  const fields = inferFields({ patient: { name: "Asha Rao", uhid: "UH123" }, investigations: [{ testName: "Glucose", value: 92 }] });

  it("keeps the path to a nested search result", () => {
    expect(filterFields(fields, "uhid")).toMatchObject([
      { path: "patient", children: [{ path: "patient.uhid", kind: "string", sample: "UH123" }] },
    ]);
    expect(filterFields(fields, "patient")[0]?.children).toHaveLength(2);
    expect(filterFields(fields, "missing")).toEqual([]);
  });

  it("keeps readable sample values for scalars and arrays", () => {
    expect(fieldSample(fields[0]?.children?.[0]?.sample)).toBe("Asha Rao");
    expect(fieldSample(fields[1]?.sample)).toBe("1 row");
    expect(fieldSample(null)).toBe("null");
    expect(fieldSample({ secret: "value" })).toBe("");
  });

  it("uses declared fields for empty lists and nested objects", () => {
    const doc = { datasets: [{ id: "items", source: "inline", query: { data: [] }, schema: { kind: "array", fields: [{ path: "name", kind: "string" }, { path: "quantity", kind: "number" }, { path: "details.code", kind: "string" }] } }] };
    expect(datasetIsArray(doc, {}, "items")).toBe(true);
    expect(arrayRefs(doc, {})).toEqual(["items"]);
    expect(datasetFields(doc, {}, "items")).toMatchObject([
      { path: "name", kind: "string" },
      { path: "quantity", kind: "number" },
      { path: "details", kind: "object", children: [{ path: "details.code", kind: "string" }] },
    ]);
  });

  it("discovers an author-declared nested list without any sample data", () => {
    const doc = { datasets: [{ id: "invoice", source: "rest", query: { url: "https://example.com/invoice" }, schema: { kind: "object", fields: [{ path: "patient.name", kind: "string" }, { path: "items", kind: "array" }, { path: "items.amount", kind: "number" }] } }] };
    expect(arrayRefs(doc, {})).toEqual(["invoice.items"]);
    expect(datasetFields(doc, {}, "invoice.items")).toMatchObject([{ path: "amount", kind: "number" }]);
  });
});
