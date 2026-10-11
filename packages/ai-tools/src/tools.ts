import { ApiError } from "./api.js";
import { applyPatch, summarizeChanges, type PatchOp } from "./patch.js";
import { describeStructure } from "./bands.js";
import { FORMATS, guard, reportProp, subreportsProp, toBase64, viewerStateProp, type ToolSpec } from "./tool-kit.js";
import { MORE_TOOLS } from "./more-tools.js";

export type { ToolResult, ToolSpec } from "./tool-kit.js";

function summarizeAnalysis(a: any): string {
  const errors = (a.issues ?? []).filter((i: any) => i.severity === "error");
  const warns = (a.warnings ?? []).length + (a.issues ?? []).filter((i: any) => i.severity === "warning").length;
  if (a.stage === "schema") return `Invalid report: ${a.issues.length} schema problem(s). First: ${a.issues[0]?.path || "(root)"}: ${a.issues[0]?.message}`;
  return `${a.valid ? "Valid" : `${errors.length} error(s)`}; ${a.pageCount ?? "?"} page(s); ${warns} warning(s); ${(a.decisions ?? []).length} pagination decision(s).`;
}

const CORE_TOOLS: ToolSpec[] = [
  {
    name: "get_report_schema",
    description: "The JSON Schema of a report definition. Read this before writing or changing a report. Reports are JSON; you edit them with patch_report and never compute values yourself - the engine does that.",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    handler: guard(async (_a, api) => ({ text: "Report definition JSON Schema.", data: await api.json("GET", "/api/v1/schema") })),
  },
  {
    name: "list_capabilities",
    description: "Output formats and which component types each supports, installed fonts and scripts, server secret NAMES (never values), plugin components/functions/datasources.",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    handler: guard(async (_a, api) => ({ text: "Server capabilities.", data: await api.json("GET", "/api/v1/capabilities") })),
  },
  {
    name: "list_examples",
    description: "Names and descriptions of ready-made example reports (invoice, lab report, labels, sticker sheet, ...). Start from the closest example instead of writing from scratch.",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    handler: guard(async (_a, api) => {
      const list = await api.json<{ name: string; description?: string }[]>("GET", "/api/v1/examples");
      return { text: `${list.length} examples.`, data: list };
    }),
  },
  {
    name: "get_example",
    description: "Fetch one example report definition by name.",
    inputSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    readOnly: true,
    handler: guard(async (a: { name: string }, api) => ({ text: `Example "${a.name}".`, data: await api.json("GET", `/api/v1/examples/${encodeURIComponent(a.name)}`) })),
  },
  {
    name: "describe_report",
    description: "A plain-text outline of a report: datasets, groups, and every band (report/page/group headers and footers, detail, ...) in print order with its print rules and the ids of the components inside it. Each band line starts with the reference to use in patch_report paths, e.g. @groupFooter:byRegion. Read this before changing a report's structure.",
    inputSchema: { type: "object", properties: { report: reportProp }, required: ["report"] },
    readOnly: true,
    handler: guard(async (a: { report: unknown }) => ({ text: describeStructure((a.report ?? {}) as Record<string, any>) })),
  },
  {
    name: "analyze_report",
    description: "Validate AND paginate a report without rendering: schema/expression problems, page count, and the pagination decision log (why content moved to the next page, with suggested fixes). Use after every change.",
    inputSchema: { type: "object", properties: { report: reportProp, parameters: { type: "object" }, data: { type: "object", description: "Optional inline datasets keyed by dataset id." }, subreports: subreportsProp }, required: ["report"] },
    readOnly: true,
    handler: guard(async (a: { report: unknown; parameters?: object; data?: object; subreports?: object }, api) => {
      const analysis = await api.json("POST", "/api/v1/analyze", a);
      return { text: summarizeAnalysis(analysis), data: analysis };
    }),
  },
  {
    name: "validate_report",
    description: "Alias of analyze_report focused on validity. Returns issues with paths and 'did you mean' suggestions.",
    inputSchema: { type: "object", properties: { report: reportProp }, required: ["report"] },
    readOnly: true,
    handler: guard(async (a: { report: unknown }, api) => {
      const analysis = await api.json("POST", "/api/v1/analyze", { report: a.report });
      return { text: summarizeAnalysis(analysis), data: { valid: analysis.valid, issues: analysis.issues } };
    }),
  },
  {
    name: "patch_report",
    description:
      "Change a report with RFC 6902 JSON Patch operations (add, replace, remove, move, copy, test). Paths may use a component id instead of indexes: \"#title/style/fontSize\", \"#items/columns/-\"; and a band reference for bands: \"@groupFooter:byRegion/children/-\", \"@detail/keepTogether\", \"@pageFooter:first/children/0\" (see describe_report). The patch is atomic: if any op fails nothing changes. Returns the new report, a list of component-level changes, and an analysis. Prefer small patches. This is the ONLY way to modify a report.",
    inputSchema: {
      type: "object",
      properties: {
        report: reportProp,
        ops: { type: "array", items: { type: "object", properties: { op: { enum: ["add", "replace", "remove", "move", "copy", "test"] }, path: { type: "string" }, from: { type: "string" }, value: {} }, required: ["op", "path"] } },
        analyze: { type: "boolean", description: "Also validate and paginate the result (default true)." },
      },
      required: ["report", "ops"],
    },
    readOnly: true,
    handler: guard(async (a: { report: unknown; ops: PatchOp[]; analyze?: boolean }, api) => {
      const r = applyPatch(a.report, a.ops);
      if (!r.ok) return { text: `Patch rejected at op ${r.errors[0]!.index}: ${r.errors[0]!.message}. The report is unchanged.`, data: { ok: false, errors: r.errors }, isError: true };
      const summary = summarizeChanges(a.report, r.doc);
      let analysis: any;
      if (a.analyze !== false) analysis = await api.json("POST", "/api/v1/analyze", { report: r.doc });
      return { text: `Applied ${a.ops.length} op(s): ${summary.join("; ") || "no visible change"}.${analysis ? " " + summarizeAnalysis(analysis) : ""}`, data: { ok: true, report: r.doc, changes: summary, analysis } };
    }),
  },
  {
    name: "render_report",
    description: "Render a report (inline definition or stored template, optionally a specific version) to pdf, docx (editable Word), html, xlsx, csv, zpl (Zebra labels) or escpos (thermal receipts). Text formats (html, csv, zpl) return their content; binary formats return size and a base64 payload when small. To check what a page shows, use preview_report; to save the file, use render_to_file where available. Rendering is deterministic: never estimate values or layout yourself.",
    inputSchema: {
      type: "object",
      properties: { report: reportProp, templateId: { type: "string" }, version: { type: "number", description: "Template version (default: latest published)." }, format: { enum: FORMATS }, parameters: { type: "object" }, data: { type: "object", description: "Datasets keyed by dataset id, replacing the report's own data." }, subreports: subreportsProp, viewerState: viewerStateProp, maxInlineKb: { type: "number" } },
      required: ["format"],
    },
    readOnly: true,
    handler: guard(async (a: { report?: unknown; templateId?: string; version?: number; format: string; parameters?: object; data?: object; subreports?: object; viewerState?: object; maxInlineKb?: number }, api) => {
      if (!a.report && !a.templateId) return { text: "Provide either report or templateId.", isError: true };
      const path = a.templateId ? `/api/v1/templates/${encodeURIComponent(a.templateId)}/render` : "/api/v1/render";
      const body = a.templateId
        ? { format: a.format, version: a.version, parameters: a.parameters, data: a.data, viewerState: a.viewerState }
        : { report: a.report, format: a.format, parameters: a.parameters, data: a.data, subreports: a.subreports, viewerState: a.viewerState };
      const out = await api.binary("POST", path, body);
      const limit = (a.maxInlineKb ?? 512) * 1024;
      const textual = ["html", "csv", "zpl"].includes(a.format);
      const data: Record<string, unknown> = { mimeType: out.mimeType, bytes: out.bytes.length, warnings: out.warnings };
      if (textual) data.text = new TextDecoder().decode(out.bytes.slice(0, 40_000));
      else if (out.bytes.length <= limit) data.base64 = toBase64(out.bytes);
      return { text: `Rendered ${a.format.toUpperCase()}: ${out.bytes.length} bytes, ${out.warnings ?? 0} warning(s).`, data };
    }),
  },
  {
    name: "list_templates",
    description: "Stored report templates with their status and current version.",
    inputSchema: { type: "object", properties: {} },
    readOnly: true,
    handler: guard(async (_a, api) => {
      const list = await api.json<any[]>("GET", "/api/v1/templates");
      return { text: `${list.length} template(s).`, data: list };
    }),
  },
  {
    name: "get_template",
    description: "Fetch a stored template's report definition (latest version unless `version` is given).",
    inputSchema: { type: "object", properties: { id: { type: "string" }, version: { type: "number" } }, required: ["id"] },
    readOnly: true,
    handler: guard(async (a: { id: string; version?: number }, api) => {
      const id = encodeURIComponent(a.id);
      const version = a.version ?? (await api.json("GET", `/api/v1/templates/${id}`)).currentVersion;
      const v = await api.json("GET", `/api/v1/templates/${id}/versions/${version}`);
      return { text: `Template ${a.id} v${version} (${v.status}).`, data: v };
    }),
  },
  {
    name: "save_template",
    description: "Save a report as a template: creates it, or adds a new DRAFT version if it exists. Published versions are immutable, so this never alters one. Saving is a write: only do it when the user asked.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, report: reportProp }, required: ["id", "report"] },
    readOnly: false,
    handler: guard(async (a: { id: string; name?: string; report: any }, api) => {
      const id = encodeURIComponent(a.id);
      try {
        const rec = await api.json("POST", "/api/v1/templates", { id: a.id, name: a.name ?? a.report?.name ?? a.id, definition: a.report });
        return { text: `Created template ${a.id} (v${rec.currentVersion}, draft).`, data: rec };
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 409) throw e;
        const rec = await api.json("PUT", `/api/v1/templates/${id}`, { definition: a.report });
        return { text: `Saved ${a.id} as new draft v${rec.currentVersion}.`, data: rec };
      }
    }),
  },
  {
    name: "publish_template",
    description: "Publish a template version, making it immutable and the one used for rendering by id. Only on explicit user request.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, version: { type: "number" } }, required: ["id", "version"] },
    readOnly: false,
    handler: guard(async (a: { id: string; version: number }, api) => {
      const v = await api.json("POST", `/api/v1/templates/${encodeURIComponent(a.id)}/versions/${a.version}/publish`);
      return { text: `Published ${a.id} v${a.version}.`, data: v };
    }),
  },
];

/** Every tool: report authoring and rendering first, then data, storage and server tools. */
export const TOOLS: ToolSpec[] = [...CORE_TOOLS, ...MORE_TOOLS];

export function findTool(name: string): ToolSpec | undefined {
  return TOOLS.find((t) => t.name === name);
}

/** System prompt shared by MCP clients (as a prompt) and the designer's AI bar. */
export const AUTHORING_GUIDE = `You edit report definitions: renderer-neutral JSON that a deterministic engine turns into PDF, HTML, Excel, CSV and label printer output.

Rules
1. Never compute totals, dates or layout yourself - write an expression or binding and let the engine evaluate it.
2. Change reports ONLY with patch_report (small, id-addressed JSON Patch). Address components as "#id/..." and bands as "@type[:qualifier]/..." instead of array indexes.
3. After every change call analyze_report. Fix errors and read pagination decisions: they say why content moved and offer fixes (keepTogether, repeatHeaderOnPageBreak, minRowsAfterBreak, ...).
4. Start from list_examples/get_example when the user wants a common document (invoice, lab report, label, receipt, sticker sheet).
5. Units: component sizes are points; label sheet sizes are millimetres. Bind data with data.<dataset>.<field>; inside tables and repeaters use row.<field>.
6. Never put secrets in a report. REST datasets use {{secrets.NAME}}; check list_capabilities for the names that exist.
7. Do not save, publish or delete unless the user asks. Explain what you changed in plain language.
8. Check your work the way a person would: preview_report shows the text of every page, so confirm the content, page breaks and repeated headers before you say a report is done.
9. Before binding fields from a REST, SQL or CSV source, run test_dataset to see the real field names and sample rows.
10. When the MCP server runs on the user's computer you can also open_report_file / save_report_file, render_to_file (the actual PDF, Word or Excel file), and import_jrxml / import_jrxml_folder to migrate JasperReports.

Bands
A report's "sections" are bands; describe_report lists them in order with their references.
- reportHeader / reportFooter print once (title block; grand totals, signatures). dataHeader / dataFooter print once around the records.
- pageHeader / pageFooter / background repeat on every page. Variants use appliesTo: first, last, odd, even (e.g. @pageFooter:last); the band without appliesTo is the fallback. page.number and page.total work here.
- detail prints once per record of its dataset (row.<field>). A detail band holding only a table over the same dataset prints the table once instead.
- groupHeader / groupFooter print around each group instance; groups are declared in report.groups ({id, dataset, by, sort, repeatHeader, newPage, keepTogether}) and bands point at them with groupId (@groupHeader:byRegion). Inside them use group.key, group.count, group.rows: a group total is a text with expression sumBy(group.rows, "amount") added at @groupFooter:<groupId>/children/-.
- child bands (parent: band id) print right after their parent; noData prints when the dataset is empty.
- Print rules on a band: newPageBefore, newPageAfter, keepTogether, keepWithNext, allowSplit, printAtBottom (anchor above the page footer), repeatEveryPage (group headers), suppressWhenBlank, visibleWhen or rules.
To add a band, add a section object with "type" (and groupId / appliesTo as needed) to /sections at the position it should print, then check analyze_report.`;
