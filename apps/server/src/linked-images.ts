import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ResolvedComponent, ResolvedReport } from "@reporting/core";
import { safeFetch, SsrfBlockedError } from "@reporting/datasource-rest";
import { RenderPipelineError } from "./render-error.js";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Where linked images may come from: private URL hosts the operator trusts, and folders on the server whose files may be read. */
export interface ImageSourcePolicy {
  allowedHosts?: string[];
  roots?: string[];
}

/** One response for missing files and refused paths, so a report author cannot probe which files exist outside the image folders. */
function unavailable(src: string): RenderPipelineError {
  return new RenderPipelineError(
    `Image "${src}" is not available on the reporting server. Linked image files must be inside a folder listed in REPORT_IMAGE_ROOTS.`,
    "IMAGE_FILE_UNAVAILABLE",
    422,
  );
}

const inside = (file: string, root: string) => file === root || file.startsWith(root.endsWith(path.sep) ? root : root + path.sep);

async function readConfinedFile(src: string, roots: string[]): Promise<Buffer> {
  let requested: string;
  try {
    requested = path.resolve(src.startsWith("file://") ? fileURLToPath(src) : src.startsWith("~/") ? path.join(os.homedir(), src.slice(2)) : src);
  } catch {
    throw unavailable(src);
  }
  const resolvedRoots = roots.map((root) => path.resolve(root));
  // Refuse paths outside every folder before touching the file system at all.
  if (!resolvedRoots.some((root) => inside(requested, root))) throw unavailable(src);
  const realRoots = (await Promise.all(resolvedRoots.map((root) => fs.promises.realpath(root).catch(() => undefined)))).filter((root): root is string => !!root);
  let real: string;
  try {
    real = await fs.promises.realpath(requested);
  } catch {
    throw unavailable(src);
  }
  // A symlink inside a folder must not lead outside it.
  if (!realRoots.some((root) => inside(real, root))) throw unavailable(src);
  const stat = await fs.promises.stat(real).catch(() => undefined);
  if (!stat?.isFile()) throw unavailable(src);
  if (stat.size > MAX_IMAGE_BYTES) throw new RenderPipelineError("Image exceeds 5 MB.", "INVALID_IMAGE_SOURCE", 400);
  return fs.promises.readFile(real);
}

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
  let response: Awaited<ReturnType<typeof safeFetch>>;
  try {
    response = await safeFetch(url, { signal: AbortSignal.timeout(10_000) }, allowedHosts?.length ? { allowedHosts } : {});
  } catch (err) {
    if (err instanceof SsrfBlockedError) throw new RenderPipelineError(err.message, "IMAGE_URL_BLOCKED", 400);
    throw new RenderPipelineError(`Could not fetch image: ${err instanceof Error ? err.message : String(err)}`, "IMAGE_FETCH_FAILED", 422);
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

/** Reads a saved path or URL each time a report is rendered. Paths are resolved on the reporting server. */
export async function readImageSource(src: string, policy: ImageSourcePolicy = {}): Promise<string> {
  if (!src || src.includes("\0")) throw new RenderPipelineError("An image path or URL is required.", "INVALID_IMAGE_SOURCE", 400);
  if (src.startsWith("data:")) return src;
  const bytes = /^https?:\/\//i.test(src) ? await readWebImage(src, policy.allowedHosts) : await readConfinedFile(src, policy.roots ?? []);
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
export async function materializeLinkedImages(report: ResolvedReport, policy: ImageSourcePolicy = {}): Promise<Map<string, string>> {
  const sources = new Set<string>();
  for (const section of report.sections) visit(section.children, (image) => {
    if (image.src && !image.src.startsWith("data:")) sources.add(image.src);
  });
  const resolved = new Map<string, string>();
  await Promise.all([...sources].map(async (src) => resolved.set(src, await readImageSource(src, policy))));
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
