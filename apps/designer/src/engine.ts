import QRCode from "qrcode";
import { parseReportDefinition } from "@reporting/schema";
import {
  DataSourceRegistry,
  InlineDataSource,
  resolveReport,
  validateReport,
  walkComponents,
  type PageSectionResolver,
  type ResolvedReport,
} from "@reporting/core";
import { isDataLossWarningCode, layoutStructure, paginate, type PaginatedReport, type PositionedNode, type StructureLayout } from "@reporting/layout";
import { findByPath, type Doc } from "./model/ops";
import { datasetValue } from "./lib/fields";
import { checkSchemaPreview, schemaIssueMessage } from "./lib/schema-preview";
import { api } from "./lib/api";

export interface Fix {
  label: string;
  /** Patch applied to the component `id` (or the report when id is "report"). */
  id: string;
  patch: Record<string, unknown>;
}

export interface Problem {
  severity: "error" | "warning" | "suggestion";
  code: string;
  message: string;
  componentId?: string;
  datasetId?: string;
  path?: string;
  fix?: Fix;
}

export interface Capabilities {
  sqlConnections?: string[];
  customComponents?: { kind: string; description?: string; props?: Record<string, string> }[];
  formats: { id: string; supports: string[] }[];
  fonts: string[];
  fontFaces?: Record<string, string[]>;
  defaultFont?: string | null;
  scriptFonts: Record<string, string>;
  secrets: string[];
}

export interface EngineOptions {
  /** Extra example records shown per detail band in the structure view. */
  ghosts?: number;
  sampleRows?: number;
  target?: string;
  capabilities?: Capabilities;
}

export interface EngineResult {
  resolved?: ResolvedReport;
  paginated?: PaginatedReport;
  /** Every band once, stacked (the structure view). */
  structure?: StructureLayout;
  resolvePageSection?: PageSectionResolver;
  problems: Problem[];
  paginationSource?: "pdf" | "estimate";
}

/** Turns every dataset into an inline dataset, using sample data where provided.
 * The designer renders and previews entirely against inline data, so the canvas
 * never depends on a live REST/SQL source being reachable. */
export function withSampleData(doc: Doc, sample: Record<string, unknown>): Doc {
  const next = structuredClone(doc);
  next.datasets = (next.datasets ?? []).map((ds: any) => {
    if (ds.id in sample) return { id: ds.id, source: "inline", query: { data: sample[ds.id] } };
    if (ds.source === "inline") return ds;
    return { id: ds.id, source: "inline", query: { data: null } };
  });
  return next;
}

function truncate(value: unknown, n: number): { value: unknown; cut: boolean } {
  if (Array.isArray(value)) return value.length > n ? { value: value.slice(0, n), cut: true } : { value, cut: false };
  if (value && typeof value === "object") {
    let cut = false;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (Array.isArray(v) && v.length > n) {
        out[k] = v.slice(0, n);
        cut = true;
      } else out[k] = v;
    }
    return { value: out, cut };
  }
  return { value, cut: false };
}

const registry = new DataSourceRegistry();
registry.register(new InlineDataSource());

const SCRIPT_RANGES: [string, RegExp][] = [
  ["devanagari", /[ऀ-ॿ]/],
  ["telugu", /[ఀ-౿]/],
  ["kannada", /[ಀ-೿]/],
  ["tamil", /[஀-௿]/],
  ["arabic", /[؀-ۿݐ-ݿ]/],
];

const MM = 25.4 / 72;

export async function runEngine(doc: Doc, sample: Record<string, unknown>, parameters: Record<string, unknown>, opts: EngineOptions = {}, onEstimate?: (result: EngineResult) => void): Promise<EngineResult> {
  const problems: Problem[] = [];
  const parsed = parseReportDefinition(doc);
  if (!parsed.valid) {
    for (const i of parsed.issues) {
      const loc = findByPath(doc, i.path.replace(/\./g, ".").replace(/\.(\d+)/g, "[$1]"));
      problems.push({ severity: "error", code: i.code, message: `${i.path ? i.path + ": " : ""}${i.message}`, path: i.path, componentId: loc?.comp.id });
    }
    return { problems };
  }

  for (const [index, ds] of parsed.report.datasets.entries()) {
    if (ds.source !== "inline" && !(ds.id in sample)) {
      problems.push({ severity: "suggestion", code: "NO_SAMPLE_DATA", message: `Dataset "${ds.id}" (${ds.source}) has no sample data yet. Open the Data tab and run Test to load a preview.` });
    }
    if (ds.schema) {
      const check = checkSchemaPreview(ds.schema, datasetValue(doc, sample, ds.id));
      const severity = ds.schema.onMismatch === "error" ? "error" as const : "warning" as const;
      for (const issue of check.issues.slice(0, 12)) problems.push({
        severity, code: "DATASET_SCHEMA_MISMATCH", datasetId: ds.id,
        path: `datasets[${index}].schema`, message: `${ds.id}: ${schemaIssueMessage(issue)}`,
      });
      const hidden = Math.max(0, check.issues.length - 12) + check.omittedIssues;
      if (hidden) problems.push({ severity, code: "DATASET_SCHEMA_MISMATCH", datasetId: ds.id, path: `datasets[${index}].schema`, message: `${ds.id}: ${hidden} more mismatches; open the dataset to inspect its fields.` });
    }
  }

  const validation = validateReport(parsed.report, {
    targetRenderers: opts.target && opts.target !== "pdf" && opts.target !== "html" && opts.capabilities ? opts.capabilities.formats.filter((f) => f.id === opts.target) : undefined,
  });
  for (const i of validation.issues) {
    const loc = findByPath(doc, i.path);
    problems.push({ severity: i.severity, code: i.code, message: i.message, path: i.path, componentId: i.componentId ?? loc?.comp.id });
  }

  // Design-time sample: limited rows so a 5,000-row dataset doesn't slow the canvas (Preview renders everything).
  let effectiveSample = sample;
  let truncated = false;
  if (opts.sampleRows && opts.sampleRows > 0) {
    effectiveSample = { ...sample };
    for (const ds of parsed.report.datasets) {
      const v = datasetValue(doc, sample, ds.id);
      if (v === undefined || v === null) continue;
      const t = truncate(v, opts.sampleRows);
      if (t.cut) {
        truncated = true;
        effectiveSample[ds.id] = t.value;
      }
    }
  }

  const effective = withSampleData(doc, effectiveSample);
  const reparsed = parseReportDefinition(effective);
  if (!reparsed.valid) return { problems };

  try {
    const pipeline = await resolveReport(reparsed.report, { registry, parameters, tolerant: true });
    // Dataset contract results are already listed above, one navigable problem per mismatch.
    const contractCodes = new Set(["DATASET_SHAPE_MISMATCH", "DATASET_SHAPE_PARTIALLY_CHECKED"]);
    for (const issue of pipeline.issues) if (!contractCodes.has(issue.code)) problems.push({ severity: "error", code: issue.code, message: issue.message, path: issue.path });
    for (const w of pipeline.resolved.warnings) {
      if (contractCodes.has(w.code)) continue;
      problems.push({ severity: w.code === "COMPONENT_ERROR" ? "error" : w.code === "UNKNOWN_CUSTOM_COMPONENT" ? "suggestion" : "warning", code: w.code, message: w.message, path: w.path, componentId: w.componentId });
    }
    let paginated = paginate(pipeline.resolved, { resolvePageDependentSection: pipeline.resolvePageSection });
    let paginationSource: EngineResult["paginationSource"] = "estimate";
    let structure: StructureLayout | undefined;
    try {
      const d = await resolveReport(reparsed.report, { registry, parameters, tolerant: true, design: { ghosts: opts.ghosts ?? 0 } });
      structure = layoutStructure(d.resolved, reparsed.report.sections);
    } catch {
      /* the structure view falls back to the paginated pages */
    }
    onEstimate?.({ resolved: pipeline.resolved, paginated, structure, resolvePageSection: pipeline.resolvePageSection, problems: [...problems], paginationSource });
    try {
      const analyzed = await api.analyze(effective, parameters);
      if (analyzed.paginated) {
        paginated = analyzed.paginated;
        paginationSource = "pdf";
      } else {
        problems.push({ severity: "warning", code: "PDF_PAGINATION_UNAVAILABLE", message: "Using estimated text measurements because the reporting server did not return a PDF page layout." });
      }
    } catch (error) {
      problems.push({ severity: "warning", code: "PDF_PAGINATION_UNAVAILABLE", message: `Using estimated text measurements because PDF pagination could not be reached: ${error instanceof Error ? error.message : String(error)}` });
    }
    for (const w of paginated.warnings) {
      if (!pipeline.resolved.warnings.some((x) => x.code === w.code && x.message === w.message)) {
        problems.push({ severity: isDataLossWarningCode(w.code) ? "error" : "warning", code: w.code, message: w.message, path: w.path, componentId: w.path });
      }
    }
    if (truncated) {
      problems.push({ severity: "suggestion", code: "SAMPLE_ROWS", message: `Design view shows the first ${opts.sampleRows} sample rows for speed. Preview renders every row with the real pagination engine.` });
    }
    analyse(doc, pipeline.resolved, paginated, problems, opts);
    return { resolved: pipeline.resolved, paginated, structure, resolvePageSection: pipeline.resolvePageSection, problems, paginationSource };
  } catch (err) {
    problems.push({ severity: "error", code: "ENGINE_FAILED", message: err instanceof Error ? err.message : String(err) });
    return { problems };
  }
}

function* allNodes(nodes: PositionedNode[]): Generator<PositionedNode> {
  for (const n of nodes) {
    yield n;
    if (n.children) yield* allNodes(n.children);
  }
}

/** Designer-level lint: layout, print and renderer-specific checks that go beyond schema validity. */
function analyse(doc: Doc, resolved: ResolvedReport, paginated: PaginatedReport, problems: Problem[], opts: EngineOptions): void {
  const pageCount = paginated.pages.length;
  const contentWidth = paginated.pageSize.width - paginated.margin.left - paginated.margin.right;

  // table spans many pages without header repeat
  const walk = (list: any[]) => {
    for (const c of list ?? []) {
      if (c.type === "table" && pageCount > 1 && c.repeatHeaderOnPageBreak === false) {
        problems.push({ severity: "suggestion", code: "REPEAT_HEADER", message: `Table "${c.id}" spans ${pageCount} pages; enable "Repeat header on every page".`, componentId: c.id, fix: { label: "Repeat header", id: c.id, patch: { repeatHeaderOnPageBreak: true } } });
      }
      for (const k of ["children", "header", "footer", "otherwise"]) if (Array.isArray(c[k])) walk(c[k]);
    }
  };
  for (const s of doc.sections ?? []) walk(s.children);

  const seen = new Set<string>();
  for (const page of paginated.pages) {
    for (const n of allNodes([...page.header, ...page.content, ...page.footer])) {
      const c = n.component as any;
      const id = c.id as string | undefined;
      if (!id || seen.has(id)) continue;
      seen.add(id);

      if (n.box.width > contentWidth + 0.5 && c.type !== "pageBreak") {
        const over = ((n.box.width - contentWidth) * MM).toFixed(1);
        problems.push({ severity: "error", code: "WIDER_THAN_PAGE", message: `"${id}" exceeds the printable width by ${over} mm.`, componentId: id, fix: { label: "Fit to printable width", id, patch: { width: Math.max(8, Math.floor(contentWidth - Math.max(0, n.box.x - paginated.margin.left))) } } });
      }
      if ((c.x !== undefined || c.y !== undefined) && n.box.width <= contentWidth + 0.5 && c.type !== "pageBreak") {
        const left = paginated.margin.left;
        const right = paginated.pageSize.width - paginated.margin.right;
        if (n.box.x < left - 0.5 || n.box.x + n.box.width > right + 0.5) {
          problems.push({ severity: "error", code: "OUTSIDE_PRINTABLE_WIDTH", message: `"${id}" extends outside the printable page width. Move it inward or reduce its width.`, componentId: id });
        }
      }

      if (c.type === "barcode" && c.value) {
        const modules = 11 * (String(c.value).length + 3) + 13;
        const recMm = modules * 0.25;
        const widthMm = n.box.width * MM;
        if (widthMm < recMm) {
          problems.push({
            severity: "warning",
            code: "BARCODE_TOO_SMALL",
            message: `Barcode "${id}" may not scan reliably: it is ${widthMm.toFixed(1)} mm wide; Code 128 for ${String(c.value).length} characters needs about ${recMm.toFixed(1)} mm.`,
            componentId: id,
            fix: { label: `Widen to ${Math.ceil(recMm)} mm`, id, patch: { width: Math.ceil(recMm / MM) } },
          });
        }
      }
      if (c.type === "qrcode" && c.value) {
        try {
          const size = QRCode.create(String(c.value), { errorCorrectionLevel: "M" }).modules.size;
          const recMm = size * 0.33;
          const actual = Math.min(n.box.width, n.box.height) * MM;
          if (actual < recMm) {
            problems.push({
              severity: "warning",
              code: "QR_TOO_SMALL",
              message: `QR code "${id}" is ${actual.toFixed(1)} mm; with ${size} modules it should be at least ${recMm.toFixed(1)} mm to scan reliably.`,
              componentId: id,
              fix: { label: `Enlarge to ${Math.ceil(recMm)} mm`, id, patch: { width: Math.ceil(recMm / MM), height: Math.ceil(recMm / MM) } },
            });
          }
        } catch {
          /* value too long for a QR code */
          problems.push({ severity: "error", code: "QR_TOO_LONG", message: `QR code "${id}" has too much data to encode.`, componentId: id });
        }
      }
    }
  }

  // The label/receipt print profile
  const print = doc.print;
  if (print?.safeMargin) {
    const m = (print.safeMargin as number) / MM;
    for (const page of paginated.pages) {
      for (const n of allNodes(page.content)) {
        const id = (n.component as any).id as string | undefined;
        if (id && (n.box.x < m - 0.5 || n.box.y < m - 0.5 || n.box.x + n.box.width > paginated.pageSize.width - m + 0.5 || n.box.y + n.box.height > paginated.pageSize.height - m + 0.5)) {
          problems.push({ severity: "warning", code: "OUTSIDE_SAFE_AREA", message: `"${id}" is outside the printer's ${print.safeMargin} mm safe area and may be clipped.`, componentId: id });
        }
      }
    }
  }

  // Fonts and scripts on the render server
  const caps = opts.capabilities;
  if (caps) {
    const fonts = new Set(caps.fonts.map((f) => f.toLowerCase()));
    const used = new Set<string>();
    for (const c of walkComponents(resolved)) {
      const family = (c.style as any)?.fontFamily as string | undefined;
      if (family) used.add(family);
    }
    if (doc.theme?.fonts?.body) used.add(doc.theme.fonts.body);
    for (const f of used) {
      if (!fonts.has(f.toLowerCase())) problems.push({ severity: "warning", code: "FONT_MISSING", message: `Font "${f}" is not installed on the render server; Noto Sans will be used and pagination may change.` });
    }
    const textBlob = [...walkComponents(resolved)].map((c: any) => c.text ?? "").join("");
    for (const [script, re] of SCRIPT_RANGES) {
      if (re.test(textBlob) && !caps.scriptFonts[script]) {
        problems.push({ severity: "warning", code: "SCRIPT_FONT_MISSING", message: `This report contains ${script} text but "Noto Sans ${script[0]!.toUpperCase()}${script.slice(1)}" is not installed on the render server. The PDF would show missing glyphs.` });
      }
    }
  }

  // Renderer-aware warnings
  const target = opts.target;
  if (target && caps && target !== "pdf" && target !== "html") {
    const supports = new Set(caps.formats.find((f) => f.id === target)?.supports ?? []);
    if (!supports.has("*")) {
      const reported = new Set<string>();
      for (const c of walkComponents(resolved)) {
        if (["container", "row", "column", "grid", "repeater", "group", "keepTogether", "spacer", "pageBreak"].includes(c.type) && target !== "csv") continue;
        if (!supports.has(c.type) && !reported.has(c.type)) {
          reported.add(c.type);
          problems.push({ severity: "warning", code: "UNSUPPORTED_FOR_TARGET", message: `${target.toUpperCase()} does not support "${c.type}" components; they will be skipped.` });
        }
      }
      if (target === "xlsx") {
        for (const c of walkComponents(resolved)) {
          if ((c as any).layout === "absolute") {
            problems.push({ severity: "warning", code: "ABSOLUTE_IN_XLSX", message: `Absolute-positioned content (${(c as any).id ?? c.type}) cannot be reproduced exactly in Excel; only the table data is exported.` });
            break;
          }
        }
      }
    }
  }
}
