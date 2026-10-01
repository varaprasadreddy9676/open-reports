import fs from "node:fs";

/** Resolves an `image`/background `src` to a Buffer pdfkit can embed.
 * Supports data: URLs and local filesystem paths. Remote URL fetching is
 * deliberately NOT implemented here -- SSRF protection, timeouts and size
 * limits belong to the REST/asset layer (see roadmap task on datasources),
 * not silently inside the renderer. A remote src produces a warning instead
 * of a fetch. */
export function resolveImageSource(src: string): { buffer?: Buffer; path?: string; warning?: string } {
  if (src.startsWith("data:")) {
    const match = /^data:[^;]+;base64,(.+)$/.exec(src);
    if (!match) return { warning: `Could not parse data URL image.` };
    return { buffer: Buffer.from(match[1]!, "base64") };
  }
  if (/^https?:\/\//.test(src)) {
    return { warning: `Remote image URLs are not fetched by the PDF renderer yet: "${src}".` };
  }
  if (fs.existsSync(src)) {
    return { path: src };
  }
  return { warning: `Image not found: "${src}".` };
}
