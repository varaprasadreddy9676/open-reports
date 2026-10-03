import type { PaginatedReport } from "@reporting/layout";
import * as ops from "../model/ops";
import { applyPaginationAction, canApplyPaginationAction } from "../lib/pagination-actions";
import { useStore } from "../store";

const mm = (pt: number) => `${(pt * 25.4 / 72).toFixed(1)} mm`;

/** Explain a real paginator boundary using its recorded decisions and measured space. */
export function PageBreakDetails({ paginated, pageNumber }: { paginated: PaginatedReport; pageNumber: number }) {
  const doc = useStore((s) => s.doc);
  const decisions = paginated.decisions
    .filter((decision) => decision.page === pageNumber)
    .sort((a, b) => Number(a.kind === "group-header-repeated") - Number(b.kind === "group-header-repeated"));
  const previous = paginated.pages[pageNumber - 2];
  const current = paginated.pages[pageNumber - 1];
  const used = previous ? Math.max(0, ...previous.content.map((node) => node.box.y + node.box.height - previous.zones.body.y)) : 0;
  const remaining = previous ? Math.max(0, previous.zones.body.height - used) : 0;
  const first = current?.content.find((node) => !(node.component as any).band?.repeated) ?? current?.content[0];
  const firstSource = first?.component as any;
  const firstBand = firstSource?.band?.sectionIndex === undefined ? undefined : doc.sections?.[firstSource.band.sectionIndex];
  const firstName = firstSource?.band?.name ?? (firstBand ? ops.bandDisplayName(doc, firstBand) : firstSource?.id ? ops.find(doc, firstSource.id)?.comp?.name ?? firstSource.id : firstSource?.type);
  const tableDecision = decisions.find((decision) => decision.kind === "table-split" && decision.componentId);
  const table = tableDecision?.componentId ? ops.find(doc, tableDecision.componentId)?.comp : undefined;
  return <div className="page-break-details" data-testid="page-break-details">
    <strong>Why page {pageNumber} starts here</strong>
    {previous && <div className="page-break-context" data-testid="page-break-space">
      <span>Previous page body</span><b>{mm(Math.min(used, previous.zones.body.height))} used · {mm(remaining)} left</b>
      {firstName && <small>Page {pageNumber} continues with {firstName}{first?.rowRange ? `, row ${first.rowRange.start + 1}` : ""}.</small>}
    </div>}
    {decisions.length ? decisions.map((decision, index) => <div className="page-break-reason" key={`${decision.kind}-${index}`}>
      <b>{decision.kind.replace(/-/g, " ")}{decision.rowIndex !== undefined ? ` · row ${decision.rowIndex + 1}` : ""}</b>
      <p>{decision.message}</p>
      {decision.required !== undefined && decision.available !== undefined && <dl className="page-break-measure"><div><dt>Required</dt><dd>{mm(decision.required)}</dd></div><div><dt>Available</dt><dd>{mm(Math.max(0, decision.available))}</dd></div></dl>}
      {decision.actions?.filter((action) => canApplyPaginationAction(doc, decision, action)).map((action) => <button className="btn small" data-testid="page-break-action" key={action.label} onClick={() => {
        const st = useStore.getState();
        const next = applyPaginationAction(st.doc, decision, action);
        if (next) st.setDoc(next, { coalesce: `page-break:${action.label}` });
      }}>{action.label}</button>)}
    </div>) : <p>The paginator started this page after the previous page filled. It did not record a more specific break rule.</p>}
    {table?.type === "table" && Number(table.style?.fontSize ?? 10) > 6 && <button className="btn small" data-testid="page-break-fix" onClick={() => {
      const live = ops.find(useStore.getState().doc, table.id)?.comp;
      if (live) useStore.getState().patchStyle(live.id, { fontSize: Math.max(6, Number(live.style?.fontSize ?? 10) - 1) }, `page-break-font:${live.id}`);
    }}>Use smaller table text</button>}
  </div>;
}
