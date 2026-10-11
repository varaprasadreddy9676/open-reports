// Data, preview, background-job and storage tools: everything the designer can do through the REST API
// beyond authoring and rendering (see tools.ts). All of them are browser-safe and talk only to the API.
import { guard, reportProp, subreportsProp, toBase64, viewerStateProp, FORMATS, type ToolSpec } from "./tool-kit.js";

const enc = encodeURIComponent;
const TEXT_FORMATS = ["html", "csv", "zpl"];

const decode = (text: string) => text
  .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/**
 * Turns the engine's HTML output into plain text, page by page, in layout order: one line per positioned
 * element, images as [image: alt], table cells separated by " | ". This lets a model check what each page says.
 */
export function pagesFromHtml(html: string, maxCharsPerPage = 4000): string[] {
  const pages = html.split(/<section class="page"[^>]*>/).slice(1);
  return pages.map((page) => {
    const text = decode(page
      .replace(/<img[^>]*alt="([^"]*)"[^>]*>/g, (_m, alt: string) => `\n[image${alt ? `: ${alt}` : ""}]\n`)
      .replace(/<\/(div|tr|p|h\d|li|section)>|<br\s*\/?>/g, "\n")
      .replace(/<\/t[dh]>/g, " | ")
      .replace(/<[^>]+>/g, ""))
      .split("\n").map((line) => line.replace(/\s+/g, " ").replace(/\s*\|\s*$/, "").trim()).filter(Boolean).join("\n");
    return text.length > maxCharsPerPage ? `${text.slice(0, maxCharsPerPage)}\n…(page text truncated)` : text;
  });
}

async function renderedOutput(format: string, out: { bytes: Uint8Array; mimeType: string; warnings?: number }, maxInlineKb = 512) {
  const data: Record<string, unknown> = { mimeType: out.mimeType, bytes: out.bytes.length, warnings: out.warnings };
  if (TEXT_FORMATS.includes(format)) data.text = new TextDecoder().decode(out.bytes.slice(0, 40_000));
  else if (out.bytes.length <= maxInlineKb * 1024) data.base64 = toBase64(out.bytes);
  return data;
}

export const MORE_TOOLS: ToolSpec[] = [
  {
    name: "preview_report",
    description: "See what the rendered report actually shows: the text of every page, in layout order (images as [image: alt], table cells separated by |). Use it after changes to check content, page breaks and repeated headers, instead of guessing. Accepts an inline report or a stored templateId.",
    inputSchema: { type: "object", properties: { report: reportProp, templateId: { type: "string" }, version: { type: "number" }, parameters: { type: "object" }, data: { type: "object" }, subreports: subreportsProp, viewerState: viewerStateProp, pages: { type: "array", items: { type: "number" }, description: "Only these page numbers (1-based)." }, maxCharsPerPage: { type: "number" } } },
    readOnly: true,
    handler: guard(async (a: { report?: unknown; templateId?: string; version?: number; parameters?: object; data?: object; subreports?: object; viewerState?: object; pages?: number[]; maxCharsPerPage?: number }, api) => {
      if (!a.report && !a.templateId) return { text: "Provide either report or templateId.", isError: true };
      const out = a.templateId
        ? await api.binary("POST", `/api/v1/templates/${enc(a.templateId)}/render`, { format: "html", version: a.version, parameters: a.parameters, data: a.data, viewerState: a.viewerState })
        : await api.binary("POST", "/api/v1/render", { report: a.report, format: "html", parameters: a.parameters, data: a.data, subreports: a.subreports, viewerState: a.viewerState });
      const all = pagesFromHtml(new TextDecoder().decode(out.bytes), a.maxCharsPerPage);
      const wanted = a.pages?.length ? a.pages.filter((n) => n >= 1 && n <= all.length) : all.map((_p, i) => i + 1);
      const text = wanted.map((n) => `--- Page ${n} of ${all.length} ---\n${all[n - 1]}`).join("\n\n");
      return { text: `${all.length} page(s), ${out.warnings ?? 0} warning(s).\n\n${text}` };
    }),
  },
  {
    name: "test_dataset",
    description: "Run one dataset definition (inline JSON, CSV, REST or SQL as configured on the server) and return its first rows, row count, timing and any problems. Use it to learn the real field names before binding them in a report.",
    inputSchema: { type: "object", properties: { dataset: { type: "object", description: "A dataset definition: { id, source, query, ... } as in report.datasets." }, parameters: { type: "object" }, maxRows: { type: "number", description: "Default 20, at most 500." } }, required: ["dataset"] },
    readOnly: true,
    handler: guard(async (a: { dataset: unknown; parameters?: object; maxRows?: number }, api) => {
      const result = await api.json("POST", "/api/v1/datasets/test", { dataset: a.dataset, parameters: a.parameters, maxRows: a.maxRows ?? 20 });
      return { text: result.ok ? `Dataset returned ${result.rowCount} row(s) in ${result.durationMs} ms.` : `Dataset has ${result.issues.length} problem(s): ${result.issues[0]?.message ?? "see data"}.`, data: result, isError: !result.ok };
    }),
  },
  {
    name: "start_render_job",
    description: "Queue a large render (thousands of rows, long exports) as a background job and get its jobId. Poll get_render_job until it completes.",
    inputSchema: { type: "object", properties: { report: reportProp, format: { enum: FORMATS }, parameters: { type: "object" }, data: { type: "object" } }, required: ["report", "format"] },
    readOnly: true,
    handler: guard(async (a: { report: unknown; format: string; parameters?: object; data?: object }, api) => {
      const job = await api.json("POST", "/api/v1/render/jobs", a);
      return { text: `Queued job ${job.jobId} (${job.status}).`, data: job };
    }),
  },
  {
    name: "get_render_job",
    description: "Status of a background render job. When it has completed, also returns the output (text formats inline, binary formats as base64 when small).",
    inputSchema: { type: "object", properties: { jobId: { type: "string" }, maxInlineKb: { type: "number" } }, required: ["jobId"] },
    readOnly: true,
    handler: guard(async (a: { jobId: string; maxInlineKb?: number }, api) => {
      const job = await api.json("GET", `/api/v1/render/jobs/${enc(a.jobId)}`);
      if (job.status !== "completed") return { text: `Job ${a.jobId} is ${job.status}.`, data: job };
      const out = await api.binary("GET", `/api/v1/render/jobs/${enc(a.jobId)}/output`);
      return { text: `Job ${a.jobId} completed: ${out.bytes.length} bytes.`, data: { job, output: await renderedOutput(job.format, out, a.maxInlineKb) } };
    }),
  },
  {
    name: "list_template_versions",
    description: "Version history of a stored template: version numbers, status (draft/published), dates and notes.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    readOnly: true,
    handler: guard(async (a: { id: string }, api) => {
      const versions = await api.json<any[]>("GET", `/api/v1/templates/${enc(a.id)}/versions`);
      return { text: `${versions.length} version(s) of ${a.id}.`, data: versions };
    }),
  },
  {
    name: "delete_template",
    description: "Permanently delete a stored template and all its versions. Destructive: only when the user explicitly asks.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    readOnly: false,
    destructive: true,
    handler: guard(async (a: { id: string }, api) => {
      await api.json("DELETE", `/api/v1/templates/${enc(a.id)}`);
      return { text: `Deleted template ${a.id}.` };
    }),
  },
  {
    name: "list_blocks",
    description: "Reusable report components saved on the server (the designer's \"My Components\"): ids, names and versions. Insert one into a report by copying its children with patch_report.",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    handler: guard(async (_a, api) => {
      const blocks = await api.json<any[]>("GET", "/api/v1/blocks");
      return { text: `${blocks.length} block(s).`, data: blocks };
    }),
  },
  {
    name: "get_block",
    description: "A reusable component's children (the components to insert) and its version history. Without `version`, returns the latest.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, version: { type: "number" } }, required: ["id"] },
    readOnly: true,
    handler: guard(async (a: { id: string; version?: number }, api) => {
      const versions = await api.json<any[]>("GET", `/api/v1/blocks/${enc(a.id)}/versions`);
      const version = a.version ?? Math.max(...versions.map((v) => v.version));
      const block = await api.json("GET", `/api/v1/blocks/${enc(a.id)}/versions/${version}`);
      return { text: `Block ${a.id} v${version}.`, data: { block, versions } };
    }),
  },
  {
    name: "save_block",
    description: "Save components as a reusable block (creates it, or adds a new version). Saving is a write: only when the user asks.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, children: { type: "array", items: { type: "object" }, description: "The components that make up the block." }, notes: { type: "string" } }, required: ["id", "name", "children"] },
    readOnly: false,
    handler: guard(async (a: { id: string; name: string; children: unknown[]; notes?: string }, api) => {
      await api.json("PUT", `/api/v1/blocks/${enc(a.id)}`, { name: a.name, children: a.children, notes: a.notes });
      return { text: `Saved block ${a.id}.` };
    }),
  },
  {
    name: "delete_block",
    description: "Permanently delete a reusable block. Reports that copied it keep their copy. Destructive: only when the user explicitly asks.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    readOnly: false,
    destructive: true,
    handler: guard(async (a: { id: string }, api) => {
      await api.json("DELETE", `/api/v1/blocks/${enc(a.id)}`);
      return { text: `Deleted block ${a.id}.` };
    }),
  },
  {
    name: "list_printer_profiles",
    description: "Saved printer and media setups (label stock, DPI, calibration offsets, receipt width) that reports can copy into report.print and report.page.",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    handler: guard(async (_a, api) => {
      const profiles = await api.json<any[]>("GET", "/api/v1/printer-profiles");
      return { text: `${profiles.length} printer profile(s).`, data: profiles };
    }),
  },
  {
    name: "save_printer_profile",
    description: "Save a printer/media setup for reuse: id (lowercase letters, digits, . _ -), name, print settings (as report.print) and page (as report.page). A write: only when the user asks.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, print: { type: "object" }, page: { type: "object" } }, required: ["id", "name", "print", "page"] },
    readOnly: false,
    handler: guard(async (a: { id: string; name: string; print: object; page: object }, api) => {
      const saved = await api.json("PUT", `/api/v1/printer-profiles/${enc(a.id)}`, { name: a.name, print: a.print, page: a.page });
      return { text: `Saved printer profile ${a.id}.`, data: saved };
    }),
  },
  {
    name: "delete_printer_profile",
    description: "Permanently delete a saved printer profile. Destructive: only when the user explicitly asks.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    readOnly: false,
    destructive: true,
    handler: guard(async (a: { id: string }, api) => {
      await api.json("DELETE", `/api/v1/printer-profiles/${enc(a.id)}`);
      return { text: `Deleted printer profile ${a.id}.` };
    }),
  },
  {
    name: "list_plugins",
    description: "Server plugins and their status: extra components, expression functions, data sources and renderers they add (also summarised in list_capabilities).",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    handler: guard(async (_a, api) => {
      const result = await api.json("GET", "/api/v1/plugins");
      return { text: `${result.plugins.length} plugin(s).`, data: result };
    }),
  },
];
