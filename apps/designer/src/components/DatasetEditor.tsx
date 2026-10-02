import React, { useState } from "react";
import { useStore } from "../store";
import { api } from "../lib/api";
import { parseCsv } from "../lib/csv";
import { fieldDefinitions, inferFields } from "../lib/fields";
import { SchemaTree } from "./DataMode";
import { datasetShapeSchema, type DatasetShape } from "@reporting/schema";

type Kind = "inline" | "rest" | "sql" | "csv";

function ResultPreview({ value }: { value: unknown }) {
  const [view, setView] = useState<"table" | "json" | "schema">("table");
  const rows = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  const cols = rows.length ? Object.keys(rows[0] as object).slice(0, 8) : [];
  const fields = inferFields(value);
  const count = (k: string) => fields.filter((f) => f.kind === k).length;
  const hints: string[] = [];
  if (Array.isArray(value)) hints.push(`${value.length} row${value.length === 1 ? "" : "s"} - ideal for a table`);
  const nested = fields.filter((f) => f.kind === "array");
  if (nested.length) hints.push(`Nested lists found: ${nested.map((f) => f.path).join(", ")} - drag one onto the page to make a table`);
  if (count("date")) hints.push(`${count("date")} date field${count("date") > 1 ? "s" : ""} - you can format them as dates`);
  if (!rows.length) return <p className="muted">No rows returned.</p>;
  return (
    <div className="result-preview" data-testid="dataset-result">
      <div className="seg small" role="tablist" aria-label="Response view">
        {(["table", "json", "schema"] as const).map((v) => (
          <button key={v} role="tab" aria-selected={view === v} className={view === v ? "active" : ""} data-testid={`result-view-${v}`} onClick={() => setView(v)}>
            {v === "table" ? "Table" : v === "json" ? "Raw JSON" : "Schema"}
          </button>
        ))}
      </div>
      {hints.length > 0 && (
        <ul className="insights" data-testid="dataset-insights">
          {hints.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}
      {view === "table" && (
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
      )}
      {view === "json" && <pre className="csv">{JSON.stringify(Array.isArray(value) ? value.slice(0, 20) : value, null, 2)}</pre>}
      {view === "schema" && <SchemaTree nodes={fields} />}
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
  const [csv, setCsv] = useState("");
  const secrets = useStore((st) => st.capabilities?.secrets ?? []);
  const sqlIds = useStore((st) => st.capabilities?.sqlConnections ?? []);
  const [preview, setPreview] = useState<unknown>(sample[id]);
  const previewFields = inferFields(preview);
  const [shape, setShape] = useState<DatasetShape["kind"]>(existing?.schema?.kind ?? (Array.isArray(sample[id] ?? q.data) || !existing || existing.source !== "inline" ? "array" : "object"));
  const [fields, setFields] = useState<DatasetShape["fields"]>(existing?.schema?.fields ?? []);
  const [hasSchema, setHasSchema] = useState(Boolean(existing?.schema));
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
    const metadata = hasSchema ? { schema: { kind: shape, fields } } : {};
    if (kind === "inline") return { id, source: "inline", query: { data: parseJson(data, "Data") }, ...metadata };
    if (kind === "csv") {
      const rows = parseCsv(csv);
      if (rows.length === 0) throw new Error("The CSV has no data rows. The first line must be the column names.");
      return { id, source: "inline", query: { data: rows }, ...metadata };
    }
    if (kind === "rest") {
      return { id, source: "rest", query: { url, method, headers: parseJson(headers, "Headers"), query: parseJson(query, "Query parameters"), body: parseJson(body, "Body"), resultPath: resultPath || undefined }, ...metadata };
    }
    return { id, source: "sql", query: { connectionId, sql, params: parseJson(params, "Parameters") }, ...metadata };
  }

  async function test() {
    setError("");
    setBusy(true);
    try {
      const def = definition();
      if (kind === "inline" || kind === "csv") {
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
      if (hasSchema) {
        const result = datasetShapeSchema.safeParse({ kind: shape, fields });
        if (!result.success) throw new Error(result.error.issues.map((issue) => issue.message).join(" "));
        if (kind === "inline") {
          const actual = (def.query as { data?: unknown }).data;
          if (actual !== undefined && (actual === null || typeof actual !== "object" || Array.isArray(actual) !== (shape === "array"))) {
            throw new Error(`The JSON data is ${Array.isArray(actual) ? "a list" : "an object or value"}, but the declared shape is ${shape === "array" ? "a list" : "an object"}.`);
          }
        }
      }
      const s = useStore.getState();
      const list = existing ? (doc.datasets as any[]).map((d) => (d.id === editingDataset ? def : d)) : [...(doc.datasets ?? []), def];
      s.setDoc({ ...doc, datasets: list });
      if (kind !== "inline" && preview !== undefined) s.setSample(id, preview);
      else if (kind === "inline" || kind === "csv") {
        // inline data lives in the definition; drop any stale sample override
        const { [id]: _drop, ...rest } = s.sample;
        void _drop;
        s.set({ sample: rest });
        s.refresh();
      }
      s.set({ dialog: null, editingDataset: id });
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
        {(["inline", "rest", "sql", "csv"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? "active" : ""} data-testid={`dataset-kind-${k}`} onClick={() => { setKind(k); if (!hasSchema && k !== "inline") setShape("array"); }}>
            {k === "inline" ? "JSON" : k === "rest" ? "REST API" : k === "sql" ? "Database (SQL)" : "CSV file"}
          </button>
        ))}
      </div>

      {kind === "inline" && (
        <label className="field wide">
          <span className="field-label">JSON (object or array)</span>
          <textarea className="mono" data-testid="dataset-json" rows={10} value={data} onChange={(e) => {
            setData(e.target.value);
            if (!hasSchema) {
              try {
                const parsed = JSON.parse(e.target.value);
                if (parsed && typeof parsed === "object") setShape(Array.isArray(parsed) ? "array" : "object");
              } catch { /* wait for valid JSON */ }
            }
          }} spellCheck={false} />
        </label>
      )}
      {kind === "csv" && (
        <>
          <label className="field wide">
            <span className="field-label">Upload a CSV (or paste below). The first row becomes the field names.</span>
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              data-testid="dataset-csv-file"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setCsv(await f.text());
              }}
            />
          </label>
          <textarea className="mono" data-testid="dataset-csv" rows={8} value={csv} onChange={(e) => setCsv(e.target.value)} spellCheck={false} placeholder={"name,amount\nConsultation,600"} aria-label="CSV text" />
        </>
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
            <span className="field-label">Headers (JSON) - for API keys use {"{{secrets.NAME}}"}; the real value stays on the server</span>
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
          {secrets.length > 0 && (
            <div className="secret-chips" data-testid="secret-chips">
              <span className="muted small">Server secrets:</span>
              {secrets.map((n) => (
                <button key={n} className="mini" onClick={() => setHeaders(headers.trim() ? headers.replace(/}\s*$/, `, "Authorization": "Bearer {{secrets.${n}}}" }`) : `{ "Authorization": "Bearer {{secrets.${n}}}" }`)}>
                  {n}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {kind === "sql" && (
        <>
          <label className="field wide">
            <span className="field-label">Connection (PostgreSQL or MySQL, configured on the server - credentials never enter the report)</span>
            <input list="sql-connections" data-testid="dataset-connection" value={connectionId} onChange={(e) => setConnectionId(e.target.value)} placeholder={sqlIds.length ? sqlIds[0] : "set REPORT_SQL_<NAME> on the server"} />
            <datalist id="sql-connections">{sqlIds.map((i) => <option key={i} value={i} />)}</datalist>
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

      <section className="dataset-schema-editor" data-testid="dataset-schema-editor" aria-label="Dataset fields">
        <div className="row-title">
          <div><strong>Fields</strong><p className="muted small">Define fields when preview data is empty or unavailable. These paths are saved with the report.</p></div>
          <button className="mini" data-testid="schema-add-field" onClick={() => { setHasSchema(true); setFields([...fields, { path: "", kind: "string" }]); }}>+ Add field</button>
        </div>
        <label className="dataset-shape"><span>Data shape</span><select aria-label="Data shape" data-testid="dataset-shape" value={shape} onChange={(event) => { setShape(event.target.value as DatasetShape["kind"]); setHasSchema(true); }}><option value="array">List of records</option><option value="object">Single object</option></select></label>
        {fields.map((field, index) => <div className="dataset-schema-row" key={index} data-testid={`schema-field-${index}`}>
          <input aria-label={`Field ${index + 1} path`} placeholder="patient.name" value={field.path} onChange={(event) => { setHasSchema(true); setFields(fields.map((item, i) => i === index ? { ...item, path: event.target.value } : item)); }} />
          <select aria-label={`Field ${index + 1} type`} value={field.kind} onChange={(event) => { setHasSchema(true); setFields(fields.map((item, i) => i === index ? { ...item, kind: event.target.value as DatasetShape["fields"][number]["kind"] } : item)); }}>
            {(["string", "number", "boolean", "date", "object", "array"] as const).map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <button className="mini danger" aria-label={`Remove field ${index + 1}`} onClick={() => { setHasSchema(true); setFields(fields.filter((_, i) => i !== index)); }}>×</button>
        </div>)}
        {preview !== undefined && <button className="mini" data-testid="schema-use-preview" disabled={previewFields.length === 0} title={previewFields.length === 0 ? "The preview has no fields to copy" : undefined} onClick={() => { setShape(Array.isArray(preview) ? "array" : "object"); setFields(fieldDefinitions(previewFields)); setHasSchema(true); }}>Use fields from preview</button>}
      </section>

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
