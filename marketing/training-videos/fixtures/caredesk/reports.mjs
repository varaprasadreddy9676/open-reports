// Where CareDesk keeps its report definitions: one JSON file per branch, as a real application might.
// The path is the host's own reference; Open Reports only ever receives the JSON read from it.
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPORT_DIR = process.env.CAREDESK_REPORT_DIR || "/tmp/caredesk/reports";
const FINISHED = path.join(here, "reports/hospital-invoice.report.json");
const versions = new Map();

export const reportPathFor = (branch) => path.join(REPORT_DIR, branch, "invoice.report.json");

const blankInvoice = {
  schemaVersion: "1.0", id: "hospital-invoice", name: "Hospital invoice", datasets: [],
  page: { size: "A4", orientation: "portrait", unit: "mm", margin: { top: 14, right: 15, bottom: 18, left: 15 } },
  sections: [{ type: "detail", children: [] }],
};

export function checkDefinition(value) {
  if (!value || typeof value !== "object" || value.schemaVersion !== "1.0" || !value.page || !Array.isArray(value.sections)) {
    throw Object.assign(new Error("That is not an Open Reports definition (expected schemaVersion 1.0, page and sections)."), { status: 400 });
  }
  return value;
}

export async function loadDefinition(branch) {
  const file = reportPathFor(branch);
  try {
    return checkDefinition(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await resetBranch(branch, "finished");
    return checkDefinition(JSON.parse(await readFile(file, "utf8")));
  }
}

export async function saveDefinition(branch, definition) {
  const file = reportPathFor(branch);
  await mkdir(path.dirname(file), { recursive: true });
  const text = `${JSON.stringify(checkDefinition(definition), null, 2)}\n`;
  await writeFile(file, text, { mode: 0o600 });
  versions.set(branch, (versions.get(branch) ?? 1) + 1);
  return describe(branch);
}

export async function describe(branch) {
  const file = reportPathFor(branch);
  try {
    const info = await stat(file);
    return { path: file, version: versions.get(branch) ?? 1, bytes: info.size, savedAt: info.mtime.toISOString() };
  } catch {
    return { path: file, version: 0, bytes: 0, savedAt: null };
  }
}

/** Training reset: "finished" restores the film's completed invoice, "blank" leaves an empty page to replace. */
export async function resetBranch(branch, mode) {
  const file = reportPathFor(branch);
  await mkdir(path.dirname(file), { recursive: true });
  const text = mode === "blank" ? `${JSON.stringify(blankInvoice, null, 2)}\n` : await readFile(FINISHED, "utf8");
  await writeFile(file, text, { mode: 0o600 });
  versions.set(branch, 1);
}
