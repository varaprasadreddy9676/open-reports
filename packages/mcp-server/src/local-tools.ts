// Tools that only make sense when the MCP server runs on the user's machine: report files on disk,
// rendering straight to a file, and converting JasperReports JRXML (as the designer's import does).
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FORMATS, type ToolSpec } from "@reporting/ai-tools";
import { importJrxml, importJrxmlFolder, type ImportResult, type JrxmlFontMappings } from "@reporting/jrxml-import";

const reportProp = { type: "object", description: "A complete report definition (JSON)." };
const fontMappingsProp = { type: "object", description: "Optional exact PDF faces for JRXML fonts, e.g. { \"Arial\": { \"regular\": \"Helvetica\", \"bold\": \"Helvetica-Bold\" } }." };
const EXTENSIONS: Record<string, string> = { pdf: "pdf", docx: "docx", html: "html", xlsx: "xlsx", csv: "csv", zpl: "zpl", escpos: "bin" };

/** Expands ~ and makes the path absolute (relative paths resolve against the directory the client started us in). */
export const resolvePath = (input: string) => path.resolve(input.startsWith("~") ? path.join(os.homedir(), input.slice(1)) : input);

const failure = (error: unknown) => ({ text: `Error: ${error instanceof Error ? error.message : String(error)}`, isError: true });

function migrationSummary(result: ImportResult, limit = 25) {
  const needsWork = result.issues.filter((issue) => issue.status !== "converted");
  return {
    summary: result.summary,
    reviewItems: needsWork.slice(0, limit).map((issue) => ({ status: issue.status, feature: issue.feature, line: issue.line, message: issue.message, targetId: issue.targetId })),
    moreReviewItems: Math.max(0, needsWork.length - limit),
  };
}

async function jrxmlFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await jrxmlFiles(full));
    else if (/\.jrxml$/i.test(entry.name)) found.push(full);
  }
  return found;
}

export const LOCAL_TOOLS: ToolSpec[] = [
  {
    name: "open_report_file",
    description: "Read a report definition from a .json file on this computer (an exported Open Reports report, or one your application stores). Returns the report to use with the other tools.",
    inputSchema: { type: "object", properties: { path: { type: "string", description: "Path to the .json file; ~ is your home folder." } }, required: ["path"] },
    readOnly: true,
    async handler(a: { path: string }) {
      try {
        const file = resolvePath(a.path);
        const report = JSON.parse(await readFile(file, "utf8"));
        if (!report || report.schemaVersion !== "1.0" || !Array.isArray(report.sections)) return { text: `${file} is JSON but not an Open Reports definition (expected schemaVersion "1.0" and sections).`, isError: true };
        return { text: `Opened "${report.name ?? report.id}" from ${file}.`, data: report };
      } catch (error) { return failure(error); }
    },
  },
  {
    name: "save_report_file",
    description: "Write a report definition to a .json file on this computer, like the designer's Export → Report file. Creates folders as needed and overwrites an existing file. A write: only when the user asks.",
    inputSchema: { type: "object", properties: { path: { type: "string" }, report: reportProp }, required: ["path", "report"] },
    readOnly: false,
    async handler(a: { path: string; report: unknown }) {
      try {
        const file = resolvePath(a.path);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, `${JSON.stringify(a.report, null, 2)}\n`);
        return { text: `Saved the report to ${file}.`, data: { path: file, bytes: (await stat(file)).size } };
      } catch (error) { return failure(error); }
    },
  },
  {
    name: "render_to_file",
    description: "Render a report (inline or a stored templateId) and save the output file on this computer: pdf, docx, html, xlsx, csv, zpl or escpos. Use this when the user wants the actual document. Returns the saved path. A write.",
    inputSchema: {
      type: "object",
      properties: {
        report: reportProp, templateId: { type: "string" }, version: { type: "number" }, format: { enum: FORMATS },
        path: { type: "string", description: "Output file path. If it is a folder or omitted, a name is chosen from the report." },
        parameters: { type: "object" }, data: { type: "object" }, subreports: { type: "object" }, viewerState: { type: "object" },
      },
      required: ["format"],
    },
    readOnly: false,
    async handler(a: { report?: any; templateId?: string; version?: number; format: string; path?: string; parameters?: object; data?: object; subreports?: object; viewerState?: object }, api) {
      try {
        if (!a.report && !a.templateId) return { text: "Provide either report or templateId.", isError: true };
        const out = a.templateId
          ? await api.binary("POST", `/api/v1/templates/${encodeURIComponent(a.templateId)}/render`, { format: a.format, version: a.version, parameters: a.parameters, data: a.data, viewerState: a.viewerState })
          : await api.binary("POST", "/api/v1/render", { report: a.report, format: a.format, parameters: a.parameters, data: a.data, subreports: a.subreports, viewerState: a.viewerState });
        const name = `${(a.templateId ?? a.report?.id ?? "report").replace(/[^\w.-]+/g, "-")}.${EXTENSIONS[a.format] ?? a.format}`;
        let file = resolvePath(a.path ?? ".");
        const isFolder = !a.path || a.path.endsWith("/") || (await stat(file).then((s) => s.isDirectory()).catch(() => false));
        if (isFolder) file = path.join(file, name);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, out.bytes);
        return { text: `Saved ${a.format.toUpperCase()} to ${file} (${out.bytes.length} bytes, ${out.warnings ?? 0} warning(s)).`, data: { path: file, bytes: out.bytes.length, mimeType: out.mimeType, warnings: out.warnings } };
      } catch (error) { return failure(error); }
    },
  },
  {
    name: "import_jrxml",
    description: "Convert one JasperReports .jrxml source (a file path or the XML text) into an editable Open Reports definition, with the review list of features that need attention. SQL and Java are never run. Check the result with analyze_report and preview_report before relying on it.",
    inputSchema: { type: "object", properties: { path: { type: "string" }, source: { type: "string", description: "JRXML text, instead of path." }, fontMappings: fontMappingsProp }, required: [] },
    readOnly: true,
    async handler(a: { path?: string; source?: string; fontMappings?: JrxmlFontMappings }) {
      try {
        if (!a.path && !a.source) return { text: "Provide path or source.", isError: true };
        const file = a.path ? resolvePath(a.path) : undefined;
        const xml = a.source ?? await readFile(file!, "utf8");
        const result = importJrxml(xml, { sourceName: file ? path.basename(file) : undefined, fontMappings: a.fontMappings });
        if (!result.report) return { text: `Could not convert ${file ?? "the JRXML"}.`, data: migrationSummary(result), isError: true };
        const s = result.summary as Record<string, number>;
        return { text: `Converted "${result.report.name}": ${Object.entries(s).map(([k, v]) => `${v} ${k}`).join(", ")}.`, data: { report: result.report, ...migrationSummary(result) } };
      } catch (error) { return failure(error); }
    },
  },
  {
    name: "import_jrxml_folder",
    description: "Convert every .jrxml in a folder (and its subfolders) together, linking parent reports to their subreport files, and write one .report.json draft per source into outputDir. Returns a per-file summary. A write.",
    inputSchema: { type: "object", properties: { dir: { type: "string" }, outputDir: { type: "string" }, fontMappings: fontMappingsProp }, required: ["dir", "outputDir"] },
    readOnly: false,
    async handler(a: { dir: string; outputDir: string; fontMappings?: JrxmlFontMappings }) {
      try {
        const dir = resolvePath(a.dir);
        const outputDir = resolvePath(a.outputDir);
        const files = await jrxmlFiles(dir);
        if (!files.length) return { text: `No .jrxml files under ${dir}.`, isError: true };
        const sources = await Promise.all(files.map(async (file) => ({ path: path.relative(dir, file), xml: await readFile(file, "utf8") })));
        const result = importJrxmlFolder(sources, { fontMappings: a.fontMappings });
        await mkdir(outputDir, { recursive: true });
        const written = [];
        for (const entry of result.entries) {
          if (!entry.report) { written.push({ source: entry.path, error: entry.error ?? "not converted" }); continue; }
          const target = path.join(outputDir, `${entry.report.id}.report.json`);
          await writeFile(target, `${JSON.stringify(entry.report, null, 2)}\n`);
          written.push({ source: entry.path, file: target, summary: entry.summary, needsReview: entry.issues.filter((issue) => issue.status !== "converted").length });
        }
        return { text: `Converted ${result.converted} of ${files.length} file(s) into ${outputDir}${result.failed ? `; ${result.failed} failed` : ""}.`, data: { files: written } };
      } catch (error) { return failure(error); }
    },
  },
];
