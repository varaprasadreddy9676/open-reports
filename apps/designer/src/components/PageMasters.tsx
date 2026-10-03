import { useState } from "react";
import { useStore } from "../store";
import * as ops from "../model/ops";
import { InspectorSection } from "./InspectorSection";

const KINDS: { kind: ops.MasterKind; label: string; description: string }[] = [
  { kind: "first", label: "First", description: "Page 1 uses this before other page variants." },
  { kind: "standard", label: "Normal", description: "The fallback for pages without a more specific variant." },
  { kind: "last", label: "Last", description: "The final page can carry totals, signatures, or legal notes." },
  { kind: "odd", label: "Odd", description: "For the front side of a double-sided report." },
  { kind: "even", label: "Even", description: "For the back side of a double-sided report." },
];
const SLOTS: { type: ops.MasterBandType; label: string; description: string }[] = [
  { type: "pageHeader", label: "Header", description: "Top of the printable page" },
  { type: "pageFooter", label: "Footer", description: "Bottom of the printable page" },
  { type: "background", label: "Background", description: "Behind the page content" },
];

function findMaster(doc: ops.Doc, type: ops.MasterBandType, kind: ops.MasterKind): number {
  return (doc.sections ?? []).findIndex((section: any) => section.type === type
    && (kind === "standard" ? !section.appliesTo || section.appliesTo === "all" || section.appliesTo === "standard" : section.appliesTo === kind));
}

/** Page variants edit the same bands that the paginator and PDF renderer use. */
export function PageMasters() {
  const { doc, leftTab } = useStore();
  const setDoc = useStore((state) => state.setDoc);
  const select = useStore((state) => state.select);
  const set = useStore((state) => state.set);
  const [kind, setKind] = useState<ops.MasterKind>("first");
  const selected = KINDS.find((entry) => entry.kind === kind)!;

  const open = (index: number) => {
    const first = (doc.sections?.[index]?.children ?? [])[0];
    set({ leftTab: "layers", leftOpen: true, rightOpen: true, canvasView: "pages", selectedBand: index, selection: [] });
    if (first) select([first.id]);
  };
  const addPageCount = () => {
    const store = useStore.getState();
    let index = findMaster(store.doc, "pageFooter", "standard");
    if (index < 0) {
      store.setDoc(ops.addMaster(store.doc, "pageFooter", "standard"));
      index = findMaster(useStore.getState().doc, "pageFooter", "standard");
    }
    const footer = useStore.getState().doc.sections[index];
    const existing = footer?.children?.find((comp: ops.Comp) => comp.type === "text" && /page\.number/.test(comp.expression ?? "") && /page\.total/.test(comp.expression ?? ""));
    if (existing) store.select([existing.id]);
    else store.insertComponent({ type: "text", expression: '"Page " + page.number + " of " + page.total', style: { align: "right", fontSize: 8, color: "#6b7280" } }, undefined, "after", index);
    store.set({ leftTab: "layers", leftOpen: true, rightOpen: true });
  };
  const labelFor = (type: ops.MasterBandType) => {
    const own = findMaster(doc, type, kind);
    if (own >= 0) return (doc.sections[own]?.children?.length ?? 0) ? "Custom" : "Blank here";
    return findMaster(doc, type, "standard") >= 0 ? "Uses normal" : "None";
  };

  return <div data-testid="page-masters-section"><InspectorSection key={leftTab} title="Headers & footers" open={leftTab === "pages"}>
    <div className="master-heading">Page masters</div>
    <p className="muted small master-intro">Choose the page type, then edit its header, footer, or background. Each copy can be changed independently.</p>
    <div className="master-tabs" role="tablist" aria-label="Page type">
      {KINDS.map((entry) => <button key={entry.kind} role="tab" aria-selected={kind === entry.kind} className={kind === entry.kind ? "active" : ""} data-testid={`master-kind-${entry.kind}`} onClick={() => setKind(entry.kind)}>{entry.label}</button>)}
    </div>
    <div className="master-variant" role="tabpanel">
      <p className="muted small master-description">{selected.description}</p>
      <div className="master-outline" aria-label={`${selected.label} page outline`}>
        <div className={`master-outline-head ${labelFor("pageHeader") === "Blank here" ? "blank" : ""}`}>Header · {labelFor("pageHeader")}</div>
        <div className="master-outline-body"><span>Report content</span>{labelFor("background") !== "None" && <small>Background · {labelFor("background")}</small>}</div>
        <div className={`master-outline-foot ${labelFor("pageFooter") === "Blank here" ? "blank" : ""}`}>Footer · {labelFor("pageFooter")}</div>
      </div>
      {SLOTS.map(({ type, label, description }) => {
        const index = findMaster(doc, type, kind);
        const normal = findMaster(doc, type, "standard");
        const band = index >= 0 ? doc.sections[index] : undefined;
        return <div key={type} className="master-slot" data-testid={`masters-${type}`}>
          <div className="master-slot-heading"><strong>{label}</strong><span>{labelFor(type)}</span></div>
          <div className="muted small">{description}</div>
          <div className="master-slot-actions">
            {index >= 0 ? <>
              <button className="mini" data-testid={`master-open-${type}-${kind}`} onClick={() => open(index)}>Edit {label.toLowerCase()}</button>
              {kind !== "standard" && <button className="mini danger" aria-label={`Remove ${selected.label} ${type}`} title={band?.locked ? "Unlock this band before removing it" : "Remove this override and use the normal page"} disabled={Boolean(band?.locked)} data-testid={`master-remove-${type}-${kind}`} onClick={() => setDoc(ops.removeSection(doc, index))}>Remove</button>}
            </> : <>
              <button className="mini" data-testid={`master-add-${type}-${kind}`} onClick={() => setDoc(ops.addMaster(doc, type, kind))}>{normal >= 0 && kind !== "standard" ? "Copy normal" : `Add ${label.toLowerCase()}`}</button>
              {kind !== "standard" && <button className="mini" data-testid={`master-hide-${type}-${kind}`} title={`Show no ${label.toLowerCase()} on ${selected.label.toLowerCase()} pages`} onClick={() => setDoc(ops.addMaster(doc, type, kind, true))}>Blank here</button>}
            </>}
          </div>
        </div>;
      })}
    </div>
    <div className="master-footer-tools"><button className="btn" data-testid="master-add-page-count" onClick={addPageCount}>+ Page X of Y</button></div>
    <p className="muted small master-footnote">A one-page report uses First before Last. Last takes priority over Odd and Even. Preview the PDF to check the final result.</p>
  </InspectorSection></div>;
}
