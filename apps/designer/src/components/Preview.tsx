import React, { useEffect, useMemo, useState } from "react";
import { findComponentsByType } from "@reporting/core";
import { CsvRenderer } from "@reporting/renderer-csv";
import { ZplRenderer } from "@reporting/renderer-zpl";
import { resolvePageGeometry } from "@reporting/layout";
import { useStore } from "../store";
import { withSampleData } from "../engine";
import { api } from "../lib/api";
import { decodeEscPos } from "../lib/escpos-preview";
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const PdfDocumentView = React.lazy(() => import("./PdfDocumentView").then((module) => ({ default: module.PdfDocumentView })));

export type PreviewTab = "pdf" | "html" | "xlsx" | "csv" | "zpl" | "escpos";

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

export async function exportReport(format: PreviewTab | "docx") {
  const s = useStore.getState();
  try {
    const { blob } = await api.render(withSampleData(s.doc, s.sample), format, s.parameters);
    downloadBlob(blob, `${s.doc.id || "report"}.${format}`);
    s.toast(`Exported ${format.toUpperCase()}`, "success");
  } catch (e) {
    s.toast((e as Error).message, "error");
  }
}

export function PdfPreview({ compact = false }: { compact?: boolean }) {
  const { doc, sample, parameters } = useStore();
  const [url, setUrl] = useState<string>();
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [blob, setBlob] = useState<Blob>();
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const missingImage = error.match(/Image "([^"]+)" is not available on the reporting server/);

  useEffect(() => {
    let cancelled = false;
    let currentUrl: string | undefined;
    let currentPdf: PDFDocumentProxy | undefined;
    let loadingTask: PDFDocumentLoadingTask | undefined;
    setBusy(true);
    setPdf(undefined);
    setUrl(undefined);
    setBlob(undefined);
    setInfo("");
    setError("");
    const t = setTimeout(async () => {
      try {
        const rendered = await api.render(withSampleData(doc, sample), "pdf", parameters);
        if (cancelled) return;
        const renderedBlob = rendered.blob;
        const bytes = await renderedBlob.arrayBuffer();
        if (cancelled) return;
        const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
        if (cancelled) return;
        GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        loadingTask = getDocument({ data: new Uint8Array(bytes) });
        const loadedPdf = await loadingTask.promise;
        if (cancelled) return;
        const pages = loadedPdf.numPages;
        if (compact) {
          await loadingTask.destroy();
          loadingTask = undefined;
        } else currentPdf = loadedPdf;
        if (cancelled) return;
        currentUrl = URL.createObjectURL(renderedBlob);
        setUrl(currentUrl);
        setPdf(currentPdf);
        setBlob(renderedBlob);
        setInfo(`${pages} page${pages === 1 ? "" : "s"} · ${(renderedBlob.size / 1024).toFixed(1)} KB · render ${rendered.renderId?.slice(0, 8) ?? ""}`);
        setError("");
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
      void loadingTask?.destroy();
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [doc, sample, parameters, compact]);

  return (
    <div className={`preview-pane ${compact ? "pdf-compact" : ""}`}>
      <div className="preview-bar">
        <span data-testid={compact ? "structure-pdf-info" : "pdf-info"}>{busy ? "Rendering PDF..." : info}</span>
        <span className="spacer" />
        {!compact && <><button className="btn" onClick={() => url && window.open(url, "_blank", "noopener,noreferrer")} disabled={!url}>Open to print</button>
          <button className="btn" data-testid="download-pdf" disabled={!blob} onClick={() => blob && downloadBlob(blob, `${doc.id || "report"}.pdf`)}>Download PDF</button></>}
      </div>
      {error ? <div className="preview-error" role="alert" data-testid="pdf-preview-error"><h2>{missingImage ? "Image unavailable" : "PDF preview could not be created"}</h2><p>{missingImage ? `The report server cannot read ${missingImage[1]}. Embed the image, or use a URL or server path it can reach.` : error}</p><button className="btn primary" onClick={() => useStore.getState().set({ mode: "design", bottom: "problems" })}>Back to design</button>{missingImage && <details><summary>Technical details</summary><code>{error}</code></details>}</div> : compact && url ? <iframe data-testid="structure-pdf-frame" title="PDF preview" src={url} /> : pdf ? <React.Suspense fallback={<div className="muted pad">Loading PDF viewer…</div>}><PdfDocumentView pdf={pdf} /></React.Suspense> : <div className="muted pad">Rendering...</div>}
    </div>
  );
}

function HtmlPreview() {
  const { doc, sample, parameters } = useStore();
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { blob } = await api.render(withSampleData(doc, sample), "html", parameters);
        const text = await blob.text();
        if (!cancelled) {
          setHtml(text);
          setError("");
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [doc, sample, parameters]);
  return (
    <div className="preview-pane">
      <div className="preview-bar">
        <span>Semantic, print-ready HTML (same bindings, fonts and pagination)</span>
        <span className="spacer" />
        <button className="btn" onClick={() => exportReport("html")}>Download HTML</button>
      </div>
      {error ? <div className="field-error big" role="alert">{error}</div> : <iframe data-testid="html-frame" title="HTML preview" srcDoc={html} />}
    </div>
  );
}

function XlsxPreview() {
  const resolved = useStore((s) => s.engine.resolved);
  const [sheet, setSheet] = useState(0);
  const tables = useMemo(() => (resolved ? findComponentsByType(resolved, "table") : []), [resolved]);
  const t: any = tables[sheet];
  return (
    <div className="preview-pane">
      <div className="preview-bar">
        <span>Spreadsheet view - XLSX is a structured data export, so values keep their real types.</span>
        <span className="spacer" />
        <button className="btn" data-testid="download-xlsx" onClick={() => exportReport("xlsx")}>Download XLSX</button>
      </div>
      {tables.length === 0 ? (
        <div className="muted pad">This report has no table, so there is nothing to export as a spreadsheet.</div>
      ) : (
        <div className="sheet-wrap" data-testid="xlsx-grid">
          <div className="sheet-grid">
            <table>
              <thead>
                <tr>
                  <th className="corner" />
                  {t.columns.map((c: any, i: number) => (
                    <th key={c.id}>{String.fromCharCode(65 + (i % 26))}</th>
                  ))}
                </tr>
                <tr>
                  <th className="rownum">1</th>
                  {t.columns.map((c: any) => (
                    <td key={c.id} className="hdr">{c.header}</td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rows.slice(0, 200).map((r: any, i: number) => (
                  <tr key={i}>
                    <th className="rownum">{i + 2}</th>
                    {t.columns.map((c: any) => {
                      const v = r.raw[c.id];
                      return (
                        <td key={c.id} className={typeof v === "number" ? "num" : ""} title={typeof v}>
                          {v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "")}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sheet-tabs">
            {tables.map((tb: any, i: number) => (
              <button key={i} className={i === sheet ? "active" : ""} onClick={() => setSheet(i)}>
                {tb.id ?? `Table ${i + 1}`}
              </button>
            ))}
            {t.rows.length > 200 && <span className="muted small">showing first 200 of {t.rows.length} rows</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function CsvPreview() {
  const { engine } = useStore();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    (async () => {
      if (!engine.resolved || !engine.resolvePageSection) return;
      try {
        const r = await new CsvRenderer().render({ resolved: engine.resolved, resolvePageSection: engine.resolvePageSection });
        setText(String(r.content));
        setError("");
      } catch (e) {
        setText("");
        setError((e as Error).message);
      }
    })();
  }, [engine]);
  return (
    <div className="preview-pane">
      <div className="preview-bar">
        <span>CSV export of the report's table (raw values, RFC 4180 escaping)</span>
        <span className="spacer" />
        <button className="btn" data-testid="download-csv" onClick={() => exportReport("csv")}>Download CSV</button>
      </div>
      {error ? <div className="field-error big" role="alert">{error}</div> : <pre className="csv" data-testid="csv-text">{text.split("\n").slice(0, 300).join("\n")}</pre>}
    </div>
  );
}

function ZplPreview() {
  const { doc, engine } = useStore();
  const [text, setText] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    (async () => {
      if (!engine.resolved || !engine.resolvePageSection) return;
      try {
        const r = await new ZplRenderer().render({ resolved: engine.resolved, resolvePageSection: engine.resolvePageSection});
        setText(String(r.content));
        setWarnings(r.warnings.map((w) => w.message));
        setError("");
      } catch (e) {
        setText("");
        setError((e as Error).message);
      }
    })();
  }, [engine, doc.print?.dpi]);
  const pag = engine.paginated;
  const mm = (pt: number) => ((pt * 25.4) / 72).toFixed(1);
  return (
    <div className="preview-pane">
      <div className="preview-bar">
        <span data-testid="zpl-info">
          {pag ? `${mm(pag.pageSize.width)} × ${mm(pag.pageSize.height)} mm · ${doc.print?.dpi ?? 203} dpi · ${pag.pages.length} label${pag.pages.length === 1 ? "" : "s"}` : ""}
        </span>
        <span className="spacer" />
        <button className="btn" data-testid="download-zpl" onClick={() => exportReport("zpl")}>Download .zpl</button>
      </div>
      {warnings.length > 0 && (
        <ul className="zpl-warnings" role="alert" data-testid="zpl-warnings">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      {error ? <div className="field-error big" role="alert">{error}</div> : <pre className="csv" data-testid="zpl-text">{text}</pre>}
    </div>
  );
}

export function EscPosPreview({ design = false }: { design?: boolean }) {
  const { doc, sample, parameters } = useStore();
  const [rendered, setRendered] = useState<{ blob: Blob; text: string; lines: number; cuts: number; warningCount: number }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const geometry = resolvePageGeometry(doc.page);
  const widthMm = (geometry.width * 25.4) / 72;
  const columns = Math.max(16, Math.floor(((geometry.width - geometry.margin.left - geometry.margin.right) / 72 * (doc.print?.dpi ?? 203)) / 12));

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setRendered(undefined);
    const timer = setTimeout(async () => {
      try {
        const { blob, warningCount } = await api.render(withSampleData(doc, sample), "escpos", parameters);
        const decoded = decodeEscPos(new Uint8Array(await blob.arrayBuffer()));
        if (cancelled) return;
        setRendered({ blob, ...decoded, warningCount });
        setError("");
      } catch (reason) {
        if (!cancelled) setError((reason as Error).message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [doc, sample, parameters]);

  return (
    <div className="preview-pane escpos-preview" data-testid={design ? "design-roll-preview" : "escpos-preview"}>
      <div className="preview-bar">
        <span data-testid="escpos-info">{busy ? "Rendering receipt…" : rendered ? `${widthMm.toFixed(0)} mm · ${columns} columns · ${rendered.lines} lines · ${rendered.cuts} cut · ${(rendered.blob.size / 1024).toFixed(1)} KB${rendered.warningCount ? ` · ${rendered.warningCount} warning${rendered.warningCount === 1 ? "" : "s"}` : ""}` : ""}</span>
        <span className="spacer" />
        <button className="btn" data-testid="download-escpos" disabled={!rendered || busy} onClick={() => rendered && downloadBlob(rendered.blob, `${doc.id || "receipt"}.bin`)}>Download .bin</button>
      </div>
      <p className="escpos-note">{design
        ? "Live output from the generated printer bytes. Edit in Sections; the roll continues to one final cut. Page height only affects PDF. ESC/POS uses printer columns and may skip unsupported visual elements."
        : "Decoded from the generated ESC/POS bytes. Verify paper feed, character set, and cutting on the target printer."}</p>
      {error ? <div className="field-error big" role="alert">{error}</div> : rendered ? (
        <div className="receipt-scroll">
          <div className="receipt-paper" style={{ width: `${columns + 2}ch` }}>
            <pre data-testid="escpos-text">{rendered.text}</pre>
            <div className="receipt-cut" aria-label="Cut after receipt">Cut after receipt</div>
          </div>
        </div>
      ) : <div className="muted pad">Rendering receipt…</div>}
    </div>
  );
}

export function Preview() {
  const target = useStore((s) => s.target);
  const printerType = useStore((s) => s.doc.print?.printerType);
  const printerTab = printerType === "receipt" ? "escpos" : printerType === "label" || printerType === "card" || printerType === "wristband" ? "zpl" : null;
  const targetTab = (["pdf", "html", "xlsx", "csv"] as string[]).includes(target) || target === printerTab ? target as PreviewTab : "pdf";
  const [tab, setTab] = useState<PreviewTab>(targetTab);
  useEffect(() => setTab(targetTab), [targetTab]);
  return (
    <div className="preview" data-testid="preview">
      <div className="tabs sub" role="tablist">
        <span className="preview-tab-label">Document</span>
        {(["pdf", "html"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} data-testid={`preview-tab-${t}`} onClick={() => setTab(t)}>{t.toUpperCase()}</button>)}
        <span className="preview-tab-label">Data export</span>
        {(["xlsx", "csv"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} data-testid={`preview-tab-${t}`} onClick={() => setTab(t)}>{t.toUpperCase()}</button>)}
        {printerTab && <><span className="preview-tab-label">Printer</span><button role="tab" aria-selected={tab === printerTab} className={tab === printerTab ? "active" : ""} data-testid={`preview-tab-${printerTab}`} onClick={() => setTab(printerTab)}>{printerTab === "escpos" ? "ESC/POS" : "ZPL"}</button></>}
      </div>
      {tab === "pdf" && <PdfPreview />}
      {tab === "html" && <HtmlPreview />}
      {tab === "xlsx" && <XlsxPreview />}
      {tab === "csv" && <CsvPreview />}
      {tab === "zpl" && <ZplPreview />}
      {tab === "escpos" && <EscPosPreview />}
    </div>
  );
}
