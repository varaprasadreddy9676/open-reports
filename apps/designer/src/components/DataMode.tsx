import React from "react";
import { useStore } from "../store";
import { datasetValue, inferFields, type FieldNode } from "../lib/fields";
import { DatasetEditor } from "./DatasetEditor";

const KIND_ICON: Record<FieldNode["kind"], string> = { string: "Aa", number: "#", boolean: "◐", date: "▣", object: "{}", array: "[]" };

export function SchemaTree({ nodes, onPick }: { nodes: FieldNode[]; onPick?: (path: string, kind: FieldNode["kind"]) => void }) {
  return (
    <ul className="schema-tree">
      {nodes.map((n) => (
        <li key={n.path}>
          <button className="field-row" onClick={() => onPick?.(n.path, n.kind)} title={n.path}>
            <span className={`kind kind-${n.kind}`}>{KIND_ICON[n.kind]}</span>
            <span>{n.name}</span>
          </button>
          {n.children && n.children.length > 0 && <SchemaTree nodes={n.children} onPick={onPick} />}
        </li>
      ))}
    </ul>
  );
}

/** Data mode: datasets as a first-class workspace, with the schema the report can bind to. */
export function DataMode() {
  const { doc, sample, editingDataset, parameters } = useStore();
  const set = useStore((s) => s.set);
  const datasets = (doc.datasets ?? []) as any[];
  const current = datasets.find((d) => d.id === editingDataset);
  const value = current ? datasetValue(doc, sample, current.id) : undefined;
  return (
    <div className="data-mode" data-testid="data-mode">
      <aside className="data-list" aria-label="Datasets">
        <div className="group-title">Datasets</div>
        {datasets.length === 0 && <p className="muted pad">No datasets yet. Add one to bind real data, or paste sample JSON to generate a report.</p>}
        {datasets.map((d) => (
          <button key={d.id} className={`data-item ${editingDataset === d.id ? "active" : ""}`} data-testid={`data-item-${d.id}`} onClick={() => set({ editingDataset: d.id })}>
            <strong>{d.id}</strong>
            <span className="muted small">{d.source}{Array.isArray(datasetValue(doc, sample, d.id)) ? ` · ${(datasetValue(doc, sample, d.id) as unknown[]).length} rows` : ""}</span>
          </button>
        ))}
        <button className="btn" data-testid="data-add" onClick={() => set({ editingDataset: null, dialog: "dataset" })}>+ Add dataset</button>
        <button className="btn" onClick={() => set({ dialog: "generate" })}>From sample JSON…</button>
        {(doc.parameters ?? []).length > 0 && (
          <>
            <div className="group-title">Parameters</div>
            {(doc.parameters as any[]).map((p) => (
              <label key={p.name} className="field">
                <span className="field-label">{p.label ?? p.name}</span>
                <input value={String(parameters[p.name] ?? p.default ?? "")} onChange={(e) => useStore.getState().setParameter(p.name, e.target.value)} />
              </label>
            ))}
          </>
        )}
      </aside>
      <section className="data-main">
        {current ? (
          <>
            <DatasetEditor key={current.id} />
            <div className="group-title">Schema</div>
            <SchemaTree nodes={inferFields(value)} />
          </>
        ) : (
          <div className="empty-state">
            <h3>Select a dataset</h3>
            <p className="muted">Datasets can be inline JSON, a REST API, PostgreSQL, MySQL or a CSV file. Use <code>{"{{secrets.NAME}}"}</code> for API keys — secrets live on the server, never in the report.</p>
          </div>
        )}
      </section>
    </div>
  );
}
