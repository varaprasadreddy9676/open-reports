import { describe, expect, it } from "vitest";
import { fieldSample, filterFields, inferFields } from "../../src/lib/fields";

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
});
