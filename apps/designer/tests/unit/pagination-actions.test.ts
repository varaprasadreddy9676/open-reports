import { describe, expect, it } from "vitest";
import type { PaginationDecision } from "@reporting/layout";
import { applyPaginationAction, canApplyPaginationAction } from "../../src/lib/pagination-actions";

const doc = () => ({
  groups: [{ id: "department", repeatHeader: true }],
  sections: [
    { id: "group-header", type: "groupHeader", groupId: "department", children: [{ id: "header-text", type: "text", value: "Lab" }] },
    { id: "detail", type: "detail", newPageBefore: true, children: [{ id: "detail-text", type: "text", value: "Results", pageBreakAfter: true }] },
  ],
});

describe("pagination suggestions", () => {
  it("overrides an inherited repeat setting on the source band", () => {
    const decision: PaginationDecision = { kind: "group-header-repeated", page: 2, componentId: "group-header", sectionIndex: 0, sectionId: "group-header", message: "Repeated" };
    const action = { label: "Stop repeating this header", target: "band" as const, patch: { repeatEveryPage: false } };
    const before = doc();
    const after = applyPaginationAction(before, decision, action)!;
    expect(after.sections[0].repeatEveryPage).toBe(false);
    expect(before.sections[0]).not.toHaveProperty("repeatEveryPage");
    expect(canApplyPaginationAction(after, decision, action)).toBe(false);
  });

  it("uses the band's page-break field and rejects stale or derived advice", () => {
    const decision: PaginationDecision = { kind: "forced-break", page: 2, sectionIndex: 1, sectionId: "detail", message: "New page" };
    const action = { label: "Remove page break", target: "band" as const, patch: { newPageBefore: false } };
    const after = applyPaginationAction(doc(), decision, action)!;
    expect(after.sections[1].newPageBefore).toBeUndefined();
    expect(canApplyPaginationAction(doc(), { ...decision, sectionId: "another-band" }, action)).toBe(false);
    expect(canApplyPaginationAction(doc(), decision, { label: "Release keep-with-next", target: "band", patch: { keepWithNext: false } })).toBe(false);
  });

  it("continues to patch an actual component rule", () => {
    const decision: PaginationDecision = { kind: "forced-break", page: 2, componentId: "detail-text", message: "New page" };
    const action = { label: "Remove page break", target: "component" as const, patch: { pageBreakAfter: false } };
    expect(applyPaginationAction(doc(), decision, action)!.sections[1].children[0].pageBreakAfter).toBe(false);
  });

  it("can release the table totals rule when its true default is implicit", () => {
    const report = doc();
    report.sections[1]!.children.push({ id: "totals", type: "table", dataset: "items", columns: [] } as any);
    const decision: PaginationDecision = { kind: "keep-together", page: 2, componentId: "totals", message: "Totals moved" };
    const action = { label: "Allow totals on their own page", target: "component" as const, patch: { keepFooterTogether: false } };
    expect(canApplyPaginationAction(report, decision, action)).toBe(true);
    const after = applyPaginationAction(report, decision, action)!;
    expect((after.sections[1].children[1] as any).keepFooterTogether).toBe(false);
    expect(canApplyPaginationAction(after, decision, action)).toBe(false);
  });
});
