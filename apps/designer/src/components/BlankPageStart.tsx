import { useStore } from "../store";
import { addReportSection } from "./LeftPanel";

/** True for a report with nothing on it yet: one empty section and no groups. */
export function isBlankReport(doc: { sections?: { children?: unknown[] }[]; groups?: unknown[] }): boolean {
  return (doc.sections?.length ?? 0) === 1 && !doc.sections?.[0]?.children?.length && !doc.groups?.length;
}

function startEditing(id: string) {
  if (id) useStore.getState().set({ selection: [id], editingText: id, rightOpen: true });
}

/**
 * The first step on an empty page, where the eye already is. Disappears as soon as the page has content.
 * Each choice leaves something on the page that the user can type into straight away.
 */
export function BlankPageStart({ left, top, width }: { left: number; top: number; width: number }) {
  const hasData = useStore((s) => (s.doc.datasets?.length ?? 0) > 0);
  const addText = () => startEditing(useStore.getState().addComponent("text", undefined, "after", { value: "Report title", style: { fontSize: 18, fontWeight: "bold" } }));
  const addHeader = () => {
    const band = addReportSection("pageHeader");
    if (band === undefined) return;
    const id = useStore.getState().insertComponent({ type: "text", value: "Company name", style: { fontSize: 14, fontWeight: "bold" } }, undefined, "after", band);
    startEditing(id);
    useStore.getState().toast("The page header repeats at the top of every page. Type the name, then add more to it from Components.", "info");
  };
  const set = useStore((s) => s.set);
  return (
    <div className="blank-start" data-testid="blank-start" role="group" aria-label="Start your report" style={{ left, top, width }} onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}>
      <strong>Start your report</strong>
      <p>Pick a first step. You can change everything later.</p>
      <div className="blank-start-actions">
        <button type="button" className="btn primary" data-testid="blank-add-text" onClick={addText}>Add a title</button>
        <button type="button" className="btn" data-testid="blank-add-header" title="A page header repeats at the top of every page: logo, company name, report title" onClick={addHeader}>Add a page header</button>
        <button type="button" className="btn" data-testid="blank-from-example" onClick={() => set({ dialog: "new" })}>Start from an example</button>
      </div>
      <p className="blank-start-data">
        {hasData ? "Your data is ready: drag its fields from the Data panel onto the page." : <>Have data already? <button type="button" className="link-button" data-testid="blank-from-json" onClick={() => set({ dialog: "generate" })}>Paste sample JSON</button> and the layout is built for you.</>}
      </p>
    </div>
  );
}
