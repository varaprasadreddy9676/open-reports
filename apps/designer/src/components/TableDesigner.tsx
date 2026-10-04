import { useMemo, useRef, useState } from "react";
import { findComponentsByType, tableHeaderRows } from "@reporting/core";
import { resolveColumnWidths } from "@reporting/layout";
import { useStore } from "../store";
import * as ops from "../model/ops";
import { arrayRefs } from "../lib/fields";
import { candidatesFor } from "../lib/bindings";
import { appendHeaderColumn } from "../lib/table-header";
import { FormulaInput } from "./FormulaInput";
import { TableHeaderEditor } from "./TableHeaderEditor";
import { TableBodyEditor } from "./TableBodyEditor";
import { TableStyleEditor } from "./TableStyleEditor";
import { ColumnEditor, StyleRulesEditor } from "./Properties";

type Tab = "columns" | "header" | "rows" | "style" | "groups" | "totals" | "pagination" | "conditions";
const TABS: { id: Tab; label: string }[] = [
  { id: "columns", label: "Columns" }, { id: "header", label: "Multi-level headers" },
  { id: "rows", label: "Rows & cells" }, { id: "style", label: "Style" }, { id: "groups", label: "Groups" },
  { id: "totals", label: "Totals" }, { id: "pagination", label: "Pagination" },
  { id: "conditions", label: "Conditions" },
];

export function TableDesigner({ id }: { id: string }) {
  const { doc, sample, engine } = useStore();
  const table = ops.find(doc, id)?.comp;
  const patch = useStore((s) => s.patch);
  const [tab, setTab] = useState<Tab>("columns");
  const [groupId, setGroupId] = useState<string | null>(null);
  const preview = useRef<HTMLDivElement>(null);
  const drag = useRef<{ index: number; x: number; width: number; scale: number } | null>(null);
  const resolved = engine.resolved ? findComponentsByType(engine.resolved, "table").find((item) => item.id === id) : undefined;
  const groupIds = (doc.groups ?? []).map((group: any) => group.id);
  const bandIndex = ops.bandIndexOf(doc, id);
  const bandGroupId = (() => {
    if (bandIndex === null) return undefined;
    const stack: string[] = [];
    for (const section of (doc.sections ?? []).slice(0, bandIndex + 1)) {
      if (section.type === "groupHeader" && section.groupId) stack.push(section.groupId);
      if (section.type === "groupFooter" && section.groupId) {
        const position = stack.lastIndexOf(section.groupId);
        if (position >= 0) stack.splice(position, 1);
      }
    }
    return doc.sections?.[bandIndex]?.groupId ?? stack.at(-1);
  })();
  const selectedGroupId = groupId ?? bandGroupId ?? groupIds[0];
  const group = (doc.groups ?? []).find((item: any) => item.id === selectedGroupId);
  const refs = useMemo(() => arrayRefs(doc, sample), [doc, sample]);
  const page = engine.paginated;
  const availableWidth = page ? page.pageSize.width - page.margin.left - page.margin.right : 500;
  const widths = resolved?.columns?.length ? resolveColumnWidths(resolved, availableWidth) : [];
  const totalWidth = widths.reduce((sum, item) => sum + item.width, 0) || availableWidth;
  const columnTemplate = widths.length ? widths.map((item) => `${(item.width / totalWidth) * 100}%`).join(" ") : `repeat(${table?.columns?.length ?? 1}, minmax(0, 1fr))`;

  if (!table || table.type !== "table") {
    return <div className="table-designer-missing">The table is no longer in this report. <button className="btn" onClick={() => useStore.getState().set({ tableEditId: null })}>Back to report</button></div>;
  }

  const updateGroup = (value: Record<string, unknown>) => {
    const st = useStore.getState();
    st.setDoc(ops.updateGroup(st.doc, selectedGroupId, value), { coalesce: `group:${selectedGroupId}` });
  };
  const flag = (key: string, label: string, fallback = false) => <label className="check"><input type="checkbox" checked={table[key] ?? fallback} onChange={(event) => patch(id, { [key]: event.target.checked })} />{label}</label>;
  const resizeStart = (event: React.PointerEvent<HTMLSpanElement>, index: number) => {
    const tableWidth = preview.current?.clientWidth ?? 1;
    drag.current = { index, x: event.clientX, width: widths[index]?.width ?? availableWidth / table.columns.length, scale: totalWidth / tableWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const resizeMove = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (!drag.current) return;
    const { index, x, width, scale } = drag.current;
    const nextWidth = Math.max(24, Math.round(width + (event.clientX - x) * scale));
    const current = useStore.getState().doc;
    const live = ops.find(current, id)?.comp;
    if (!live?.columns?.[index] || live.columns[index].width === nextWidth) return;
    useStore.getState().patch(id, { columns: live.columns.map((column: any, position: number) => position === index ? { ...column, width: nextWidth } : column) }, `table-column-width:${id}:${index}`);
  };
  const resizeEnd = () => { drag.current = null; };

  return <div className="table-designer" data-testid="table-designer" aria-label="Table Designer">
    <header className="table-designer-head">
      <div><span className="table-designer-eyebrow">TABLE DESIGNER</span><h1>{table.name || "Table"}</h1><span className="muted small">{table.columns.length} columns · {resolved?.rows?.length ?? 0} sample rows</span></div>
      <button className="btn primary" data-testid="table-designer-done" onClick={() => useStore.getState().set({ tableEditId: null })}>Done</button>
    </header>
    <nav className="table-designer-tabs" role="tablist" aria-label="Table editing tools">
      {TABS.map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} data-testid={`table-tab-${item.id}`} onClick={() => setTab(item.id)}>{item.label}</button>)}
    </nav>
    <div className="table-designer-body">
      <main className="table-designer-canvas" aria-label="Table editing canvas">
        <div className="table-designer-intro"><strong>{TABS.find((item) => item.id === tab)?.label}</strong><span className="muted small">{tab === "columns" ? "Drag a column edge to resize it." : tab === "header" ? "Select header cells, then merge, split or edit their text." : tab === "rows" ? "Select sample cells to merge or split." : "Review changes against the sample table."}</span></div>
        {tab === "header" && <div className="table-designer-direct" data-testid="table-direct-header"><TableHeaderEditor columns={table.columns} headerRows={table.headerRows} onChange={(headerRows) => patch(id, { headerRows })} /></div>}
        {tab === "rows" && <div className="table-designer-direct" data-testid="table-direct-rows"><TableBodyEditor columns={resolved?.columns ?? []} configColumns={table.columns ?? []} rows={resolved?.rows ?? []} merges={{ config: table.cellSpans ?? [], resolved: resolved?.cellSpans ?? [] }} onChange={(cellSpans) => patch(id, { cellSpans: cellSpans.length ? cellSpans : undefined })} /></div>}
        <div className="table-designer-preview-label">LIVE SAMPLE</div>
        <div className="table-designer-preview" ref={preview} style={{ gridTemplateColumns: columnTemplate }} data-testid="table-live-preview">
          {table.showHeader !== false && tableHeaderRows(table as any).flatMap((cells, rowIndex) => cells.map((cell) => <div className="table-designer-preview-head" key={`h-${rowIndex}-${cell.column}`} style={{ gridColumn: `${cell.column + 1} / span ${cell.colSpan ?? 1}`, gridRow: `${rowIndex + 1} / span ${cell.rowSpan ?? 1}` }}><span>{cell.text}</span></div>))}
          {tab === "columns" && widths.slice(0, -1).map((_, index) => <span key={`grip-${index}`} className="table-column-grip" role="separator" aria-label={`Resize ${table.columns[index]?.header || `column ${index + 1}`}`} aria-orientation="vertical" style={{ left: `${(widths.slice(0, index + 1).reduce((sum, item) => sum + item.width, 0) / totalWidth) * 100}%` }} onPointerDown={(event) => resizeStart(event, index)} onPointerMove={resizeMove} onPointerUp={resizeEnd} onLostPointerCapture={resizeEnd} />)}
          {(resolved?.rows ?? []).slice(0, 8).flatMap((row: any, rowIndex: number) => (resolved?.columns ?? table.columns).map((column: any, columnIndex: number) => <div className="table-designer-preview-cell" key={`${rowIndex}-${columnIndex}`} style={{ gridColumn: columnIndex + 1, gridRow: (table.showHeader === false ? 0 : tableHeaderRows(table as any).length) + rowIndex + 1 }}>{row.formatted?.[column.id] ?? ""}</div>))}
          {!resolved?.rows?.length && <div className="table-designer-empty" style={{ gridColumn: `span ${table.columns.length}` }}>Add sample records to preview table rows.</div>}
        </div>
        <p className="muted small">The sample shows up to eight rows. Preview the report to check page layout and every row.</p>
      </main>
      <aside className="table-designer-inspector" aria-label={`${TABS.find((item) => item.id === tab)?.label} settings`}>
        {tab === "columns" && <>
          <label className="field"><span className="field-label">Dataset</span><select aria-label="Table dataset" value={table.dataset ?? ""} onChange={(event) => patch(id, { dataset: event.target.value })}><option value="">Choose...</option>{refs.map((ref) => <option key={ref} value={ref}>{ref}</option>)}</select></label>
          {table.columns.map((column: any, index: number) => <ColumnEditor key={column.id ?? index} table={table} col={column} index={index} />)}
          <button className="btn" data-testid="table-designer-add-column" onClick={() => patch(id, { columns: [...table.columns, { id: `col-${Date.now()}`, header: "New column", binding: "row.value" }], ...(table.headerRows ? { headerRows: appendHeaderColumn(table.headerRows, table.columns.length, "New column") } : {}) })}>+ Add column</button>
        </>}
        {tab === "header" && <>{flag("showHeader", "Show table header", true)}{flag("repeatHeaderOnPageBreak", "Repeat header on every page", true)}<p className="muted small">Edit the header grid on the canvas. Its levels and merged cells print with the table.</p></>}
        {tab === "style" && <TableStyleEditor table={table} />}
        {tab === "rows" && <>
          {flag("alternateRowStyle", "Zebra stripes")}
          <label className="field"><span className="field-label">When there is no data</span>
            <select aria-label="Empty state" value={table.emptyState ?? "headers"} onChange={(event) => patch(id, { emptyState: event.target.value })}>
              <option value="headers">Show headers</option><option value="message">Show a message</option><option value="hide">Hide the table</option>
            </select>
          </label>
          {table.emptyState === "message" && <label className="field"><span className="field-label">Message</span><input aria-label="Empty message" value={table.emptyMessage ?? ""} placeholder="No records found" onChange={(event) => patch(id, { emptyMessage: event.target.value })} /></label>}
          <p className="muted small">A merge kept with a record follows it through sorting and filtering; a merge at a row position stays at that position.</p>
        </>}
        {tab === "groups" && (group ? <>
          <label className="field"><span className="field-label">Group</span><select aria-label="Table group" value={selectedGroupId} onChange={(event) => setGroupId(event.target.value)}>{(doc.groups ?? []).map((item: any) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</select></label>
          <label className="field"><span className="field-label">Name</span><input aria-label="Group name" value={group.name ?? ""} onChange={(event) => updateGroup({ name: event.target.value })} /></label>
          <label className="field"><span className="field-label">Group by</span><FormulaInput value={group.by ?? ""} candidates={candidatesFor(doc, sample, undefined, group.dataset ?? table.dataset)} onChange={(value) => updateGroup({ by: value })} /></label>
          <label className="field"><span className="field-label">Sort</span><select aria-label="Group sort" value={group.sort ?? "asc"} onChange={(event) => updateGroup({ sort: event.target.value })}><option value="asc">Ascending</option><option value="desc">Descending</option><option value="none">Source order</option></select></label>
          <label className="check"><input type="checkbox" checked={!!group.repeatHeader} onChange={(event) => updateGroup({ repeatHeader: event.target.checked })} />Repeat group header on each page</label>
        </> : <><p className="muted">This table has no report group yet.</p><button className="btn" onClick={() => useStore.getState().set({ tableEditId: null, leftOpen: true, leftTab: "layers", dialog: "group" })}>Create group</button></>)}
        {tab === "totals" && <>{flag("showFooter", "Show table totals row")}{Boolean(table.showFooter) && flag("keepFooterTogether", "Keep totals with a data row", true)}{table.columns.map((column: any, index: number) => <label className="field" key={column.id ?? index}><span className="field-label">{column.header || `Column ${index + 1}`}</span><select aria-label={`${column.header || `Column ${index + 1}`} total`} value={column.footer?.aggregate ?? ""} onChange={(event) => { const aggregate = event.target.value; patch(id, { columns: table.columns.map((item: any, position: number) => position === index ? { ...item, footer: aggregate ? { aggregate } : undefined } : item), ...(aggregate ? { showFooter: true } : {}) }); }}><option value="">None</option>{["sum", "avg", "min", "max", "count"].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>)}</>}
        {tab === "pagination" && <>{flag("repeatHeaderOnPageBreak", "Repeat header on every page", true)}<p className="muted small">Table rows stay whole at page breaks. Splitting a row is not available yet.</p><label className="field"><span className="field-label">Min rows before break</span><input type="number" min={0} value={table.minRowsBeforeBreak ?? ""} onChange={(event) => patch(id, { minRowsBeforeBreak: event.target.value === "" ? undefined : Number(event.target.value) })} /></label><label className="field"><span className="field-label">Min rows after break</span><input type="number" min={0} value={table.minRowsAfterBreak ?? ""} onChange={(event) => patch(id, { minRowsAfterBreak: event.target.value === "" ? undefined : Number(event.target.value) })} /></label></>}
        {tab === "conditions" && <StyleRulesEditor comp={table} property="rowStyleWhen" dataset={table.dataset} testId="table-designer-row-rules" />}
      </aside>
    </div>
  </div>;
}
