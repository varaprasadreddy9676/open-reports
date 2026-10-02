import { describe, expect, it } from "vitest";
import { explorerTree } from "../../src/lib/explorer-tree";

describe("report explorer hierarchy", () => {
  it("nests group bands, detail, and components in section order", () => {
    const sections = [
      { type: "reportHeader" },
      { type: "groupHeader", groupId: "department" },
      { type: "groupHeader", groupId: "doctor" },
      { type: "detail" },
      { type: "child" },
      { type: "groupFooter", groupId: "doctor" },
      { type: "groupFooter", groupId: "department" },
      { type: "reportFooter" },
    ];
    expect(explorerTree(sections, [{ id: "department" }, { id: "doctor" }])).toEqual([
      { kind: "band", index: 0 },
      { kind: "group", id: "department", children: [
        { kind: "band", index: 1 },
        { kind: "group", id: "doctor", children: [
          { kind: "band", index: 2 }, { kind: "band", index: 3 }, { kind: "band", index: 4 }, { kind: "band", index: 5 },
        ] },
        { kind: "band", index: 6 },
      ] },
      { kind: "band", index: 7 },
    ]);
  });

  it("keeps detail under a group with no footer until the data region ends", () => {
    const sections = [
      { type: "dataHeader" }, { type: "groupHeader", groupId: "category" }, { type: "detail" }, { type: "dataFooter" },
    ];
    expect(explorerTree(sections, [{ id: "category" }])).toEqual([
      { kind: "band", index: 0 },
      { kind: "group", id: "category", children: [{ kind: "band", index: 1 }, { kind: "band", index: 2 }] },
      { kind: "band", index: 3 },
    ]);
  });

  it("leaves unrelated and unused groups visible without stealing bands", () => {
    const sections = [
      { type: "groupHeader", groupId: "first" }, { type: "detail" }, { type: "groupFooter", groupId: "first" },
      { type: "dataFooter" },
      { type: "groupHeader", groupId: "second" }, { type: "detail" }, { type: "groupFooter", groupId: "second" },
    ];
    const tree = explorerTree(sections, [{ id: "first" }, { id: "second" }, { id: "unused" }]);
    expect(tree).toEqual([
      { kind: "group", id: "first", children: [{ kind: "band", index: 0 }, { kind: "band", index: 1 }, { kind: "band", index: 2 }] },
      { kind: "band", index: 3 },
      { kind: "group", id: "second", children: [{ kind: "band", index: 4 }, { kind: "band", index: 5 }, { kind: "band", index: 6 }] },
      { kind: "group", id: "unused", children: [] },
    ]);
  });

  it("places detail before a footer-only group band without absorbing the report header", () => {
    const sections = [{ type: "reportHeader" }, { type: "detail" }, { type: "groupFooter", groupId: "g" }, { type: "reportFooter" }];
    expect(explorerTree(sections, [{ id: "g" }])).toEqual([
      { kind: "band", index: 0 },
      { kind: "group", id: "g", children: [{ kind: "band", index: 1 }, { kind: "band", index: 2 }] },
      { kind: "band", index: 3 },
    ]);
  });
});
