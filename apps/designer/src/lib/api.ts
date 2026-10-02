/** Thin client for the reporting server. Same-origin by default (Vite proxies /api to the server in dev). */
import type { PaginatedReport } from "@reporting/layout";
const KEY = "designer.apiKey";
const BASE = "designer.apiBase";

export const settings = {
  get apiKey() {
    try {
      return localStorage.getItem(KEY) ?? "";
    } catch {
      return "";
    }
  },
  set apiKey(v: string) {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* ignore */
    }
  },
  get apiBase() {
    try {
      return localStorage.getItem(BASE) ?? "";
    } catch {
      return "";
    }
  },
  set apiBase(v: string) {
    try {
      localStorage.setItem(BASE, v);
    } catch {
      /* ignore */
    }
  },
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (settings.apiKey) headers.set("x-api-key", settings.apiKey);
  let res: Response;
  try {
    res = await fetch(`${settings.apiBase}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Cannot reach the reporting server. Start it with `pnpm dev` (API on :4000).", 0, "NETWORK");
  }
  if (!res.ok) {
    let body: any = undefined;
    try {
      body = await res.json();
    } catch {
      /* not json */
    }
    throw new ApiError(body?.error?.message ?? `Request failed (${res.status})`, res.status, body?.error?.code, body?.error?.details);
  }
  return res;
}

export interface TemplateRecord {
  id: string;
  name: string;
  description?: string;
  currentVersion: number;
  status: "draft" | "published" | "archived";
  updatedAt: string;
}

export interface VersionRecord {
  templateId: string;
  version: number;
  definition: any;
  status: "draft" | "published";
  createdAt: string;
  notes?: string;
}

export const api = {
  async listTemplates(): Promise<TemplateRecord[]> {
    return (await request("/api/v1/templates")).json();
  },
  async getTemplate(id: string): Promise<TemplateRecord> {
    return (await request(`/api/v1/templates/${encodeURIComponent(id)}`)).json();
  },
  async getVersion(id: string, version: number): Promise<VersionRecord> {
    return (await request(`/api/v1/templates/${encodeURIComponent(id)}/versions/${version}`)).json();
  },
  async listVersions(id: string): Promise<VersionRecord[]> {
    return (await request(`/api/v1/templates/${encodeURIComponent(id)}/versions`)).json();
  },
  async createTemplate(id: string, name: string, definition: unknown): Promise<TemplateRecord> {
    return (await request("/api/v1/templates", { method: "POST", body: JSON.stringify({ id, name, definition }) })).json();
  },
  async saveTemplate(id: string, name: string, definition: unknown): Promise<TemplateRecord> {
    return (await request(`/api/v1/templates/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ name, definition }) })).json();
  },
  async publish(id: string, version: number, notes: string): Promise<VersionRecord> {
    return (await request(`/api/v1/templates/${encodeURIComponent(id)}/versions/${version}/publish`, { method: "POST", body: JSON.stringify({ notes }) })).json();
  },
  async validate(report: unknown): Promise<{ valid: boolean; issues: { severity?: string; code: string; message: string; path?: string }[] }> {
    return (await request("/api/v1/validate", { method: "POST", body: JSON.stringify({ report }) })).json();
  },
  async deleteTemplate(id: string): Promise<void> {
    await request(`/api/v1/templates/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async capabilities(): Promise<{ formats: { id: string; supports: string[] }[]; fonts: string[]; scriptFonts: Record<string, string>; secrets: string[] }> {
    return (await request("/api/v1/capabilities")).json();
  },
  async listBlocks(): Promise<{ id: string; name: string; children: any[] }[]> {
    return (await request("/api/v1/blocks")).json();
  },
  async putBlock(id: string, name: string, children: unknown[]): Promise<void> {
    await request(`/api/v1/blocks/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ name, children }) });
  },
  async deleteBlock(id: string): Promise<void> {
    await request(`/api/v1/blocks/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  async render(report: unknown, format: "pdf" | "html" | "xlsx" | "csv" | "zpl" | "escpos", parameters?: Record<string, unknown>): Promise<{ blob: Blob; renderId: string | null; warningCount: number }> {
    const res = await request("/api/v1/render", { method: "POST", body: JSON.stringify({ report, format, parameters }) });
    return { blob: await res.blob(), renderId: res.headers.get("x-render-id"), warningCount: Number(res.headers.get("x-render-warnings") ?? 0) };
  },
  async analyze(report: unknown, parameters: Record<string, unknown> = {}): Promise<{ paginated?: PaginatedReport; valid: boolean; issues: { severity: string; code: string; message: string }[] }> {
    return (await request("/api/v1/analyze", { method: "POST", body: JSON.stringify({ report, parameters, includeLayout: true }) })).json();
  },
  async testDataset(dataset: unknown, parameters: Record<string, unknown> = {}): Promise<{ ok: boolean; issues: { message: string }[]; rowCount: number; durationMs?: number; value: unknown }> {
    return (await request("/api/v1/datasets/test", { method: "POST", body: JSON.stringify({ dataset, parameters }) })).json();
  },
};
