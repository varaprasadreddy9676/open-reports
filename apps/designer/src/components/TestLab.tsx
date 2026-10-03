import React, { useMemo, useState } from "react";
import { runEngine, withSampleData, type Problem } from "../engine";
import { api } from "../lib/api";
import { arrayRefs } from "../lib/fields";
import { makeScenarioSample, type StressOptions } from "../lib/test-scenarios";
import { compareRowMarkers, markTableRows } from "../lib/pdf-row-coverage";
import { comparePageImageChecks, comparePageTextChecks, planPageImageChecks, planPageTextChecks } from "../lib/pdf-content-coverage";
import { useStore } from "../store";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

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
  rowCoverage?: { found: number; total: number; field: string; componentId?: string; bandIndex: number };
  textCoverage?: { found: number; total: number };
  imageCoverage?: { found: number; total: number };
  coverageNote?: string;
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
  const reveal = (componentId?: string, bandIndex?: number) => {
    const store = useStore.getState();
    if (componentId) store.select([componentId]);
    else if (bandIndex !== undefined) store.set({ selection: [], selectedBand: bandIndex });
    store.set({ mode: "design", leftTab: "layers", leftOpen: true, rightOpen: true });
    if (componentId) requestAnimationFrame(() => document.querySelector(`[data-cid="${CSS.escape(componentId)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };

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
        const coveragePlan = comparePdf ? markTableRows(doc, scenario, ref) : undefined;
        const result = await runEngine(doc, scenario, parameters, { target, capabilities, sampleRows: 0 });
        const problems = [...result.problems];
        let pdfPages: number | undefined;
        let rowCoverage: Result["rowCoverage"];
        let textCoverage: Result["textCoverage"];
        let imageCoverage: Result["imageCoverage"];
        let coverageNote: string | undefined;
        if (comparePdf && result.paginated) {
          try {
            const rendered = await api.render(withSampleData(doc, scenario), "pdf", parameters);
            const { getDocument, GlobalWorkerOptions, OPS } = await import("pdfjs-dist");
            GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
            const loading = getDocument({ data: new Uint8Array(await rendered.blob.arrayBuffer()) });
            try {
              const pdf = await loading.promise;
              pdfPages = pdf.numPages;
              const textChecks = result.paginationSource === "pdf" ? planPageTextChecks(result.paginated) : [];
              const imageChecks = result.paginationSource === "pdf" ? planPageImageChecks(result.paginated) : [];
              if (coveragePlan || textChecks.length || imageChecks.length) {
                const pageTexts: string[] = [];
                const imagePaintCounts: number[] = [];
                const imagePages = new Set(imageChecks.map((check) => check.page));
                const imageOps = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject]);
                for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
                  const page = await pdf.getPage(pageNumber);
                  const content = await page.getTextContent();
                  pageTexts.push(content.items.map((item) => "str" in item ? item.str : "").join(""));
                  imagePaintCounts.push(imagePages.has(pageNumber) ? (await page.getOperatorList()).fnArray.filter((operation) => imageOps.has(operation)).length : 0);
                }
                if (coveragePlan) {
                  const coverage = compareRowMarkers(pageTexts, coveragePlan);
                  rowCoverage = { found: coverage.found, total: coverage.total, field: coveragePlan.field, componentId: coveragePlan.componentId, bandIndex: coveragePlan.bandIndex };
                  if (coverage.missing.length) {
                    const rows = coverage.missing.slice(0, 5).map((marker) => Number(marker.slice(5))).join(", ");
                    problems.push({ severity: "warning", code: "PDF_ROW_COVERAGE", componentId: coveragePlan.componentId, message: `${coverage.missing.length} of ${coverage.total} marked table rows were not found in PDF text (record${coverage.missing.length === 1 ? "" : "s"} ${rows}${coverage.missing.length > 5 ? ", …" : ""}). Check conditions and inspect the table before publishing.` });
                  }
                }
                if (textChecks.length) {
                  const textCheck = comparePageTextChecks(pageTexts, textChecks);
                  if (textCheck.total) textCoverage = { found: textCheck.found, total: textCheck.total };
                  for (const missing of textCheck.missing.slice(0, 5)) {
                    problems.push({ severity: "warning", code: "PDF_TEXT_COVERAGE", componentId: missing.componentId, message: `Page ${missing.page}: expected text “${missing.text.slice(0, 70)}${missing.text.length > 70 ? "…" : ""}” was not found in the PDF.` });
                  }
                  if (textCheck.missing.length > 5) {
                    problems.push({ severity: "warning", code: "PDF_TEXT_COVERAGE", message: `${textCheck.missing.length - 5} more expected text items were not found in the PDF.` });
                  }
                }
                if (imageChecks.length) {
                  const imageCheck = comparePageImageChecks(imagePaintCounts, imageChecks);
                  imageCoverage = { found: imageCheck.found, total: imageCheck.total };
                  for (const missing of imageCheck.missing.slice(0, 5)) {
                    const actual = imagePaintCounts[missing.page - 1] ?? 0;
                    problems.push({ severity: "warning", code: "PDF_IMAGE_COVERAGE", componentId: missing.expected === 1 ? missing.componentIds[0] : undefined, message: `Page ${missing.page}: layout placed ${missing.expected} image${missing.expected === 1 ? "" : "s"}, but the PDF has ${actual} image draw${actual === 1 ? "" : "s"}. Inspect the images on this page.` });
                  }
                  if (imageCheck.missing.length > 5) problems.push({ severity: "warning", code: "PDF_IMAGE_COVERAGE", message: `${imageCheck.missing.length - 5} more pages have fewer PDF image draws than placed image elements.` });
                }
              }
              if (!coveragePlan) coverageNote = count ? "Row text check unavailable: use a visible, unfiltered table with a simple text field." : "No rows to check in this scenario.";
            } finally {
              await loading.destroy();
            }
            if (pdfPages !== result.paginated.pages.length) problems.push({ severity: "warning", code: "PAGINATION_MISMATCH", message: `Designer shows ${result.paginated.pages.length} pages; the generated PDF has ${pdfPages}. Inspect the PDF before publishing.` });
            if (rendered.warningCount) problems.push({ severity: "warning", code: "PDF_WARNINGS", message: `PDF rendering reported ${rendered.warningCount} warning${rendered.warningCount === 1 ? "" : "s"}.` });
          } catch (error) {
            problems.push({ severity: "error", code: "PDF_RENDER_FAILED", message: `PDF render failed: ${error instanceof Error ? error.message : String(error)}` });
          }
        }
        const severity = problems.some((problem) => problem.severity === "error") || !result.paginated ? "fail" : problems.some((problem) => problem.severity === "warning") ? "warning" : "pass";
        finished.push({ count, status: severity, pages: result.paginated?.pages.length ?? 0, pdfPages, rowCoverage, textCoverage, imageCoverage, coverageNote, problems });
      } catch (error) {
        finished.push({ count, status: "fail", pages: 0, problems: [], error: error instanceof Error ? error.message : String(error) });
      }
      setResults([...finished]);
    }
    setProgress("");
    setRunning(false);
  };

  return <div className="test-lab" data-testid="test-lab">
    <header className="test-lab-head"><div><h2>Test data</h2><p>Try record counts and difficult values without changing the report or its saved sample. Results compare generated PDF pages, table rows, short Latin text and image draws where possible.</p></div><button className="btn primary" data-testid="run-stress-tests" disabled={!ref || !counts.length || running} onClick={run}>{running ? "Running…" : "Run tests"}</button></header>
    <div className="test-lab-controls">
      <label className="field"><span className="field-label">Array to test</span><select aria-label="Array to test" value={ref} onChange={(event) => { setChosenRef(event.target.value); setResults([]); }} disabled={!refs.length || running}>{refs.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      {!refs.length && <p className="muted">Add an array dataset or define one in its fields to run row-count tests.</p>}
      <fieldset disabled={running}><legend>Record counts</legend><div className="test-lab-counts">{COUNTS.map((count) => <label key={count}><input type="checkbox" checked={counts.includes(count)} onChange={(event) => { setCounts(event.target.checked ? [...counts, count] : counts.filter((value) => value !== count)); setResults([]); }} />{count.toLocaleString()}</label>)}</div></fieldset>
      <fieldset disabled={running}><legend>Stress values</legend><div className="test-lab-stress">{STRESS.map(({ key, label }) => <label key={key}><input type="checkbox" checked={Boolean(stress[key])} onChange={(event) => { setStress({ ...stress, [key]: event.target.checked }); setResults([]); }} />{label}</label>)}</div></fieldset>
      <label className="test-lab-pdf"><input type="checkbox" checked={comparePdf} disabled={running} onChange={(event) => { setComparePdf(event.target.checked); setResults([]); }} />Check pages, table rows, short Latin text and image draws in the actual PDF</label>
    </div>
    <section className="test-lab-results" aria-label="Test results"><h3>Results</h3>
      {progress && <p role="status" data-testid="stress-progress">{progress}</p>}
      {!results.length && !running && <p className="muted">Choose scenarios and run them to see pagination, errors and warnings.</p>}
      {results.map((result) => <details key={result.count} className="test-lab-result" data-testid={`stress-result-${result.count}`}>
        <summary><span className={`test-lab-status ${result.status}`}>{result.status}</span><strong>{result.count.toLocaleString()} records</strong><span>{result.pages ? `${result.pages} page${result.pages === 1 ? "" : "s"}` : "No pages"}{result.pdfPages !== undefined ? ` · PDF ${result.pdfPages}` : ""}</span>{result.rowCoverage && <span data-testid="pdf-row-coverage">Rows {result.rowCoverage.found}/{result.rowCoverage.total}</span>}{result.textCoverage && <span data-testid="pdf-text-coverage">Text {result.textCoverage.found}/{result.textCoverage.total}</span>}{result.imageCoverage && <span data-testid="pdf-image-coverage">Image draws {result.imageCoverage.found}/{result.imageCoverage.total}</span>}<span className="muted">{result.problems.filter((problem) => problem.severity !== "suggestion").length} issues</span></summary>
        <div className="test-lab-issues">
          {result.error && <p role="alert">{result.error}</p>}
          {result.rowCoverage && <p>PDF text check: {result.rowCoverage.found} of {result.rowCoverage.total} marked rows found using “{result.rowCoverage.field}”. Temporary row IDs were added only to this test run.{result.rowCoverage.total < result.count ? ` ${result.count - result.rowCoverage.total} rows had no text in this column and could not be checked.` : ""} <button type="button" className="btn" data-testid="stress-reveal-table" onClick={() => reveal(result.rowCoverage?.componentId, result.rowCoverage?.bandIndex)}>Show table</button></p>}
          {result.textCoverage && <p>PDF content check: {result.textCoverage.found} of {result.textCoverage.total} short Latin text items found on their expected pages.</p>}
          {result.imageCoverage && <p>PDF image check: counted up to {result.imageCoverage.found} raster draws for {result.imageCoverage.total} placed image elements on their expected pages. Other raster content can mask a missing image.</p>}
          {result.coverageNote && <p>{result.coverageNote}</p>}
          {result.problems.length ? result.problems.slice(0, 12).map((problem, index) => <p key={`${problem.code}-${index}`}><b>{problem.severity}</b> · {problem.message}{problem.componentId && problem.code !== "PDF_ROW_COVERAGE" && <button type="button" className="btn" onClick={() => reveal(problem.componentId)}>Show component</button>}</p>) : !result.error && <p>No engine problems for this scenario.</p>}
          {result.problems.length > 12 && <p>{result.problems.length - 12} more issues.</p>}
        </div>
      </details>)}
    </section>
  </div>;
}
