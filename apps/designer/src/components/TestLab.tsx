import React, { useMemo, useState } from "react";
import { runEngine, withSampleData, type Problem } from "../engine";
import { api } from "../lib/api";
import { arrayRefs } from "../lib/fields";
import { makeScenarioSample, type StressOptions } from "../lib/test-scenarios";
import { useStore } from "../store";

const COUNTS = [0, 1, 10, 31, 32, 100, 1000];
const STRESS: { key: keyof StressOptions; label: string }[] = [
  { key: "longText", label: "Long text" },
  { key: "nulls", label: "Null values" },
  { key: "negativeNumbers", label: "Negative numbers" },
  { key: "multilingual", label: "Telugu, Hindi, Kannada, Tamil and Arabic" },
  { key: "manyGroups", label: "Many groups" },
];

interface Result {
  count: number;
  status: "pass" | "warning" | "fail";
  pages: number;
  pdfPages?: number;
  problems: Problem[];
  error?: string;
}

/** Tests disposable sample scenarios through the designer's real core and pagination pipeline. */
export function TestLab() {
  const { doc, sample, parameters, target, capabilities } = useStore();
  const refs = useMemo(() => arrayRefs(doc, sample), [doc, sample]);
  const [chosenRef, setChosenRef] = useState("");
  const ref = refs.includes(chosenRef) ? chosenRef : refs[0] ?? "";
  const [counts, setCounts] = useState<number[]>([0, 1, 31, 32, 100]);
  const [stress, setStress] = useState<StressOptions>({});
  const [comparePdf, setComparePdf] = useState(true);
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");

  const run = async () => {
    if (!ref || !counts.length || running) return;
    setRunning(true);
    setResults([]);
    const finished: Result[] = [];
    for (const count of [...counts].sort((a, b) => a - b)) {
      setProgress(`Checking ${count.toLocaleString()} records…`);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      try {
        const scenario = makeScenarioSample(doc, sample, ref, count, stress);
        const result = await runEngine(doc, scenario, parameters, { target, capabilities, sampleRows: 0 });
        const problems = [...result.problems];
        let pdfPages: number | undefined;
        if (comparePdf && result.paginated) {
          try {
            const rendered = await api.render(withSampleData(doc, scenario), "pdf", parameters);
            pdfPages = ((await rendered.blob.text()).match(/\/Type \/Page(?![s\w])/g) ?? []).length;
            if (pdfPages !== result.paginated.pages.length) problems.push({ severity: "warning", code: "PAGINATION_MISMATCH", message: `Designer shows ${result.paginated.pages.length} pages; the generated PDF has ${pdfPages}. Inspect the PDF before publishing.` });
            if (rendered.warningCount) problems.push({ severity: "warning", code: "PDF_WARNINGS", message: `PDF rendering reported ${rendered.warningCount} warning${rendered.warningCount === 1 ? "" : "s"}.` });
          } catch (error) {
            problems.push({ severity: "error", code: "PDF_RENDER_FAILED", message: `PDF render failed: ${error instanceof Error ? error.message : String(error)}` });
          }
        }
        const severity = problems.some((problem) => problem.severity === "error") || !result.paginated ? "fail" : problems.some((problem) => problem.severity === "warning") ? "warning" : "pass";
        finished.push({ count, status: severity, pages: result.paginated?.pages.length ?? 0, pdfPages, problems });
      } catch (error) {
        finished.push({ count, status: "fail", pages: 0, problems: [], error: error instanceof Error ? error.message : String(error) });
      }
      setResults([...finished]);
    }
    setProgress("");
    setRunning(false);
  };

  return <div className="test-lab" data-testid="test-lab">
    <header className="test-lab-head"><div><h2>Test data</h2><p>Try record counts and difficult values without changing the report or its saved sample. The canvas keeps showing your current sample. Results check layout diagnostics and page counts; inspect PDF content separately.</p></div><button className="btn primary" data-testid="run-stress-tests" disabled={!ref || !counts.length || running} onClick={run}>{running ? "Running…" : "Run tests"}</button></header>
    <div className="test-lab-controls">
      <label className="field"><span className="field-label">Array to test</span><select aria-label="Array to test" value={ref} onChange={(event) => { setChosenRef(event.target.value); setResults([]); }} disabled={!refs.length || running}>{refs.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      {!refs.length && <p className="muted">Add an array dataset or define one in its fields to run row-count tests.</p>}
      <fieldset disabled={running}><legend>Record counts</legend><div className="test-lab-counts">{COUNTS.map((count) => <label key={count}><input type="checkbox" checked={counts.includes(count)} onChange={(event) => { setCounts(event.target.checked ? [...counts, count] : counts.filter((value) => value !== count)); setResults([]); }} />{count.toLocaleString()}</label>)}</div></fieldset>
      <fieldset disabled={running}><legend>Stress values</legend><div className="test-lab-stress">{STRESS.map(({ key, label }) => <label key={key}><input type="checkbox" checked={Boolean(stress[key])} onChange={(event) => { setStress({ ...stress, [key]: event.target.checked }); setResults([]); }} />{label}</label>)}</div></fieldset>
      <label className="test-lab-pdf"><input type="checkbox" checked={comparePdf} disabled={running} onChange={(event) => { setComparePdf(event.target.checked); setResults([]); }} />Compare page counts with the actual PDF</label>
    </div>
    <section className="test-lab-results" aria-label="Test results"><h3>Results</h3>
      {progress && <p role="status" data-testid="stress-progress">{progress}</p>}
      {!results.length && !running && <p className="muted">Choose scenarios and run them to see pagination, errors and warnings.</p>}
      {results.map((result) => <details key={result.count} className="test-lab-result" data-testid={`stress-result-${result.count}`}>
        <summary><span className={`test-lab-status ${result.status}`}>{result.status}</span><strong>{result.count.toLocaleString()} records</strong><span>{result.pages ? `${result.pages} page${result.pages === 1 ? "" : "s"}` : "No pages"}{result.pdfPages !== undefined ? ` · PDF ${result.pdfPages}` : ""}</span><span className="muted">{result.problems.filter((problem) => problem.severity !== "suggestion").length} issues</span></summary>
        <div className="test-lab-issues">{result.error && <p role="alert">{result.error}</p>}{result.problems.length ? result.problems.slice(0, 12).map((problem, index) => <p key={`${problem.code}-${index}`}><b>{problem.severity}</b> · {problem.message}</p>) : !result.error && <p>No engine problems for this scenario.</p>}{result.problems.length > 12 && <p>{result.problems.length - 12} more issues.</p>}</div>
      </details>)}
    </section>
  </div>;
}
