import { useEffect, useState } from "react";
import { useStore } from "../store";
import type { Comp } from "../model/ops";
import { api } from "../lib/api";
import { detachFragmentUse, fragmentUses, pinToVersion, setFragmentMode } from "../lib/blocks";

/** Where a placed library block comes from, and its linked / pinned / detach actions. */
export function FragmentProps({ comp }: { comp: Comp }) {
  const doc = useStore((s) => s.doc);
  const blocks = useStore((s) => s.blocks);
  const fragment = (doc.fragments ?? []).find((f: any) => f.id === comp.ref);
  const latest = fragment?.source ? blocks.find((b) => b.id === fragment.source.block) : undefined;
  const uses = fragment ? fragmentUses(doc, fragment.id) : 0;
  const [history, setHistory] = useState<{ version: number; notes?: string; createdAt: string }[]>([]);
  useEffect(() => {
    if (!fragment?.source) return;
    let active = true;
    api.listBlockVersions(fragment.source.block).then((versions) => { if (active) setHistory(versions); }).catch(() => setHistory([]));
    return () => { active = false; };
  }, [fragment?.source?.block, latest?.version]);

  if (!fragment) return <p className="field-error small" role="alert">This block refers to “{comp.ref}”, which is not in the report.</p>;
  const s = useStore.getState;
  const detach = () => {
    const { doc: next, ids } = detachFragmentUse(s().doc, comp.id);
    s().setDoc(next);
    s().set({ selection: ids });
  };
  if (!fragment.source) {
    return <div className="fragment-props" data-testid="fragment-props">
      <p className="muted small">Reusable block “{fragment.name ?? fragment.id}” from this report, used {uses} time{uses === 1 ? "" : "s"}.</p>
      <button className="btn" data-testid="fragment-detach" onClick={detach}>Detach this copy</button>
    </div>;
  }
  const { mode, version } = fragment.source;
  const newer = latest && latest.version > version ? latest : undefined;
  return <div className="fragment-props" data-testid="fragment-props">
    <p data-testid="fragment-status">
      <strong>{fragment.name ?? fragment.source.block}</strong>{" "}
      {mode === "linked" ? `· linked, version ${version}` : `· pinned to version ${version}`}
      {!latest && <span className="field-error small"> · not in the library (the saved copy is used)</span>}
      {newer && mode === "pinned" && <span className="muted small"> · version {newer.version} available</span>}
    </p>
    <p className="muted small">{mode === "linked" ? "Follows new versions of the block automatically, in the designer and when reports render." : "Stays on this version until you update it."} Applies to {uses} use{uses === 1 ? "" : "s"} in this report.</p>
    <div className="btn-row">
      {mode === "pinned" && newer && <button className="btn" data-testid="fragment-update" onClick={() => s().setDoc(pinToVersion(s().doc, fragment.id, newer))}>Update to version {newer.version}</button>}
      {mode === "pinned" ? <button className="btn" data-testid="fragment-link" onClick={() => s().setDoc(setFragmentMode(s().doc, fragment.id, "linked", latest))}>Follow updates</button>
        : <button className="btn" data-testid="fragment-pin" onClick={() => s().setDoc(setFragmentMode(s().doc, fragment.id, "pinned"))}>Pin to version {version}</button>}
      <button className="btn" data-testid="fragment-detach" onClick={detach}>Detach to edit</button>
    </div>
    {history.length > 0 && <details className="fragment-history">
      <summary>Version history</summary>
      <ol data-testid="fragment-history">{history.map((entry) => <li key={entry.version}>v{entry.version}{entry.version === version ? " (in this report)" : ""} · {new Date(entry.createdAt).toLocaleDateString()}{entry.notes ? ` · ${entry.notes}` : ""}</li>)}</ol>
    </details>}
  </div>;
}
