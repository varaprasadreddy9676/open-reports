import { ApiError, type ReportApi } from "./api.js";

export interface ToolResult {
  /** Short text for the model. */
  text: string;
  /** Structured payload (the model sees it serialised). */
  data?: unknown;
  isError?: boolean;
}

export interface ToolSpec<A = any> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Pure read-only tools can be auto-approved by clients. */
  readOnly: boolean;
  /** Deletes stored data (templates, blocks, printer profiles). Clients should confirm first. */
  destructive?: boolean;
  handler(args: A, api: ReportApi): Promise<ToolResult>;
}

export const reportProp = { type: "object", description: "A complete report definition (JSON)." };
/** Every output format the engine renders (the designer offers the same list). */
export const FORMATS = ["pdf", "docx", "html", "xlsx", "csv", "zpl", "escpos"];

/** Child reports keyed by the parent subreport component's reportId, each with optional datasets. */
export const subreportsProp = { type: "object", description: "Optional child reports keyed by the subreport component's reportId: { [reportId]: { report: <definition>, data?: { datasetId: rows } } }. Children bundled in report.subreports are used automatically.", additionalProperties: { type: "object", properties: { report: { type: "object" }, data: { type: "object" } }, required: ["report"] } };
export const viewerStateProp = { type: "object", description: "Viewer choices applied before layout, as in the interactive viewer: { sort: [{ component, column, direction: \"asc\"|\"desc\" }], toggle: [{ component, keys }] }." };

export function toBase64(bytes: Uint8Array): string {
  const B = (globalThis as any).Buffer;
  if (B) return B.from(bytes).toString("base64");
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

const fail = (e: unknown): ToolResult => {
  if (e instanceof ApiError) return { text: `Error ${e.status}: ${e.message}`, data: e.details, isError: true };
  return { text: `Error: ${e instanceof Error ? e.message : String(e)}`, isError: true };
};
export const guard = <A>(fn: (a: A, api: ReportApi) => Promise<ToolResult>) => async (a: A, api: ReportApi) => {
  try {
    return await fn(a, api);
  } catch (e) {
    return fail(e);
  }
};

