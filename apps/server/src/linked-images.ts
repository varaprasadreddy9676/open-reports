import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ResolvedComponent, ResolvedReport } from "@reporting/core";
import { assertUrlIsSafe } from "@reporting/datasource-rest";
import { RenderPipelineError } from "./render-error.js";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function imageDataUrl(bytes: Buffer): string {
  const mime = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "image/png"
    : bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      ? "image/jpeg"
      : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP"
        ? "image/webp"
        : undefined;
  if (!mime) throw new RenderPipelineError("Image must be PNG, JPEG, or WebP.", "INVALID_IMAGE_SOURCE", 400);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

async function readWebImage(url: string, allowedHosts?: string[]): Promise<Buffer> {
  let current = url;
  const timeout = AbortSignal.timeout(10_000);
  for (let redirect = 0; redirect < 4; redirect++) {
    try {
      await assertUrlIsSafe(current, allowedHosts?.length ? { allowedHosts } : {});
    } catch (err) {
      throw new RenderPipelineError(err instanceof Error ? err.message : String(err), "IMAGE_URL_BLOCKED", 400);
    }
    let response: Response;
    try {
      response = await fetch(current, { redirect: "manual", signal: timeout });
    } catch (err) {
      throw new RenderPipelineError(`Could not fetch image: ${err instanceof Error ? err.message : String(err)}`, "IMAGE_FETCH_FAILED", 422);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new RenderPipelineError("Image redirect has no location.", "IMAGE_FETCH_FAILED", 422);
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok || !response.body) throw new RenderPipelineError(`Image URL returned HTTP ${response.status}.`, "IMAGE_FETCH_FAILED", 422);
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new RenderPipelineError("Image exceeds 5 MB.", "INVALID_IMAGE_SOURCE", 400);
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }
  throw new RenderPipelineError("Too many image redirects.", "IMAGE_FETCH_FAILED", 422);
}

/** Reads a saved path or URL each time a report is rendered. Paths are resolved on the reporting server. */
export async function readImageSource(src: string, allowedHosts?: string[]): Promise<string> {
  if (!src || src.includes("\0")) throw new RenderPipelineError("An image path or URL is required.", "INVALID_IMAGE_SOURCE", 400);
  if (src.startsWith("data:")) return src;
  let bytes: Buffer;
  if (/^https?:\/\//i.test(src)) {
    bytes = await readWebImage(src, allowedHosts);
  } else {
    try {
      const filePath = src.startsWith("file://") ? fileURLToPath(src) : src.startsWith("~/") ? path.join(os.homedir(), src.slice(2)) : src;
      const stat = fs.statSync(filePath);
      if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) throw new Error("Image must be a file smaller than 5 MB.");
      bytes = fs.readFileSync(filePath);
    } catch (err) {
      throw new RenderPipelineError(`Cannot read image at "${src}" on the reporting server: ${err instanceof Error ? err.message : String(err)}`, "IMAGE_FILE_UNAVAILABLE", 422);
    }
  }
  return imageDataUrl(bytes);
}

function visit(children: ResolvedComponent[], fn: (image: Extract<ResolvedComponent, { type: "image" }>) => void): void {
  for (const child of children) {
    if (child.type === "image") fn(child);
    if ("children" in child && Array.isArray(child.children)) visit(child.children, fn);
    if ("header" in child && Array.isArray(child.header)) visit(child.header, fn);
    if ("footer" in child && Array.isArray(child.footer)) visit(child.footer, fn);
  }
}

/** Called once per render, so replacing a file or URL target changes the next output without editing the report. */
export async function materializeLinkedImages(report: ResolvedReport, allowedHosts?: string[]): Promise<Map<string, string>> {
  const sources = new Set<string>();
  for (const section of report.sections) visit(section.children, (image) => {
    if (image.src && !image.src.startsWith("data:")) sources.add(image.src);
  });
  const resolved = new Map<string, string>();
  await Promise.all([...sources].map(async (src) => resolved.set(src, await readImageSource(src, allowedHosts))));
  for (const section of report.sections) materializeChildren(section.children, resolved);
  return resolved;
}

export function materializeChildren(children: ResolvedComponent[], resolved: Map<string, string>): void {
  visit(children, (image) => {
    if (!image.src || image.src.startsWith("data:")) return;
    const data = resolved.get(image.src);
    if (!data) throw new RenderPipelineError(`Image source was not available during page layout: ${image.src}`, "IMAGE_SOURCE_UNAVAILABLE", 422);
    image.src = data;
  });
}
