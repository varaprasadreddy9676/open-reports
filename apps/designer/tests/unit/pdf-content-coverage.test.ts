import { describe, expect, it } from "vitest";
import { comparePageImageChecks, comparePageTextChecks, planPageImageChecks, planPageTextChecks } from "../../src/lib/pdf-content-coverage";

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

  it("compares placed image counts with raster draws on each PDF page", () => {
    const paginated = { pages: [
      { number: 1, background: [], header: [{ component: { type: "image", id: "logo-left", src: "data:image/png;base64,abc" }, box: {} }, { component: { type: "image", id: "logo-right", src: "/logos/right.png" }, box: {} }], content: [], footer: [] },
      { number: 2, background: [], header: [{ component: { type: "image", id: "logo-left", src: "data:image/png;base64,abc" }, box: {} }, { component: { type: "image", id: "empty", src: "" }, box: {} }], content: [], footer: [] },
    ] } as any;
    const checks = planPageImageChecks(paginated);
    expect(checks).toEqual([
      { page: 1, componentIds: ["logo-left", "logo-right"], expected: 2 },
      { page: 2, componentIds: ["logo-left"], expected: 1 },
    ]);
    expect(comparePageImageChecks([2, 0], checks)).toEqual({ found: 2, total: 3, missing: [checks[1]] });
  });
});
