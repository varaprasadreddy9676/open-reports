import { describe, expect, it } from "vitest";
import { makeScenarioSample } from "../../src/lib/test-scenarios";

const doc = {
  datasets: [{ id: "clinical", source: "inline", query: { data: { patient: { name: "Asha" }, investigations: [{ department: "Lab", testName: "Glucose", result: 92 }] } } }],
} as any;

describe("disposable test scenarios", () => {
  it("generates boundary counts in a nested list without changing the report or sample", () => {
    const sample = { clinical: structuredClone(doc.datasets[0].query.data) };
    const original = structuredClone(sample);
    const empty = makeScenarioSample(doc, sample, "clinical.investigations", 0);
    const many = makeScenarioSample(doc, sample, "clinical.investigations", 32);
    expect((empty.clinical as any).investigations).toHaveLength(0);
    expect((many.clinical as any).investigations).toHaveLength(32);
    expect((many.clinical as any).patient.name).toBe("Asha");
    expect(sample).toEqual(original);
    expect(doc.datasets[0].query.data).toEqual(original.clinical);
  });

  it("applies deterministic stress values", () => {
    const stressed = makeScenarioSample(doc, {}, "clinical.investigations", 32, {
      longText: true, nulls: true, negativeNumbers: true, multilingual: true, manyGroups: true,
    });
    const rows = (stressed.clinical as any).investigations;
    expect(rows[0].department).toBe("Group 1");
    expect(rows[0].result).toBe(-92);
    expect(rows[0].testName).toContain("తెలుగు");
    expect(rows[0].testName).toContain("हिन्दी");
    expect(rows[1].testName).toBeNull();
    expect(rows[12].department).toBe("Group 1");
  });

  it("can seed records from a declared schema when preview rows are empty", () => {
    const schemaDoc = { datasets: [{ id: "items", source: "inline", query: { data: [] }, schema: { kind: "array", fields: [{ path: "name", kind: "string" }, { path: "amount", kind: "number" }] } }] } as any;
    const result = makeScenarioSample(schemaDoc, {}, "items", 1);
    expect(result.items).toEqual([{ name: "Sample", amount: 1 }]);
  });

  it("rejects fabricated rows when neither data nor fields provide a seed", () => {
    expect(() => makeScenarioSample({ datasets: [{ id: "items", source: "inline", query: { data: [] } }] } as any, {}, "items", 1)).toThrow(/Add one sample record/);
  });
});
