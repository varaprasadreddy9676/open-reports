/** Minimal HTTP client for the reporting server's REST API (works in Node 18+ and browsers). */
export interface ReportApi {
  json<T = any>(method: string, path: string, body?: unknown): Promise<T>;
  binary(method: string, path: string, body?: unknown): Promise<{ bytes: Uint8Array; mimeType: string; renderId?: string; warnings?: number }>;
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly details?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

export function createHttpApi(options: { baseUrl: string; apiKey?: string; fetch?: typeof fetch }): ReportApi {
  const f = options.fetch ?? fetch;
  const base = options.baseUrl.replace(/\/$/, "");
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await f(`${base}${path}`, {
      method,
      headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(options.apiKey ? { "x-api-key": options.apiKey } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      let detail: any;
      try {
        detail = await res.json();
      } catch {
        /* not json */
      }
      throw new ApiError(res.status, detail?.error?.message ?? `HTTP ${res.status} from ${path}`, detail?.error?.details ?? detail);
    }
    return res;
  };
  return {
    async json(method, path, body) {
      return (await call(method, path, body)).json() as any;
    },
    async binary(method, path, body) {
      const res = await call(method, path, body);
      return {
        bytes: new Uint8Array(await res.arrayBuffer()),
        mimeType: res.headers.get("content-type") ?? "application/octet-stream",
        renderId: res.headers.get("x-render-id") ?? undefined,
        warnings: Number(res.headers.get("x-render-warnings") ?? 0),
      };
    },
  };
}
