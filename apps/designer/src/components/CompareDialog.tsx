import React, { useEffect, useState } from "react";
import { useStore } from "../store";
import { api, type VersionRecord } from "../lib/api";
import { diffDocs } from "../lib/diff";

export function CompareDialogBody() {
  const { meta, doc } = useStore();
  const set = useStore((s) => s.set);
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [error, setError] = useState("");
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | "current">("current");
  useEffect(() => {
    if (!meta.id) return;
    api
      .listVersions(meta.id)
      .then((v) => {
        setVersions(v);
        if (v.length > 1) setFrom(v[1]!.version);
        else if (v.length) setFrom(v[0]!.version);
      })
      .catch((e) => setError((e as Error).message));
  }, [meta.id]);
  const a = versions.find((v) => v.version === from)?.definition as any;
  const b = to === "current" ? doc : (versions.find((v) => v.version === to)?.definition as any);
  const changes = a && b ? diffDocs(a, b) : [];
  const [side, setSide] = useState(false);
  return (
    <>
      <h2>Compare versions</h2>
      {error && <div className="field-error" role="alert">{error}</div>}
      <div className="compare-pick">
        <label>
          From
          <select data-testid="compare-from" value={from ?? ""} onChange={(e) => setFrom(Number(e.target.value))}>
            {versions.map((v) => (
              <option key={v.version} value={v.version}>v{v.version} · {v.status} · {new Date(v.createdAt).toLocaleString()}</option>
            ))}
          </select>
        </label>
        <label>
          To
          <select data-testid="compare-to" value={to} onChange={(e) => setTo(e.target.value === "current" ? "current" : Number(e.target.value))}>
            <option value="current">Current editor</option>
            {versions.map((v) => (
              <option key={v.version} value={v.version}>v{v.version}</option>
            ))}
          </select>
        </label>
        <button className="btn small" onClick={() => setSide(!side)}>{side ? "Change list" : "Side-by-side JSON"}</button>
      </div>
      {!side && (
        <ul className="change-list" data-testid="compare-changes">
          {changes.length === 0 && <li className="muted">No differences.</li>}
          {changes.map((c, i) => (
            <li key={i} className={c.kind}>
              <span className="chip">{c.kind}</span> {c.detail}
            </li>
          ))}
        </ul>
      )}
      {side && (
        <div className="side-by-side">
          <pre>{JSON.stringify(a, null, 2)}</pre>
          <pre>{JSON.stringify(b, null, 2)}</pre>
        </div>
      )}
      <div className="dialog-actions">
        <span className="spacer" />
        <button className="btn" onClick={() => set({ dialog: null })}>Close</button>
      </div>
    </>
  );
}
