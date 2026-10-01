import React, { useState } from "react";
import { useStore } from "../store";
import { api } from "../lib/api";

type Kind = "inline" | "rest" | "sql";

function ResultPreview({ value }: { value: unknown }) {
  const rows = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  const cols = rows.length ? Object.keys(rows[0] as object).slice(0, 8) : [];
  if (!rows.length) return <p className="muted">No rows returned.</p>;
  return (
    <div className="result-preview" data-testid="dataset-result">
      <table>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 8).map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c}>{typeof (r as any)[c] === "object" ? JSON.stringify((r as any)[c]) : String((r as any)[c])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const j = (v: unknown) => (v === undefined ? "" : JSON.stringify(v, null, 2));

export function DatasetEditor() {
  const { doc, sample, editingDataset } = useStore();
  const existing = (doc.datasets ?? []).find((d: any) => d.id === editingDataset);
  const [id, setId] = useState<string>(existing?.id ?? `dataset${(doc.datasets ?? []).length + 1}`);
  const [kind, setKind] = useState<Kind>((existing?.source as Kind) ?? "inline");
  const q = existing?.query ?? {};
  const [data, setData] = useState(j(existing?.source === "inline" ? q.data ?? sample[id] : sample[id] ?? [{ name: "Sample", amount: 100 }]));
  const [url, setUrl] = useState(q.url ?? "https://");
  const [method, setMethod] = useState(q.method ?? "GET");
  const [headers, setHeaders] = useState(j(q.headers));
  const [query, setQuery] = useState(j(q.query));
  const [body, setBody] = useState(j(q.body));
  const [resultPath, setResultPath] = useState(q.resultPath ?? "");
  const [connectionId, setConnectionId] = useState(q.connectionId ?? "");
  const [sql, setSql] = useState(q.sql ?? "SELECT * FROM table WHERE id = $1");
  const [params, setParams] = useState(j(q.params));
  const [preview, setPreview] = useState<unknown>(sample[id]);
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const parseJson = (text: string, label: string) => {
    if (!text.trim()) return undefined;
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`${label}: ${(e as Error).message}`);
    }
  };

  function definition() {
    if (kind === "inline") return { id, source: "inline", query: { data: parseJson(data, "Data") } };
    if (kind === "rest") {
      return { id, source: "rest", query: { url, method, headers: parseJson(headers, "Headers"), query: parseJson(query, "Query parameters"), body: parseJson(body, "Body"), resultPath: resultPath || undefined } };
    }
    return { id, source: "sql", query: { connectionId, sql, params: parseJson(params, "Parameters") } };
  }

  async function test() {
    setError("");
    setBusy(true);
    try {
      const def = definition();
      if (kind === "inline") {
        setPreview((def.query as any).data);
      } else {
        const res = await api.testDataset(def, useStore.getState().parameters);
        if (!res.ok) throw new Error(res.issues.map((i) => i.message).join("; ") || "The dataset failed.");
        setPreview(res.value);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function save() {
    try {
      const def = definition();
      if (!/^[A-Za-z_][\w-]*$/.test(id)) throw new Error("Dataset id must start with a letter and contain only letters, digits, - or _.");
      if ((doc.datasets ?? []).some((d: any) => d.id === id && d.id !== editingDataset)) throw new Error(`A dataset named "${id}" already exists.`);
      const s = useStore.getState();
      const list = existing ? (doc.datasets as any[]).map((d) => (d.id === editingDataset ? def : d)) : [...(doc.datasets ?? []), def];
      s.setDoc({ ...doc, datasets: list });
      if (kind !== "inline" && preview !== undefined) s.setSample(id, preview);
      else if (kind === "inline") {
        // inline data lives in the definition; drop any stale sample override
        const { [id]: _drop, ...rest } = s.sample;
        void _drop;
        s.set({ sample: rest });
        s.refresh();
      }
      s.set({ dialog: null });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="dialog dataset-editor" role="dialog" aria-label="Dataset editor" data-testid="dataset-editor">
      <h2>{existing ? "Edit dataset" : "New dataset"}</h2>
      <label className="field wide">
        <span className="field-label">Name</span>
        <input data-testid="dataset-id" value={id} onChange={(e) => setId(e.target.value)} />
      </label>
      <div className="seg" role="tablist">
        {(["inline", "rest", "sql"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? "active" : ""} data-testid={`dataset-kind-${k}`} onClick={() => setKind(k)}>
            {k === "inline" ? "JSON data" : k === "rest" ? "REST API" : "SQL"}
          </button>
        ))}
      </div>

      {kind === "inline" && (
        <label className="field wide">
          <span className="field-label">JSON (object or array)</span>
          <textarea className="mono" data-testid="dataset-json" rows={10} value={data} onChange={(e) => setData(e.target.value)} spellCheck={false} />
        </label>
      )}
      {kind === "rest" && (
        <>
          <div className="grid-url">
            <select aria-label="Method" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option>GET</option>
              <option>POST</option>
            </select>
            <input aria-label="URL" data-testid="dataset-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/invoices/{{params.invoiceId}}" />
          </div>
          <label className="field wide">
            <span className="field-label">Headers (JSON) - never put secrets in templates; use server-side config</span>
            <textarea className="mono" rows={2} value={headers} onChange={(e) => setHeaders(e.target.value)} spellCheck={false} />
          </label>
          <label className="field wide">
            <span className="field-label">Query parameters (JSON)</span>
            <textarea className="mono" rows={2} value={query} onChange={(e) => setQuery(e.target.value)} spellCheck={false} />
          </label>
          {method === "POST" && (
            <label className="field wide">
              <span className="field-label">Body (JSON)</span>
              <textarea className="mono" rows={3} value={body} onChange={(e) => setBody(e.target.value)} spellCheck={false} />
            </label>
          )}
          <label className="field wide">
            <span className="field-label">Result path (e.g. data.items)</span>
            <input value={resultPath} onChange={(e) => setResultPath(e.target.value)} />
          </label>
          <p className="muted small">Use {"{{params.name}}"} to insert report parameters.</p>
        </>
      )}
      {kind === "sql" && (
        <>
          <label className="field wide">
            <span className="field-label">Connection id (configured on the server)</span>
            <input value={connectionId} onChange={(e) => setConnectionId(e.target.value)} />
          </label>
          <label className="field wide">
            <span className="field-label">SQL (parameterized: $1 for Postgres, ? for MySQL)</span>
            <textarea className="mono" rows={5} value={sql} onChange={(e) => setSql(e.target.value)} spellCheck={false} />
          </label>
          <label className="field wide">
            <span className="field-label">Parameters (JSON array, e.g. ["{"{{params.id}}"}"])</span>
            <textarea className="mono" rows={2} value={params} onChange={(e) => setParams(e.target.value)} spellCheck={false} />
          </label>
        </>
      )}

      {error && <div className="field-error" role="alert" data-testid="dataset-error">{error}</div>}
      {preview !== undefined && <ResultPreview value={preview} />}
      <div className="dialog-actions">
        <button className="btn" data-testid="dataset-test" onClick={test} disabled={busy}>
          {busy ? "Testing..." : kind === "inline" ? "Preview" : "Test request"}
        </button>
        <span className="spacer" />
        <button className="btn" onClick={() => useStore.getState().set({ dialog: null })}>
          Cancel
        </button>
        <button className="btn primary" data-testid="dataset-save" onClick={save}>
          Save dataset
        </button>
      </div>
    </div>
  );
}
