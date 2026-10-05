import type { Doc } from "../model/ops";
import { arrayRefs } from "./fields";
import { makeScenarioSample, type StressOptions } from "./test-scenarios";

export interface CanvasScenario {
  id: string;
  label: string;
  count: number;
  stress?: StressOptions;
}

/** Quick "what if" data for the canvas: each one exercises a pagination edge case. */
export const CANVAS_SCENARIOS: CanvasScenario[] = [
  { id: "empty", label: "No rows", count: 0 },
  { id: "one", label: "One row", count: 1 },
  { id: "many", label: "500 rows", count: 500 },
  { id: "long-text", label: "Long text", count: 12, stress: { longText: true } },
  { id: "groups", label: "Many groups", count: 60, stress: { manyGroups: true } },
  { id: "nulls", label: "Missing values", count: 12, stress: { nulls: true } },
  { id: "multilingual", label: "Multilingual", count: 12, stress: { multilingual: true } },
];

/** The report's main list: the first array in its datasets. Scenarios resize this one. */
export function scenarioList(doc: Doc, sample: Record<string, unknown>): string | undefined {
  return arrayRefs(doc, sample)[0];
}

export function scenarioSample(doc: Doc, sample: Record<string, unknown>, scenario: CanvasScenario | null): Record<string, unknown> {
  const ref = scenario ? scenarioList(doc, sample) : undefined;
  return scenario && ref ? makeScenarioSample(doc, sample, ref, scenario.count, scenario.stress) : sample;
}
