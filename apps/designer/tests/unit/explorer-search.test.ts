import { describe, expect, it } from "vitest";
import { explorerTree } from "../../src/lib/explorer-tree";
import { searchExplorer } from "../../src/lib/explorer-search";

describe("report explorer search", () => {
  const doc = {
    groups: [{ id: "department", name: "Department", by: "row.department" }],
    sections: [
      { type: "groupHeader", groupId: "department", children: [{ id: "heading", type: "text", value: "Department name" }] },
      { type: "detail", children: [
        { id: "layout", type: "container", children: [
          { id: "patient", type: "text", binding: "data.patient.name" },
          { id: "result", type: "text", binding: "row.result" },
        ] },
        { id: "table", type: "table", dataset: "investigations" },
      ] },
      { type: "groupFooter", groupId: "department", children: [{ id: "total", type: "text", value: "Department total" }] },
    ],
  };
  const tree = explorerTree(doc.sections, doc.groups);

  it("keeps only a deep match and its group, band and component ancestors", () => {
    const result = searchExplorer(doc, tree, "PATIENT.NAME");
    expect(result.count).toBe(1);
    expect([...result.groups]).toEqual(["department"]);
    expect([...result.bands]).toEqual([1]);
    expect([...result.components]).toEqual(["patient", "layout"]);
    expect([...result.matchedComponents]).toEqual(["patient"]);
  });

  it("visits every sibling and can find group, band and dataset names", () => {
    expect(searchExplorer(doc, tree, "row.result").matchedComponents.has("result")).toBe(true);
    expect(searchExplorer(doc, tree, "investigations").matchedComponents.has("table")).toBe(true);
    const groups = searchExplorer(doc, tree, "department");
    expect(groups.matchedGroups.has("department")).toBe(true);
    expect(groups.matchedBands.has(0)).toBe(true);
    expect(groups.matchedBands.has(2)).toBe(true);
  });
});
