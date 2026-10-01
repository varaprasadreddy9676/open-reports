import { describe, expect, it } from "vitest";
import { structurePageStarts } from "../../src/lib/pagination-map";

const box = { x: 0, y: 0, width: 100, height: 20 };
const structure = {
  bands: [
    { sectionIndex: 0, name: "Group header", y: 10 },
    { sectionIndex: 1, name: "Detail", y: 40 },
  ],
} as any;
const doc = { sections: [
  { type: "groupHeader", children: [] },
  { type: "detail", children: [{ type: "table", id: "items" }] },
] };

describe("structure page start mapping", () => {
  it("maps each page to new content after a repeated group header", () => {
    const paginated = {
      pages: [
        { content: [{ component: { type: "container", band: { sectionIndex: 0 } }, box }] },
        { content: [
          { component: { type: "container", band: { sectionIndex: 0, repeated: true } }, box },
          { component: { type: "container", band: { sectionIndex: 1, rowIndex: 7 } }, box },
        ] },
      ],
      decisions: [{ kind: "group-header-repeated", page: 2, message: "Header repeats" }, { kind: "cannot-split", page: 2, message: "Row moves" }],
    } as any;
    expect(structurePageStarts(doc, paginated, structure)).toEqual([{
      page: 2, sectionIndex: 1, y: 40, rowIndex: 7, bandName: "Detail", decisions: paginated.decisions,
    }]);
  });

  it("uses a component's source section and row range when a band was dissolved", () => {
    const paginated = { pages: [
      { content: [] },
      { content: [{ component: { type: "table", id: "items" }, box, rowRange: { start: 37, end: 50 } }] },
    ], decisions: [{ kind: "table-split", page: 2, rowIndex: 37, message: "Table continues" }] } as any;
    expect(structurePageStarts(doc, paginated, structure)[0]).toMatchObject({ page: 2, sectionIndex: 1, rowIndex: 37, bandName: "Detail" });
  });

  it("does not invent a band position for an unmapped component", () => {
    const paginated = { pages: [{ content: [] }, { content: [{ component: { type: "table", id: "unknown" }, box }] }], decisions: [] } as any;
    expect(structurePageStarts(doc, paginated, structure)).toEqual([]);
  });
});
