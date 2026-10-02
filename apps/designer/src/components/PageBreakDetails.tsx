import type { PaginatedReport } from "@reporting/layout";
import * as ops from "../model/ops";
import { useStore } from "../store";

const mm = (pt: number) => `${(pt * 25.4 / 72).toFixed(1)} mm`;

/** Explain a real paginator boundary using its recorded decisions and measured space. */
export function PageBreakDetails({ paginated, pageNumber }: { paginated: PaginatedReport; pageNumber: number }) {
  // Expanding a tall flow container is preparatory work, not the boundary that
  // moved a row. Show the recorded page move before its repeated-header effect.
  const decisions = paginated.decisions
    .filter((decision) => decision.page === pageNumber && !(decision.kind === "cannot-split" && decision.message.includes("so its contents continue")))
    .sort((a, b) => Number(a.kind === "group-header-repeated") - Number(b.kind === "group-header-repeated"));
  const tableDecision = decisions.find((decision) => decision.kind === "table-split" && decision.componentId);
  const table = tableDecision?.componentId ? ops.find(useStore.getState().doc, tableDecision.componentId)?.comp : undefined;
  return <div className="page-break-details" data-testid="page-break-details">
    <strong>Why page {pageNumber} starts here</strong>
    {decisions.length ? decisions.map((decision, index) => <div className="page-break-reason" key={`${decision.kind}-${index}`}>
      <b>{decision.kind.replace(/-/g, " ")}{decision.rowIndex !== undefined ? ` · row ${decision.rowIndex + 1}` : ""}</b>
      <p>{decision.message}</p>
      {decision.required !== undefined && decision.available !== undefined && <dl className="page-break-measure"><div><dt>Required</dt><dd>{mm(decision.required)}</dd></div><div><dt>Available</dt><dd>{mm(Math.max(0, decision.available))}</dd></div></dl>}
      {decision.componentId && decision.actions?.map((action) => <button className="btn small" key={action.label} onClick={() => useStore.getState().patch(decision.componentId!, action.patch, `page-break:${action.label}`)}>{action.label}</button>)}
    </div>) : <p>The paginator started this page after the previous page filled. It did not record a more specific break rule.</p>}
    {table?.type === "table" && <button className="btn small" data-testid="page-break-fix" onClick={() => {
      const live = ops.find(useStore.getState().doc, table.id)?.comp;
      if (live) useStore.getState().patchStyle(live.id, { fontSize: Math.max(6, Number(live.style?.fontSize ?? 10) - 1) }, `page-break-font:${live.id}`);
    }}>Use smaller table text</button>}
  </div>;
}
