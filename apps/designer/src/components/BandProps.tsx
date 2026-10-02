import { useMemo, useState, type ReactNode } from "react";
import { PAGE_BAND_TYPES } from "@reporting/schema";
import { candidatesFor } from "../lib/bindings";
import { conditionToExpression, expressionToCondition, OPERATORS, type Condition } from "../lib/lowcode";
import * as ops from "../model/ops";
import { useStore } from "../store";
import { FormulaInput } from "./FormulaInput";
import { InspectorSection } from "./InspectorSection";
import { SpacingFields, type SpacingValue } from "./SpacingFields";
import { InspectorActions } from "./InspectorActions";

const PAGE_TYPES: readonly string[] = PAGE_BAND_TYPES;
const DATA_TYPES = ["dataHeader", "groupHeader", "detail", "child", "groupFooter", "dataFooter", "noData"];

function BandField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span className="field-label">{label}</span>{children}</label>;
}

export function BandProps({ index }: { index: number }) {
  const { doc, sample } = useStore();
  const band = doc.sections?.[index];
  const group = (doc.groups ?? []).find((g: any) => g.id === band?.groupId);
  const [conditionView, setConditionView] = useState<"builder" | "code">("builder");
  const rowDataset = band?.dataset ?? group?.dataset ?? doc.sections?.find((section: any) => section.type === "detail")?.dataset;
  const candidates = useMemo(() => candidatesFor(doc, sample, undefined, rowDataset), [doc, sample, rowDataset]);
  if (!band) return null;

  const pageBand = PAGE_TYPES.includes(band.type);
  const dataBand = DATA_TYPES.includes(band.type);
  const update = (patch: Record<string, unknown>) => {
    const st = useStore.getState();
    st.setDoc(ops.updateBand(st.doc, index, patch), { coalesce: `band:${index}:${Object.keys(patch).join(",")}` });
  };
  const updatePadding = (padding: SpacingValue) => {
    const style = { ...(band.style ?? {}) };
    if (padding === undefined) delete style.padding;
    else style.padding = padding;
    update({ style: Object.keys(style).length ? style : undefined });
  };
  const updateGroup = (patch: Record<string, unknown>) => {
    const st = useStore.getState();
    st.setDoc(ops.updateGroup(st.doc, band.groupId, patch), { coalesce: `group:${band.groupId}:${Object.keys(patch).join(",")}` });
  };
  const number = (key: string, label: string, min = 0) => (
    <BandField label={label}>
      <input type="number" min={min} aria-label={label} data-testid={`band-${key}`} value={band[key] ?? ""} onChange={(e) => update({ [key]: e.target.value === "" ? undefined : Number(e.target.value) })} />
    </BandField>
  );
  const flag = (key: string, label: string) => (
    <label className="check"><input type="checkbox" data-testid={`band-${key}`} checked={!!band[key]} onChange={(e) => update({ [key]: e.target.checked })} />{label}</label>
  );
  const expression = band.visibleWhen ?? "";
  const condition = expressionToCondition(expression);
  const current: Condition = condition ?? { field: candidates[0]?.value ?? "row.value", operator: "gt", value: "0" };
  const showCode = conditionView === "code" || (!!expression && !condition);
  const setCondition = (next: Condition) => update({ visibleWhen: conditionToExpression(next) });
  const move = (to: number) => {
    const st = useStore.getState();
    const next = ops.moveBand(st.doc, index, to);
    if (next) {
      st.setDoc(next);
      st.set({ selectedBand: to });
    }
  };

  return <>
    <div className="prop-head">
      <strong>{ops.BAND_TITLES[band.type] ?? band.type}</strong>
      <span className="spacer" />
      <InspectorActions label="Band actions">
      <button data-testid="band-lock" onClick={() => update({ locked: !band.locked })}>{band.locked ? "Unlock layout" : "Lock layout"}</button>
      <button data-testid="duplicate-band" disabled={!!band.locked} onClick={() => {
        const st = useStore.getState();
        const next = ops.duplicateBand(st.doc, index);
        st.setDoc(next.doc);
        st.set({ selectedBand: next.index });
      }}>Duplicate band</button>
      <button className="danger" data-testid="delete-band" disabled={!!band.locked} onClick={() => {
        const st = useStore.getState();
        st.setDoc(ops.removeSection(st.doc, index));
        st.set({ selectedBand: null });
      }}>Delete band</button>
      </InspectorActions>
    </div>

    <InspectorSection title="General">
      <BandField label="Name"><input aria-label="Band name" data-testid="band-name" value={band.name ?? ""} placeholder={ops.bandDisplayName(doc, { ...band, name: undefined })} onChange={(e) => update({ name: e.target.value })} /></BandField>
      {dataBand && <BandField label="Dataset">
        <select aria-label="Band dataset" data-testid="band-dataset" value={band.dataset ?? ""} onChange={(e) => update({ dataset: e.target.value || undefined })}>
          <option value="">Inherit from data region</option>
          {(doc.datasets ?? []).map((ds: any) => <option key={ds.id} value={ds.id}>{ds.name ?? ds.id}</option>)}
        </select>
      </BandField>}
      {(band.type === "groupHeader" || band.type === "groupFooter") && <BandField label="Group">
        <select aria-label="Band group" data-testid="band-group" value={band.groupId ?? ""} disabled={!!band.locked} onChange={(e) => update({ groupId: e.target.value || undefined })}>
          <option value="">Choose a group</option>
          {(doc.groups ?? []).map((g: any) => <option key={g.id} value={g.id}>{g.name ?? g.id}</option>)}
        </select>
      </BandField>}
      {band.type === "child" && <BandField label="Parent band">
        <select aria-label="Parent band" data-testid="band-parent" value={band.parent ?? ""} disabled={!!band.locked} onChange={(e) => update({ parent: e.target.value || undefined })}>
          <option value="">Choose a parent</option>
          {(doc.sections ?? []).filter((s: any, i: number) => i !== index && s.type !== "child" && s.id).map((s: any) => <option key={s.id} value={s.id}>{ops.bandDisplayName(doc, s)}</option>)}
        </select>
      </BandField>}
      {pageBand && <BandField label="Pages">
        <select aria-label="Applies to pages" data-testid="band-appliesTo" value={band.appliesTo ?? "all"} onChange={(e) => update({ appliesTo: e.target.value === "all" ? undefined : e.target.value })}>
          {(["all", "first", "last", "odd", "even", "standard"] as const).map((v) => <option key={v} value={v}>{v === "all" ? "All pages" : v[0]!.toUpperCase() + v.slice(1) + " pages"}</option>)}
        </select>
      </BandField>}
    </InspectorSection>

    <InspectorSection title="Size and layout" open={false} summary={`${({ flow: "Stack", row: "Row", grid: "Grid", absolute: "Free" } as Record<string, string>)[band.layout ?? "flow"] ?? "Stack"} · ${band.height === undefined ? "Auto height" : `${band.height} pt`}`}>
    <fieldset className="band-props-fields" disabled={!!band.locked}>
      <div className="grid2">{number("height", "Fixed height (pt)")}{number("minHeight", "Min height (pt)")}</div>
      {band.height !== undefined && <button type="button" className="link" onClick={() => update({ height: undefined })}>Use content height</button>}
      <BandField label="Arrange children"><select aria-label="Band layout" data-testid="band-layout" value={band.layout ?? "flow"} onChange={(e) => update({ layout: e.target.value === "flow" ? undefined : e.target.value })}>
        <option value="flow">Stack vertically</option>
        <option value="row">Side by side</option>
        <option value="grid">Grid</option>
        <option value="absolute">Free position</option>
      </select></BandField>
      {band.layout !== "absolute" && <div className="grid2">{number("gap", "Gap (pt)")}{band.layout === "grid" && number("columns", "Columns", 1)}</div>}
      <SpacingFields label="Padding (pt)" value={band.style?.padding} onChange={updatePadding} testId="band-padding" />
      {(band.layout === undefined || band.layout === "flow" || band.layout === "row") && <div className="grid2">
        <BandField label="Align"><select aria-label="Band align" data-testid="band-alignItems" value={band.alignItems ?? ""} onChange={(e) => update({ alignItems: e.target.value || undefined })}>
          <option value="">Default</option>{["start", "center", "end", "stretch"].map((v) => <option key={v}>{v}</option>)}
        </select></BandField>
        {band.layout === "row" && <BandField label="Distribute"><select aria-label="Band distribute" data-testid="band-justifyContent" value={band.justifyContent ?? ""} onChange={(e) => update({ justifyContent: e.target.value || undefined })}>
          <option value="">Default</option>{["start", "center", "end", "space-between", "space-around"].map((v) => <option key={v}>{v}</option>)}
        </select></BandField>}
      </div>}
    </fieldset>
    </InspectorSection>

    <InspectorSection title="Visibility" open={false} summary={band.hidden ? "Hidden" : band.visibleWhen ? "Conditional" : "Visible"}>
      {flag("hidden", "Hide band from output")}
      {flag("suppressWhenBlank", "Hide when empty")}
      <label className="check"><input type="checkbox" data-testid="band-visibleWhen-toggle" checked={!!expression} onChange={(e) => update({ visibleWhen: e.target.checked ? conditionToExpression(current) : undefined })} />Show only when...</label>
      {!!expression && <div className="seg small" role="tablist" aria-label="Band condition editor">
        <button type="button" role="tab" aria-selected={!showCode} disabled={!condition} className={!showCode ? "active" : ""} data-testid="band-condition-builder" onClick={() => setConditionView("builder")}>Builder</button>
        <button type="button" role="tab" aria-selected={showCode} className={showCode ? "active" : ""} data-testid="band-condition-code" onClick={() => setConditionView("code")}>Code</button>
      </div>}
      {!!expression && !showCode && condition && <div className="condition-row">
        <select aria-label="Band condition field" data-testid="band-condition-field" value={condition.field} onChange={(e) => setCondition({ ...condition, field: e.target.value })}>
          {!candidates.some((c) => c.value === condition.field) && <option value={condition.field}>{condition.field}</option>}
          {candidates.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select aria-label="Band condition operator" data-testid="band-condition-operator" value={condition.operator} onChange={(e) => setCondition({ ...condition, operator: e.target.value as Condition["operator"] })}>
          {OPERATORS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        {condition.operator !== "empty" && condition.operator !== "notempty" && <input aria-label="Band condition value" data-testid="band-condition-value" value={condition.value} onChange={(e) => setCondition({ ...condition, value: e.target.value })} />}
      </div>}
      {!!expression && showCode && <>
        <FormulaInput value={expression} candidates={candidates} placeholder="e.g. row.quantity > 0" testId="band-visibleWhen" onChange={(value) => update({ visibleWhen: value })} />
        <p className="muted small">JavaScript-style expressions with report fields; no statements or arbitrary scripts.</p>
      </>}
    </InspectorSection>

    <InspectorSection title="Pagination" open={false} summary={band.newPageBefore || band.newPageAfter || band.keepTogether || band.repeatEveryPage ? "Custom rules" : "Default"}>
      {flag("newPageBefore", "Start on a new page")}
      {flag("newPageAfter", "Page break after")}
      {flag("keepTogether", "Keep this band together")}
      {flag("keepWithNext", "Keep with next band")}
      {flag("keepWithPrevious", "Keep with previous band")}
      <BandField label="Split across pages"><select aria-label="Split across pages" data-testid="band-allowSplit" value={band.allowSplit === undefined ? "default" : String(band.allowSplit)} onChange={(e) => update({ allowSplit: e.target.value === "default" ? undefined : e.target.value === "true" })}>
        <option value="default">Automatic</option><option value="true">Allow</option><option value="false">Never</option>
      </select></BandField>
      {flag("printAtBottom", "Print at bottom")}
      {band.type === "groupHeader" && <label className="check"><input type="checkbox" data-testid="band-repeatEveryPage" checked={band.repeatEveryPage ?? group?.repeatHeader ?? false} onChange={(e) => update({ repeatEveryPage: e.target.checked })} />Repeat on continuation pages</label>}
    </InspectorSection>

    {group && <InspectorSection title={`Group: ${group.name ?? group.id}`}>
      <BandField label="Group name"><input aria-label="Group name" data-testid="group-name" value={group.name ?? ""} onChange={(e) => updateGroup({ name: e.target.value || undefined })} /></BandField>
      <BandField label="Group dataset"><select aria-label="Group dataset" data-testid="group-dataset" value={group.dataset ?? ""} onChange={(e) => updateGroup({ dataset: e.target.value || undefined })}>
        <option value="">Inherit from detail band</option>
        {(doc.datasets ?? []).map((ds: any) => <option key={ds.id} value={ds.id}>{ds.name ?? ds.id}</option>)}
      </select></BandField>
      <BandField label="Group by"><FormulaInput value={group.by} candidates={candidates} placeholder="e.g. row.department" testId="group-by" onChange={(value) => updateGroup({ by: value })} /></BandField>
      <BandField label="Sort"><select aria-label="Group sort" data-testid="group-sort" value={group.sort ?? "asc"} onChange={(e) => updateGroup({ sort: e.target.value })}>
        <option value="asc">Ascending</option><option value="desc">Descending</option><option value="none">Source order</option>
      </select></BandField>
      <label className="check"><input type="checkbox" data-testid="group-repeatHeader" checked={!!group.repeatHeader} onChange={(e) => updateGroup({ repeatHeader: e.target.checked })} />Repeat header on each page</label>
      <BandField label="Start a new page"><select aria-label="Group page break" data-testid="group-newPage" value={group.newPage ?? "none"} onChange={(e) => updateGroup({ newPage: e.target.value })}>
        <option value="none">No</option><option value="before">Before each group</option><option value="after">After each group</option>
      </select></BandField>
      <label className="check"><input type="checkbox" data-testid="group-keepTogether" checked={!!group.keepTogether} onChange={(e) => updateGroup({ keepTogether: e.target.checked })} />Keep group together when it fits</label>
      <BandField label="Min detail rows after header"><input type="number" min={0} aria-label="Min detail rows after header" data-testid="group-minDetailRows" value={group.minDetailRows ?? 1} onChange={(e) => updateGroup({ minDetailRows: Number(e.target.value) })} /></BandField>
    </InspectorSection>}

    <InspectorSection title="Actions" open={false}><div className="btn-grid">
      <button className="btn" data-testid="move-band-up" disabled={!ops.canMoveBand(doc, index, index - 1)} onClick={() => move(index - 1)}>Move up</button>
      <button className="btn" data-testid="move-band-down" disabled={!ops.canMoveBand(doc, index, index + 1)} onClick={() => move(index + 1)}>Move down</button>
    </div></InspectorSection>
  </>;
}
