import { useEffect, useMemo, useRef, useState } from "react";
import type { JrxmlFolderResult } from "@reporting/jrxml-import";
import { api } from "../lib/api";
import { useStore } from "../store";
import "./JrxmlFolderImport.css";

type Phase = "converting" | "linking" | "saving";
type Progress = { phase: Phase; completed: number; total: number; startedAt: number; current?: string; failures: number };
type WorkerMessage =
  | { type: "progress"; processed: number; total: number; current: string; failures: number }
  | { type: "linking"; total: number }
  | { type: "done"; result: JrxmlFolderResult }
  | { type: "error"; message: string };

function remainingTime(progress: Progress, now: number): string {
  if (progress.phase === "linking" || progress.completed >= progress.total) return "Finishing…";
  const elapsed = now - progress.startedAt;
  if (progress.completed < 3 || elapsed < 1000) return "Estimating time…";
  const seconds = Math.ceil((elapsed / progress.completed) * (progress.total - progress.completed) / 1000);
  return seconds < 60 ? `About ${seconds} sec left` : `About ${Math.ceil(seconds / 60)} min left`;
}

export function JrxmlFolderImport({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) {
  const close = useStore((state) => state.set);
  const picker = useRef<HTMLInputElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const stopSaving = useRef(false);
  const [bundle, setBundle] = useState<JrxmlFolderResult | null>(null);
  const [converting, setConverting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [clock, setClock] = useState(Date.now());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [ignored, setIgnored] = useState(0);
  const [search, setSearch] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [page, setPage] = useState(0);
  const progressActive = progress !== null;

  useEffect(() => { onBusyChange(converting || saving); }, [converting, saving, onBusyChange]);
  useEffect(() => {
    if (!progressActive) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [progressActive]);
  useEffect(() => () => { workerRef.current?.terminate(); stopSaving.current = true; }, []);

  const startConversion = (selected: File[]) => {
    const files = selected.filter((file) => /\.jrxml$/i.test(file.name));
    setIgnored(selected.length - files.length);
    setError(""); setNotice(""); setBundle(null); setSaved(new Set()); setSaveErrors({}); setSearch(""); setAttentionOnly(false); setPage(0);
    if (!files.length) { setError("Choose a folder containing .jrxml files."); return; }
    workerRef.current?.terminate();
    try {
      const worker = new Worker(new URL("../workers/jrxml-folder.worker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      const startedAt = Date.now();
      setConverting(true);
      setProgress({ phase: "converting", completed: 0, total: files.length, startedAt, failures: 0 });
      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        if (workerRef.current !== worker) return;
        const message = event.data;
        if (message.type === "progress") {
          setProgress({ phase: "converting", completed: message.processed, total: message.total, current: message.current, startedAt, failures: message.failures });
        } else if (message.type === "linking") {
          setProgress({ phase: "linking", completed: message.total, total: message.total, startedAt, failures: 0 });
        } else {
          worker.terminate(); workerRef.current = null; setConverting(false); setProgress(null);
          if (message.type === "done") setBundle(message.result);
          else setError(message.message);
        }
      };
      worker.onerror = (event) => {
        if (workerRef.current !== worker) return;
        worker.terminate(); workerRef.current = null; setConverting(false); setProgress(null);
        setError(event.message || "Folder conversion stopped unexpectedly.");
      };
      worker.postMessage({ files: files.map((file) => ({ file, path: file.webkitRelativePath || file.name })), idPrefix: `jrxml-${crypto.randomUUID()}` });
    } catch (cause) {
      setConverting(false); setProgress(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const cancelConversion = () => {
    workerRef.current?.terminate(); workerRef.current = null;
    setConverting(false); setProgress(null); setNotice("Conversion cancelled. No drafts were saved.");
  };

  const saveDrafts = async () => {
    if (!bundle || saving) return;
    stopSaving.current = false; setStopRequested(false); setSaving(true); setError(""); setNotice("");
    const done = new Set(saved);
    const errors = { ...saveErrors };
    const pending = bundle.entries.filter((entry) => entry.report && !done.has(entry.report.id));
    const startedAt = Date.now();
    setProgress({ phase: "saving", completed: 0, total: pending.length, startedAt, failures: 0 });
    let attempted = 0;
    try {
      for (let index = 0; index < pending.length && !stopSaving.current; index += 4) {
        const batch = pending.slice(index, index + 4);
        await Promise.all(batch.map(async (entry) => {
          try {
            await api.createTemplate(entry.report!.id, entry.report!.name, entry.report);
            done.add(entry.report!.id);
            delete errors[entry.path];
          } catch (cause) { errors[entry.path] = cause instanceof Error ? cause.message : String(cause); }
        }));
        attempted += batch.length;
        setSaved(new Set(done)); setSaveErrors({ ...errors });
        setProgress({ phase: "saving", completed: attempted, total: pending.length, startedAt, failures: Object.keys(errors).length });
      }
      if (stopSaving.current) setNotice(`Saving stopped. ${done.size} drafts are saved; you can retry the rest.`);
      else if (Object.keys(errors).length) setNotice(`${done.size} drafts saved. ${Object.keys(errors).length} failed; retry is available.`);
      else setNotice(`${done.size} drafts saved. Open any draft to review its migration issues.`);
    } finally { setSaving(false); setStopRequested(false); setProgress(null); }
  };

  const matchingEntries = useMemo(() => {
    if (!bundle) return [];
    const matches = bundle.entries.filter((entry) =>
      (!attentionOnly || !!entry.error || !!saveErrors[entry.path] || entry.summary["needs-review"] > 0 || entry.summary.unsupported > 0)
      && entry.path.toLowerCase().includes(search.toLowerCase()));
    return [
      ...matches.filter((entry) => entry.error || saveErrors[entry.path]),
      ...matches.filter((entry) => !entry.error && !saveErrors[entry.path]),
    ];
  }, [bundle, saveErrors, search, attentionOnly]);
  const pageCount = Math.max(1, Math.ceil(matchingEntries.length / 50));
  const visibleEntries = matchingEntries.slice(Math.min(page, pageCount - 1) * 50, Math.min(page, pageCount - 1) * 50 + 50);

  return <section className="jrxml-folder-import" aria-label="Import JRXML folder">
    <p className="muted small">Choose a folder to convert its .jrxml files into separate JSON drafts. Child sources are linked by name. Source SQL and Java code are never run.</p>
    <input ref={(node) => { picker.current = node; node?.setAttribute("webkitdirectory", ""); }} type="file" multiple hidden data-testid="jrxml-folder" aria-label="JRXML folder" onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; startConversion(files); }} />
    <button className="btn" onClick={() => picker.current?.click()} disabled={converting || saving}>Choose folder…</button>
    {progress && <div className="jrxml-progress" data-testid="jrxml-folder-progress">
      <div className="jrxml-progress-heading"><strong>{progress.phase === "converting" ? "Converting reports" : progress.phase === "linking" ? "Linking child reports" : "Saving drafts"}</strong><span>{progress.completed} / {progress.total}</span></div>
      <progress max={Math.max(1, progress.total)} value={progress.completed} aria-label={`${progress.phase} progress`} />
      <div className="jrxml-progress-meta"><span>{remainingTime(progress, clock)}</span><span>{progress.failures} failed</span></div>
      {progress.current && <p className="muted small" title={progress.current}>Current: {progress.current}</p>}
      {converting && <button className="btn" onClick={cancelConversion}>Cancel conversion</button>}
      {saving && <button className="btn" disabled={stopRequested} onClick={() => { stopSaving.current = true; setStopRequested(true); }}>{stopRequested ? "Stopping after current files…" : "Stop saving"}</button>}
    </div>}
    {error && <p className="err" role="alert">{error}</p>}
    {notice && <p role="status" className="muted">{notice}</p>}
    {bundle && <div data-testid="jrxml-folder-review" className="jrxml-review">
      <p><strong>{bundle.converted} drafts ready</strong> · {bundle.failed} conversion failures · {Object.keys(saveErrors).length} save failures · {ignored} other files skipped · {bundle.entries.reduce((count, entry) => count + entry.summary["needs-review"], 0)} review items</p>
      <div className="jrxml-folder-filters"><input type="search" aria-label="Find JRXML file" placeholder="Find a file…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} /><button className="btn" aria-pressed={attentionOnly} onClick={() => { setAttentionOnly(!attentionOnly); setPage(0); }}>{attentionOnly ? "Show all" : "Needs attention"}</button></div>
      <div className="jrxml-review-list">{visibleEntries.map((entry) => <div key={entry.path} className="migration-row">
        <span className={`migration-status ${entry.error ? "unsupported" : entry.summary.unsupported ? "needs-review" : "converted"}`}>{entry.error ? "failed" : saved.has(entry.report?.id ?? "") ? "saved" : "draft"}</span>
        <span>{entry.path}{entry.error ? ` — ${entry.error}` : saveErrors[entry.path] ? ` — Save failed: ${saveErrors[entry.path]}` : ""}</span>
        {entry.report && saved.has(entry.report.id) && <button className="btn" disabled={saving} onClick={() => void useStore.getState().openTemplate(entry.report!.id)}>Open</button>}
      </div>)}</div>
      <div className="jrxml-folder-pages"><span className="muted small">{matchingEntries.length ? `${Math.min(page, pageCount - 1) * 50 + 1}–${Math.min((Math.min(page, pageCount - 1) + 1) * 50, matchingEntries.length)} of ${matchingEntries.length}` : "No matching files"}</span><button className="btn" disabled={page <= 0} onClick={() => setPage(page - 1)}>Previous</button><button className="btn" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>Next</button></div>
      <div className="dialog-actions"><button className="btn primary" data-testid="save-jrxml-folder" disabled={saving || converting || !bundle.converted || saved.size === bundle.converted} onClick={() => void saveDrafts()}>{saved.size ? `Retry unsaved drafts (${bundle.converted - saved.size})` : `Save ${bundle.converted} drafts`}</button></div>
    </div>}
    <div className="dialog-actions"><button className="btn" onClick={() => close({ dialog: null })} disabled={converting || saving}>Close</button></div>
  </section>;
}
