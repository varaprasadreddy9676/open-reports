import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Extracts page count and plain text from a generated PDF buffer, used to
 * prove text is real/searchable (not a rasterized image) and that pagination
 * produced the expected number of pages. */
export async function extractPdfText(buffer: Buffer): Promise<{ numPages: number; text: string }> {
  const data = new Uint8Array(buffer);
  const doc = await getDocument({ data, disableFontFace: true, verbosity: 0 }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item: any) => item.str).join(" ") + "\n";
  }
  return { numPages: doc.numPages, text };
}
