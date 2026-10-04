import { useState } from "react";
import { useStore } from "../store";
import { api } from "../lib/api";
import { withSampleData } from "../engine";
import { loadPdfjs } from "../lib/pdf-viewer";
import { comparePages, describeDiff, type PageDiff, type RasterPage } from "../lib/visual-diff";

const MAX_PAGES = 30;
const SCALE = 1;

interface Rendered { rasters: RasterPage[]; urls: string[]; pageCount: number }

function toDataUrl(raster: RasterPage): string {
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height), 0, 0);
  return canvas.toDataURL("image/png");
}

/** Renders a definition with the current sample data and rasterises its first pages. */
async function renderPages(definition: unknown, sample: Record<string, unknown>, parameters: Record<string, unknown>): Promise<Rendered> {
  const { blob } = await api.render(withSampleData(definition as never, sample), "pdf", parameters);
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
  const pdf = await task.promise;
  try {
    const rasters: RasterPage[] = [];
    const urls: string[] = [];
    for (let number = 1; number <= Math.min(pdf.numPages, MAX_PAGES); number++) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      const image = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
      rasters.push({ width: image.width, height: image.height, data: image.data });
      urls.push(canvas.toDataURL("image/png"));
    }
    return { rasters, urls, pageCount: pdf.numPages };
  } finally {
    await task.destroy();
  }
}

/** Renders two report versions to PDF with the same sample data and highlights what changed on each page. */
export function VisualCompare({ before, after, beforeLabel, afterLabel }: { before: unknown; after: unknown; beforeLabel: string; afterLabel: string }) {
  const sample = useStore((s) => s.sample);
  const parameters = useStore((s) => s.parameters);
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ diffs: PageDiff[]; before: Rendered; after: Rendered; overlays: (string | undefined)[] }>();
  const run = async () => {
    setState("running");
    setError("");
    try {
      const [a, b] = await Promise.all([renderPages(before, sample, parameters), renderPages(after, sample, parameters)]);
      const diffs = comparePages(a.rasters, b.rasters);
      setResult({ diffs, before: a, after: b, overlays: diffs.map((d) => (d.overlay && d.status === "changed" ? toDataUrl(d.overlay) : undefined)) });
      setState("done");
    } catch (reason) {
      setError((reason as Error).message || "The versions could not be rendered.");
      setState("error");
    }
  };
  return <div className="visual-compare" data-testid="visual-compare">
    <div className="row-inline">
      <button className="btn primary" data-testid="visual-compare-run" disabled={state === "running"} onClick={run}>{state === "running" ? "Rendering both versions…" : result ? "Render again" : "Render and compare"}</button>
      <span className="muted small">Both versions use the current sample data, so differences come from the design.</span>
    </div>
    {error && <div className="field-error" role="alert">{error}</div>}
    {result && <>
      <p data-testid="visual-compare-summary" role="status">{describeDiff(result.diffs)}{(result.before.pageCount > MAX_PAGES || result.after.pageCount > MAX_PAGES) ? ` Only the first ${MAX_PAGES} pages were compared.` : ""}</p>
      <div className="visual-pages">
        {result.diffs.filter((diff) => diff.status !== "same").map((diff) => <div key={diff.page} className="visual-page" data-testid={`visual-page-${diff.page}`}>
          <strong>Page {diff.page} · {diff.status === "changed" ? `${(diff.ratio * 100).toFixed(diff.ratio < 0.01 ? 2 : 1)}% changed` : diff.status}</strong>
          <div className="visual-images">
            <figure>{result.before.urls[diff.page - 1] ? <img alt={`${beforeLabel} page ${diff.page}`} src={result.before.urls[diff.page - 1]} /> : <span className="muted">No page</span>}<figcaption>{beforeLabel}</figcaption></figure>
            <figure>{result.after.urls[diff.page - 1] ? <img alt={`${afterLabel} page ${diff.page}`} src={result.after.urls[diff.page - 1]} /> : <span className="muted">No page</span>}<figcaption>{afterLabel}</figcaption></figure>
            {result.overlays[diff.page - 1] && <figure><img alt={`Differences on page ${diff.page}`} data-testid={`visual-diff-${diff.page}`} src={result.overlays[diff.page - 1]} /><figcaption>Changes in red</figcaption></figure>}
          </div>
        </div>)}
      </div>
    </>}
  </div>;
}
