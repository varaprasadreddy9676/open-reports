import { describe, it, expect } from "vitest";
import { CANVAS_SCENARIOS, scenarioList, scenarioSample } from "../../src/lib/canvas-scenario";
import { datasetValue } from "../../src/lib/fields";

const doc = {
  schemaVersion: "1.0", id: "r", name: "r", page: { size: "A4" }, sections: [],
  datasets: [{ id: "items", source: "inline", query: { data: [{ name: "Eye exam", amount: 500 }, { name: "Lenses", amount: 3200 }] } }],
} as any;
const scenario = (id: string) => CANVAS_SCENARIOS.find((s) => s.id === id)!;
const rows = (sample: Record<string, unknown>) => datasetValue(doc, sample, scenarioList(doc, {})!) as unknown[];

describe("canvas data scenarios", () => {
  it("leaves the sample alone when no scenario is chosen", () => {
    const sample = {};
    expect(scenarioSample(doc, sample, null)).toBe(sample);
  });

  it("resizes the main list for row-count scenarios", () => {
    expect(rows(scenarioSample(doc, {}, scenario("empty")))).toHaveLength(0);
    expect(rows(scenarioSample(doc, {}, scenario("one")))).toHaveLength(1);
    expect(rows(scenarioSample(doc, {}, scenario("many")))).toHaveLength(500);
  });

  it("stretches text for the long-text scenario", () => {
    const longest = Math.max(...rows(scenarioSample(doc, {}, scenario("long-text"))).map((row: any) => String(row.name).length));
    expect(longest).toBeGreaterThan(100);
  });
});
