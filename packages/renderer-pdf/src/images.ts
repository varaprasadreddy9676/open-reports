/** Resolves an `image` `src` to a Buffer pdfkit can embed. Only data: URLs are embedded. Linked files and
 * URLs are read by the reporting server, inside its configured image folders and SSRF-guarded URL fetcher,
 * and replaced with data: URLs before rendering; the renderer never reads paths or URLs on its own. */
export function resolveImageSource(src: string): { buffer?: Buffer; warning?: string } {
  if (src.startsWith("data:")) {
    const match = /^data:[^;]+;base64,(.+)$/.exec(src);
    if (!match) return { warning: `Could not parse data URL image.` };
    return { buffer: Buffer.from(match[1]!, "base64") };
  }
  return { warning: `Image "${src}" was not embedded: linked image paths and URLs are resolved by the reporting server, not the PDF renderer.` };
}
