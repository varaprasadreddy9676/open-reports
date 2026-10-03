import type { PaginationDecision } from "@reporting/layout";
import * as ops from "../model/ops";

type Action = NonNullable<PaginationDecision["actions"]>[number];

/** A suggestion is shown only while its source still has the rule it would change. */
export function canApplyPaginationAction(doc: ops.Doc, decision: PaginationDecision, action: Action): boolean {
  const source = action.target === "band"
    ? doc.sections?.[decision.sectionIndex ?? -1]
    : decision.componentId ? ops.find(doc, decision.componentId)?.comp : undefined;
  if (!source) return false;
  if (action.target === "band" && decision.sectionId && source.id !== decision.sectionId) return false;
  return Object.entries(action.patch).some(([key, value]) => {
    if (key === "repeatEveryPage" && action.target === "band" && value === false) {
      const group = (doc.groups ?? []).find((entry: { id: string }) => entry.id === source.groupId);
      return source.repeatEveryPage !== false && (source.repeatEveryPage === true || group?.repeatHeader === true);
    }
    // Derived group rules cannot be disabled by writing a flag on the band.
    if (value === false && source[key] !== true) return false;
    return source[key] !== value;
  });
}

export function applyPaginationAction(doc: ops.Doc, decision: PaginationDecision, action: Action): ops.Doc | undefined {
  if (!canApplyPaginationAction(doc, decision, action)) return undefined;
  return action.target === "band"
    ? ops.updateBand(doc, decision.sectionIndex!, action.patch)
    : ops.update(doc, decision.componentId!, action.patch);
}
