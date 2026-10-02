import React, { useEffect, useMemo, useRef, useState } from "react";
import { findComponentsByType } from "@reporting/core";
import { CsvRenderer } from "@reporting/renderer-csv";
import { ZplRenderer } from "@reporting/renderer-zpl";
import { useStore } from "../store";
import { withSampleData } from "../engine";
import { api } from "../lib/api";

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

export async function exportReport(format: PreviewTab) {
  const s = useStore.getState();
  try {
    const { blob } = await api.render(withSampleData(s.doc, s.sample), format);
    downloadBlob(blob, `${s.doc.id || "report"}.${format}`);
    s.toast(`Exported ${format.toUpperCase()}`, "success");
  } catch (e) {
    s.toast((e as Error).message, "error");
  }
}

export function PdfPreview({ compact = false }: { compact?: boolean }) {
  const { doc, sample } = useStore();
  const [url, setUrl] = useState<string>();
  const urlRef = useRef<string>();
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const { blob, renderId } = await api.render(withSampleData(doc, sample), "pdf");
        if (cancelled) return;
        const text = await blob.text();
        const pages = (text.match(/\/Type \/Page(?![s\w])/g) ?? []).length;
        setInfo(`${pages} page${pages === 1 ? "" : "s"} · ${(blob.size / 1024).toFixed(1)} KB · render ${renderId?.slice(0, 8) ?? ""}`);
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = URL.createObjectURL(blob);
        setUrl(urlRef.current);
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
    };
  }, [doc, sample]);

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  return (
    <div className={`preview-pane ${compact ? "pdf-compact" : ""}`}>
      <div className="preview-bar">
        <span data-testid={compact ? "structure-pdf-info" : "pdf-info"}>{busy ? "Rendering PDF..." : info}</span>
        <span className="spacer" />
        {!compact && <><button className="btn" onClick={() => frame.current?.contentWindow?.print()} disabled={!url}>Print</button>
          <button className="btn" data-testid="download-pdf" onClick={() => exportReport("pdf")}>Download PDF</button></>}
      </div>
      {error ? <div className="field-error big" role="alert">{error}</div> : url ? <iframe ref={frame} data-testid={compact ? "structure-pdf-frame" : "pdf-frame"} title="PDF preview" src={url} /> : <div className="muted pad">Rendering...</div>}
    </div>
  );
}

function HtmlPreview() {
  const { doc, sample } = useStore();
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const { blob } = await api.render(withSampleData(doc, sample), "html");
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
  }, [doc, sample]);
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

export function Preview() {
  const target = useStore((s) => s.target);
  const [tab, setTab] = useState<PreviewTab>(target === "zpl" || target === "xlsx" || target === "csv" || target === "html" ? (target as PreviewTab) : "pdf");
  return (
    <div className="preview" data-testid="preview">
      <div className="tabs sub" role="tablist">
        {(["pdf", "html", "xlsx", "csv", "zpl"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} data-testid={`preview-tab-${t}`} onClick={() => setTab(t)}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>
      {tab === "pdf" && <PdfPreview />}
      {tab === "html" && <HtmlPreview />}
      {tab === "xlsx" && <XlsxPreview />}
      {tab === "csv" && <CsvPreview />}
      {tab === "zpl" && <ZplPreview />}
    </div>
  );
}
