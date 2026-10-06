import type { ParameterDefinition } from "./params.js";

export interface ServerOptions {
  /** Base URL of the Open Reports server, e.g. "https://reports.example.com". */
  server: string;
  /** Sent as `X-API-Key` when the server has API keys enabled. */
  apiKey?: string;
}

export type OutputFormat = "pdf" | "html" | "xlsx" | "csv" | "docx" | "zpl" | "escpos";

export interface ViewerState {
  sort?: { component: string; column: string; direction: "asc" | "desc" }[];
  toggle?: { component: string; keys: string[] }[];
}

export interface TemplateVersion {
  version: number;
  status: "draft" | "published";
  definition: { name?: string; parameters?: ParameterDefinition[] };
}

export class ReportServerError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "ReportServerError";
  }
}

function url(options: ServerOptions, path: string): string {
  return `${options.server.replace(/\/+$/, "")}${path}`;
}

function headers(options: ServerOptions, json = false): Record<string, string> {
  return { ...(json ? { "content-type": "application/json" } : {}), ...(options.apiKey ? { "x-api-key": options.apiKey } : {}) };
}

async function failure(response: Response): Promise<ReportServerError> {
  let message = `${response.status} ${response.statusText}`;
  let code: string | undefined;
  try {
    const body = (await response.json()) as { error?: { message?: string; code?: string } };
    message = body.error?.message ?? message;
    code = body.error?.code;
  } catch {
    // Not JSON: keep the status line.
  }
  return new ReportServerError(message, response.status, code);
}

/** The requested version, or the latest published one (what the render endpoint uses by default). */
export async function fetchTemplateVersion(options: ServerOptions, template: string, version?: number): Promise<TemplateVersion> {
  const id = encodeURIComponent(template);
  const response = await fetch(url(options, `/api/v1/templates/${id}/versions${version === undefined ? "" : `/${version}`}`), { headers: headers(options) });
  if (!response.ok) throw await failure(response);
  if (version !== undefined) return (await response.json()) as TemplateVersion;
  const versions = (await response.json()) as TemplateVersion[];
  const published = versions.filter((entry) => entry.status === "published").sort((a, b) => b.version - a.version)[0];
  if (!published) throw new ReportServerError(`Template "${template}" has no published version yet. Publish it in the designer first.`, 404, "NO_RENDERABLE_VERSION");
  return published;
}

export interface RenderRequest {
  template: string;
  format: OutputFormat;
  version?: number;
  parameters?: Record<string, unknown>;
  data?: Record<string, unknown>;
  /** Interactive choices such as a column sort, applied by the server before layout. */
  viewerState?: ViewerState;
}

/** Render a report definition owned by the calling application; no template lookup or server storage is involved. */
export interface RenderReportRequest {
  report: unknown;
  format: OutputFormat;
  parameters?: Record<string, unknown>;
  data?: Record<string, unknown>;
  viewerState?: ViewerState;
}

export async function renderReport(options: ServerOptions, request: RenderReportRequest): Promise<Blob> {
  const response = await fetch(url(options, "/api/v1/render"), {
    method: "POST",
    headers: headers(options, true),
    body: JSON.stringify({ report: request.report, format: request.format, parameters: request.parameters, data: request.data, viewerState: request.viewerState }),
  });
  if (!response.ok) throw await failure(response);
  return response.blob();
}

export async function renderTemplate(options: ServerOptions, request: RenderRequest): Promise<Blob> {
  const response = await fetch(url(options, `/api/v1/templates/${encodeURIComponent(request.template)}/render`), {
    method: "POST",
    headers: headers(options, true),
    body: JSON.stringify({ format: request.format, version: request.version, parameters: request.parameters, data: request.data, viewerState: request.viewerState }),
  });
  if (!response.ok) throw await failure(response);
  return response.blob();
}
