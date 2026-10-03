import { describe, expect, it } from "vitest";
import { comparePageTextChecks, planPageTextChecks } from "../../src/lib/pdf-content-coverage";

describe("PDF content coverage", () => {
  it("checks placed text on its expected page and skips unsupported text", () => {
    const paginated = { pages: [
      { number: 1, background: [], header: [], footer: [], content: [{ component: { type: "container" }, box: {}, children: [
        { component: { type: "text", id: "title", text: "Patient Summary" }, box: {} },
        { component: { type: "text", id: "title", text: "Patient Summary" }, box: {} },
        { component: { type: "text", id: "local", text: "नमस्ते" }, box: {} },
        { component: { type: "text", id: "clip", text: "Clipped statement", style: { overflow: "clip" } }, box: {} },
      ] }] },
      { number: 2, background: [], header: [{ component: { type: "field", id: "name", text: "Asha Rao" }, box: {} }], content: [], footer: [] },
    ] } as any;
    const checks = planPageTextChecks(paginated);
    expect(checks).toEqual([
      { page: 1, componentId: "title", text: "Patient Summary" },
      { page: 2, componentId: "name", text: "Asha Rao" },
    ]);
    expect(comparePageTextChecks(["Patient\nSummary", "Other patient"], checks)).toEqual({ found: 1, total: 2, missing: [{ page: 2, componentId: "name", text: "Asha Rao" }] });
  });
});
