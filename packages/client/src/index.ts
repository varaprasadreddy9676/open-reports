export type OutputFormat = "pdf" | "html" | "xlsx" | "csv" | "zpl" | "escpos" | (string & {});

export interface OpenReportsClientOptions {
  /** Base URL of the hosted Open Reports server, for example https://reports.example.com. */
  server: string;
  /** Optional server-side API key. Do not expose this in browser code. */
  apiKey?: string;
  /** Optional fetch implementation, useful for custom runtimes and tests. */
  fetch?: typeof globalThis.fetch;
}

export interface RenderOptions {
  format: OutputFormat;
  version?: number;
  parameters?: Record<string, unknown>;
  data?: Record<string, unknown>;
  viewerState?: unknown;
}

export interface InlineRenderOptions extends RenderOptions {
  report: unknown;
}

export interface RenderResult {
  bytes: Uint8Array;
  mimeType: string;
  renderId?: string;
  warningCount?: number;
}

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

/** Error returned by the Open Reports HTTP API. */
export class OpenReportsError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "OpenReportsError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Small optional helper around the hosted API. The REST API remains the full integration contract. */
export class OpenReportsClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: OpenReportsClientOptions) {
    this.baseUrl = options.server.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  renderTemplate(templateId: string, options: RenderOptions): Promise<RenderResult> {
    const path = `/api/v1/templates/${encodeURIComponent(templateId)}/render`;
    return this.render(path, options);
  }

  renderInline(options: InlineRenderOptions): Promise<RenderResult> {
    return this.render("/api/v1/render", options);
  }

  private async render(path: string, body: RenderOptions | InlineRenderOptions): Promise<RenderResult> {
    const headers = new Headers({ "content-type": "application/json" });
    if (this.apiKey) headers.set("x-api-key", this.apiKey);

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as ApiErrorBody;
      throw new OpenReportsError(
        payload.error?.message ?? `Open Reports request failed (${response.status})`,
        response.status,
        payload.error?.code,
        payload.error?.details,
      );
    }

    const warningHeader = response.headers.get("x-render-warnings");
    const warningCount = warningHeader === null ? undefined : Number(warningHeader);

    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      mimeType: response.headers.get("content-type") ?? "application/octet-stream",
      renderId: response.headers.get("x-render-id") ?? undefined,
      warningCount: warningCount !== undefined && Number.isFinite(warningCount) ? warningCount : undefined,
    };
  }
}
