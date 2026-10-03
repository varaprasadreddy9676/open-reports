import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  return pdfjs;
}

let viewerModule: Promise<typeof import("pdfjs-dist/web/pdf_viewer.mjs")> | undefined;

/** PDF.js viewer components read the core library from `globalThis.pdfjsLib` when their module is evaluated. */
export function loadPdfViewer() {
  viewerModule ??= loadPdfjs().then((pdfjs) => {
    (globalThis as { pdfjsLib?: unknown }).pdfjsLib = pdfjs;
    return import("pdfjs-dist/web/pdf_viewer.mjs");
  }).catch((reason) => {
    viewerModule = undefined;
    throw reason;
  });
  return viewerModule;
}
