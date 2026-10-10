// Renders PDF pages to canvases with pdf.js, so the training hosts can show the returned PDF the same way in
// every browser (headless recording browsers have no built-in PDF viewer).
const pdfjs = await import("/vendor/pdfjs/pdf.min.mjs");
pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";

/** Draws every page of `blob` into `container`, scaled to its width. Returns the page count. */
export async function renderPdf(container, blob) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  container.replaceChildren();
  const width = container.clientWidth || 800;
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (width / base.width) * (window.devicePixelRatio || 1) });
    const canvas = document.createElement("canvas");
    canvas.className = "pdf-page";
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${width}px`;
    canvas.setAttribute("aria-label", `Page ${number} of ${pdf.numPages}`);
    container.append(canvas);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  }
  return pdf.numPages;
}

/** Sends the PDF to the browser's print dialog through a hidden frame (works where a PDF viewer exists). */
export function printPdf(url) {
  const frame = Object.assign(document.createElement("iframe"), { src: url, title: "Print", hidden: true });
  frame.addEventListener("load", () => {
    try { frame.contentWindow.print(); } catch { /* no PDF viewer: the preview stays on screen */ }
    setTimeout(() => frame.remove(), 60_000);
  });
  document.body.append(frame);
}
