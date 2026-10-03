import { describe, expect, it } from "vitest";
import { compareRowMarkers, markTableRows } from "../../src/lib/pdf-row-coverage";
import { makeScenarioSample } from "../../src/lib/test-scenarios";

const doc = {
  datasets: [{ id: "clinical", source: "inline", query: { data: { investigations: [{ testName: "Glucose", result: 92 }] } } }],
  sections: [{ type: "detail", children: [{ id: "investigation-table", type: "table", dataset: "clinical.investigations", columns: [{ binding: "row.testName" }, { binding: "row.result" }] }] }],
};

describe("PDF row coverage", () => {
  it("marks every string row in a disposable nested scenario and detects absent PDF text", () => {
    const scenario = makeScenarioSample(doc, {}, "clinical.investigations", 3);
    const plan = markTableRows(doc, scenario, "clinical.investigations");
    expect(plan).toEqual({ field: "testName", markers: ["ORROW00001", "ORROW00002", "ORROW00003"], componentId: "investigation-table", bandIndex: 0 });
    expect((scenario.clinical as any).investigations.map((row: any) => row.testName)).toEqual([
      "Glucose ORROW00001", "Glucose ORROW00002", "Glucose ORROW00003",
    ]);
    expect(doc.datasets[0]!.query.data.investigations[0]!.testName).toBe("Glucose");
    expect(compareRowMarkers(["Glucose ORROW00001", "Glucose ORROW00002"], plan!)).toEqual({ found: 2, total: 3, missing: ["ORROW00003"] });
  });

  it("counts only rows with text values and skips filtered or merged tables", () => {
    const scenario = makeScenarioSample(doc, {}, "clinical.investigations", 3, { nulls: true });
    const plan = markTableRows(doc, scenario, "clinical.investigations");
    expect(plan?.markers).toEqual(["ORROW00001", "ORROW00003"]);
    const filtered = structuredClone(doc) as any;
    filtered.sections[0].children[0].filterWhen = "row.result > 0";
    expect(markTableRows(filtered, makeScenarioSample(doc, {}, "clinical.investigations", 3), "clinical.investigations")).toBeUndefined();
    delete filtered.sections[0].children[0].filterWhen;
    filtered.sections[0].children[0].cellSpans = [{ row: 0, column: 0, rowSpan: 2 }];
    expect(markTableRows(filtered, makeScenarioSample(doc, {}, "clinical.investigations", 3), "clinical.investigations")).toBeUndefined();
  });
});
