import { useMemo, useState, type FormEvent } from "react";
import { arrayRefs, datasetFields, flatFieldPaths } from "../lib/fields";
import { checkExpression } from "../lib/lowcode";
import * as ops from "../model/ops";
import { useStore } from "../store";

/** Creates one grouping level at the innermost position of its data region. */
export function GroupWizard() {
  const { doc, sample } = useStore();
  const refs = useMemo(() => arrayRefs(doc, sample), [doc, sample]);
  const [dataset, setDataset] = useState(refs[0] ?? "");
  const fields = useMemo(() => flatFieldPaths(datasetFields(doc, sample, dataset)), [doc, sample, dataset]);
  const [mode, setMode] = useState<"field" | "formula">("field");
  const [by, setBy] = useState("");
  const [name, setName] = useState("");
  const [sort, setSort] = useState<"asc" | "desc" | "none">("asc");
  const [header, setHeader] = useState(true);
  const [footer, setFooter] = useState(true);
  const [repeatHeader, setRepeatHeader] = useState(false);
  const [newPage, setNewPage] = useState<"none" | "before" | "after">("none");
  const [keepTogether, setKeepTogether] = useState(false);
  const [minDetailRows, setMinDetailRows] = useState(1);
  const expression = by.trim();
  const expressionError = expression ? checkExpression(expression) : undefined;
  const invalid = !dataset || !expression || !!expressionError || (!header && !footer);
  const close = () => useStore.getState().set({ dialog: null });

  function create(e: FormEvent) {
    e.preventDefault();
    if (invalid) return;
    const st = useStore.getState();
    const result = ops.addGroup(st.doc, { dataset, by: expression, name: name.trim() || undefined, sort, header, footer, repeatHeader, newPage, keepTogether, minDetailRows });
    st.setDoc(result.doc);
    const selectedBand = result.doc.sections.findIndex((s: any) => s.groupId === result.groupId);
    st.set({ dialog: null, selectedBand: selectedBand < 0 ? null : selectedBand, selection: [], rightOpen: true, leftTab: "layers" });
  }

  return <form className="group-wizard" data-testid="group-wizard" onSubmit={create} aria-label="Create group">
    <h2>Add group</h2>
    <p className="muted small">Groups follow the order shown in the explorer. Add an outer group first, then add its inner groups.</p>
    {refs.length === 0 ? <p role="status">Add an array dataset in the Data tab before creating a group.</p> : <>
      <label className="field"><span className="field-label">Dataset</span>
        <select aria-label="Group dataset" data-testid="wizard-dataset" value={dataset} onChange={(e) => {
          setDataset(e.target.value);
          setBy("");
          setMode("field");
        }}>{refs.map((ref) => <option key={ref} value={ref}>{ref}</option>)}</select>
      </label>
      <div className="grid2">
        <label className="field"><span className="field-label">Group by</span>
          <select aria-label="Group by mode" data-testid="wizard-mode" value={mode} onChange={(e) => {
            const next = e.target.value as "field" | "formula";
            setMode(next);
            if (next === "field" && !fields.some((field) => `row.${field}` === by)) setBy("");
          }}><option value="field">Dataset field</option><option value="formula">Formula</option></select>
        </label>
        {mode === "field" && <label className="field"><span className="field-label">Field</span>
          <select aria-label="Grouping field" data-testid="wizard-field" value={by} onChange={(e) => setBy(e.target.value)}>
            <option value="">Choose a field...</option>
            {fields.map((field) => <option key={field} value={`row.${field}`}>{field}</option>)}
          </select>
        </label>}
      </div>
      {mode === "formula" && <label className="field"><span className="field-label">Grouping expression</span>
        <input className="mono" aria-label="Grouping expression" data-testid="wizard-expression" value={by} onChange={(e) => setBy(e.target.value)} placeholder="e.g. row.department" aria-invalid={!!expressionError} />
        {expressionError && <span className="field-error" role="alert">{expressionError}</span>}
      </label>}
      {mode === "field" && fields.length === 0 && <p className="muted small">No sample fields found. Choose Formula to enter a grouping expression.</p>}
      <label className="field"><span className="field-label">Group name</span>
        <input aria-label="Group name" data-testid="wizard-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Defaults to the field name" />
      </label>
      <div className="grid2">
        <label className="field"><span className="field-label">Sort groups</span><select aria-label="Group sort" data-testid="wizard-sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="asc">Ascending</option><option value="desc">Descending</option><option value="none">Source order</option>
        </select></label>
        <label className="field"><span className="field-label">New page for each group</span><select aria-label="New page for each group" data-testid="wizard-new-page" value={newPage} onChange={(e) => setNewPage(e.target.value as typeof newPage)}>
          <option value="none">No</option><option value="before">Before</option><option value="after">After</option>
        </select></label>
      </div>
      <div className="grid2">
        <label className="check"><input type="checkbox" data-testid="wizard-header" checked={header} onChange={(e) => setHeader(e.target.checked)} />Header band</label>
        <label className="check"><input type="checkbox" data-testid="wizard-footer" checked={footer} onChange={(e) => setFooter(e.target.checked)} />Footer band</label>
      </div>
      {!header && !footer && <p className="field-error" role="alert">Choose a header or footer band.</p>}
      <label className="check"><input type="checkbox" data-testid="wizard-repeat" checked={repeatHeader} disabled={!header} onChange={(e) => setRepeatHeader(e.target.checked)} />Repeat header on continuation pages</label>
      <label className="check"><input type="checkbox" data-testid="wizard-keep" checked={keepTogether} onChange={(e) => setKeepTogether(e.target.checked)} />Keep each group together when it fits</label>
      <label className="field"><span className="field-label">Minimum detail rows after header</span>
        <input type="number" min={0} step={1} aria-label="Minimum detail rows after header" data-testid="wizard-min-rows" value={minDetailRows} onChange={(e) => setMinDetailRows(Math.max(0, Number(e.target.value) || 0))} />
      </label>
    </>}
    <div className="dialog-actions"><button type="button" className="btn" onClick={close}>Cancel</button><button type="submit" className="btn primary" data-testid="wizard-create" disabled={invalid}>Add group</button></div>
  </form>;
}
