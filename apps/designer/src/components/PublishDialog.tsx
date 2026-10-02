import React, { useEffect, useRef, useState } from "react";
import { runEngine, withSampleData, type Problem } from "../engine";
import { api } from "../lib/api";
import { arrayRefs } from "../lib/fields";
import { makeScenarioSample, type StressOptions } from "../lib/test-scenarios";
import { useStore } from "../store";

type Check = { label: string; pages?: number; problems: Problem[] };
type Phase = "idle" | "running" | "blocked" | "ready";
const COUNTS = [0, 1, 31, 32, 100];
const STRESS: StressOptions = { longText: true, nulls: true, multilingual: true };

const signature = () => {
  const { doc, sample, parameters, target } = useStore.getState();
  return JSON.stringify({ doc, sample, parameters, target });
};

/** Review gate for a saved, immutable version. All checks use a frozen draft snapshot. */
export function PublishDialogBody() {
  const { doc, sample, parameters, target } = useStore();
  const [phase, setPhase] = useState<Phase>("idle");
  const [checks, setChecks] = useState<Check[]>([]);
  const [progress, setProgress] = useState("");
  const [checkedSignature, setCheckedSignature] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfPages, setPdfPages] = useState(0);
  const [previewReviewed, setPreviewReviewed] = useState(false);
  const [warningsReviewed, setWarningsReviewed] = useState(false);
  const [notes, setNotes] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const urlRef = useRef("");
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const currentSignature = JSON.stringify({ doc, sample, parameters, target });
  const stale = Boolean(checkedSignature && checkedSignature !== currentSignature);
  const errors = checks.flatMap((check) => check.problems.filter((problem) => problem.severity === "error"));
  const warnings = checks.flatMap((check) => check.problems.filter((problem) => problem.severity === "warning"));

  const runChecks = async () => {
    const snapshot = useStore.getState();
    const report = snapshot.doc;
    const data = snapshot.sample;
    const params = snapshot.parameters;
    const originalSignature = signature();
    setPhase("running");
    setError("");
    setChecks([]);
    setCheckedSignature("");
    setPreviewReviewed(false);
    setWarningsReviewed(false);
    setPdfPages(0);
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = "";
    setPdfUrl("");
    const completed: Check[] = [];
    const add = (check: Check) => { completed.push(check); if (alive.current) setChecks([...completed]); };
    try {
      setProgress("Validating report definition…");
      const validation = await api.validate(report);
      add({ label: "Report validation", problems: validation.issues.map((issue) => ({ severity: issue.severity === "warning" ? "warning" : "error", code: issue.code, message: issue.message, path: issue.path })) });
      if (!validation.valid) {
        setPhase("blocked");
        setProgress("");
        return;
      }
      const missingSamples = (report.datasets ?? []).filter((dataset: any) => dataset.source !== "inline" && !(dataset.id in data));
      if (missingSamples.length) {
        add({ label: "Sample data", problems: missingSamples.map((dataset: any) => ({ severity: "error", code: "SAMPLE_REQUIRED", message: `Load sample data for ${dataset.id} before publishing.` })) });
        setPhase("blocked");
        setProgress("");
        return;
      }
      const baseline = await runEngine(report, data, params, { target: snapshot.target, capabilities: snapshot.capabilities, sampleRows: 0 });
      add({ label: "Current sample", pages: baseline.paginated?.pages.length, problems: baseline.problems });
      const refs = arrayRefs(report, data);
      for (const ref of refs) {
        for (const count of COUNTS) {
          setProgress(`Testing ${ref}: ${count} records…`);
          const label = `${ref} · ${count} records`;
          try {
            const scenario = makeScenarioSample(report, data, ref, count);
            const result = await runEngine(report, scenario, params, { target: snapshot.target, capabilities: snapshot.capabilities, sampleRows: 0 });
            add({ label, pages: result.paginated?.pages.length, problems: result.problems });
          } catch (cause) {
            add({ label, problems: [{ severity: "error", code: "SCENARIO_FAILED", message: cause instanceof Error ? cause.message : String(cause) }] });
          }
        }
        setProgress(`Testing ${ref}: long, null and multilingual values…`);
        try {
          const scenario = makeScenarioSample(report, data, ref, 32, STRESS);
          const result = await runEngine(report, scenario, params, { target: snapshot.target, capabilities: snapshot.capabilities, sampleRows: 0 });
          add({ label: `${ref} · stress values`, pages: result.paginated?.pages.length, problems: result.problems });
        } catch (cause) {
          add({ label: `${ref} · stress values`, problems: [{ severity: "error", code: "SCENARIO_FAILED", message: cause instanceof Error ? cause.message : String(cause) }] });
        }
      }
      setProgress("Rendering PDF preview…");
      const rendered = await api.render(withSampleData(report, data), "pdf", params);
      const pages = ((await rendered.blob.text()).match(/\/Type \/Page(?![s\w])/g) ?? []).length;
      if (pages !== baseline.paginated?.pages.length) add({ label: "PDF preview", problems: [{ severity: "error", code: "PAGINATION_MISMATCH", message: `Designer shows ${baseline.paginated?.pages.length ?? 0} pages; PDF has ${pages}.` }] });
      if (rendered.warningCount) add({ label: "PDF preview", problems: [{ severity: "warning", code: "PDF_WARNINGS", message: `PDF rendering reported ${rendered.warningCount} warning${rendered.warningCount === 1 ? "" : "s"}.` }] });
      const url = URL.createObjectURL(rendered.blob);
      if (!alive.current) { URL.revokeObjectURL(url); return; }
      urlRef.current = url;
      setPdfUrl(url);
      setPdfPages(pages);
      setCheckedSignature(originalSignature);
      setPhase(completed.some((check) => check.problems.some((problem) => problem.severity === "error")) ? "blocked" : "ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPhase("blocked");
    } finally {
      if (alive.current) setProgress("");
    }
  };

  const publish = async () => {
    if (signature() !== checkedSignature) { setError("The report changed after the checks. Run them again."); return; }
    setPublishing(true);
    setError("");
    const success = await useStore.getState().publish(notes.trim());
    if (alive.current) {
      setPublishing(false);
      if (success) useStore.getState().set({ dialog: null });
      else setError("Publishing failed. The report remains a draft.");
    }
  };

  return <div className="publish-review" data-testid="publish-review">
    <header><h2>Review before publishing</h2><p>Validate the report, test boundary data, inspect the real PDF, then publish an immutable version.</p></header>
    <div className="publish-review-toolbar"><button className="btn primary" data-testid="publish-run-checks" disabled={phase === "running" || publishing} onClick={runChecks}>{phase === "running" ? "Running checks…" : phase === "idle" ? "Run checks" : "Run checks again"}</button><span role="status">{progress || (stale ? "Report changed — run checks again" : phase === "ready" ? "Ready for review" : phase === "blocked" ? "Fix errors and run checks again" : "")}</span></div>
    {error && <p className="field-error" role="alert">{error}</p>}
    {checks.length > 0 && <section aria-label="Validation and test results" className="publish-checks">
      <div className="publish-checks-title"><strong>{checks.length} checks</strong><span>{errors.length} errors · {warnings.length} warnings</span></div>
      <div className="publish-check-list">{checks.map((check, index) => <details key={`${check.label}-${index}`} data-testid="publish-check"><summary><span className={`test-lab-status ${check.problems.some((p) => p.severity === "error") ? "fail" : check.problems.some((p) => p.severity === "warning") ? "warning" : "pass"}`}>{check.problems.some((p) => p.severity === "error") ? "Fail" : check.problems.some((p) => p.severity === "warning") ? "Warning" : "Pass"}</span><span>{check.label}</span><span className="muted">{check.pages ? `${check.pages} ${check.pages === 1 ? "page" : "pages"}` : ""}</span></summary>{check.problems.length > 0 && <div className="test-lab-issues">{check.problems.slice(0, 8).map((problem, i) => <p key={i}>{problem.severity}: {problem.message}</p>)}{check.problems.length > 8 && <p>{check.problems.length - 8} more issues.</p>}</div>}</details>)}</div>
    </section>}
    {pdfUrl && <section className="publish-preview"><div className="publish-preview-head"><strong>PDF preview · {pdfPages} page{pdfPages === 1 ? "" : "s"}</strong><span><a href={pdfUrl} target="_blank" rel="noreferrer">Open PDF</a> · <a href={pdfUrl} download={`${doc.id || "report"}-review.pdf`}>Download</a></span></div><iframe title="PDF to review before publishing" src={pdfUrl} /><label><input type="checkbox" data-testid="publish-preview-reviewed" checked={previewReviewed} onChange={(event) => setPreviewReviewed(event.target.checked)} /> I reviewed the PDF content and page breaks</label></section>}
    {warnings.length > 0 && <label className="publish-warning-review"><input type="checkbox" data-testid="publish-warnings-reviewed" checked={warningsReviewed} onChange={(event) => setWarningsReviewed(event.target.checked)} /> I reviewed {warnings.length} warning{warnings.length === 1 ? "" : "s"}</label>}
    <label className="field"><span className="field-label">Version notes</span><textarea data-testid="publish-notes" value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} placeholder="What changed in this version?" /></label>
    <div className="dialog-actions"><button className="btn" onClick={() => useStore.getState().set({ dialog: null })}>Cancel</button><button className="btn publish" data-testid="publish-confirm" disabled={phase !== "ready" || stale || !pdfUrl || !previewReviewed || (warnings.length > 0 && !warningsReviewed) || !notes.trim() || publishing} onClick={publish}>{publishing ? "Publishing…" : "Publish version"}</button></div>
  </div>;
}
