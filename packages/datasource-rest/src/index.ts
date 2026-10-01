import type { DatasetDefinition } from "@reporting/schema";
import type { DataSet, DataSource, ExecutionContext } from "@reporting/core";
import { assertUrlIsSafe, type SsrfGuardOptions } from "./ssrf-guard.js";
import { interpolate, interpolateDeep } from "./interpolate.js";

export { assertUrlIsSafe, SsrfBlockedError } from "./ssrf-guard.js";

export interface RestDataSourceOptions extends SsrfGuardOptions {
  /** Hard cap on response body size in bytes, enforced while streaming (not
   * just after the fact) so a malicious/misbehaving endpoint can't exhaust
   * memory by returning gigabytes of data. */
  maxResponseBytes?: number;
  defaultTimeoutMs?: number;
}

interface RestQuery {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  resultPath?: string;
  timeoutMs?: number;
}

const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10MB
const DEFAULT_TIMEOUT_MS = 10_000;

export class RestDataSource implements DataSource {
  readonly id = "rest";

  constructor(private options: RestDataSourceOptions = {}) {}

  async execute(definition: DatasetDefinition, context: ExecutionContext): Promise<DataSet> {
    const query = definition.query as RestQuery;
    const params = context.parameters;

    const url = new URL(interpolate(query.url, params));
    for (const [key, value] of Object.entries(query.query ?? {})) {
      url.searchParams.set(key, interpolate(value, params));
    }

    await assertUrlIsSafe(url.toString(), this.options);

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(query.headers ?? {})) {
      headers[key] = interpolate(value, params);
    }

    const method = query.method ?? "GET";
    const body = query.body !== undefined ? JSON.stringify(interpolateDeep(query.body, params)) : undefined;
    if (body !== undefined && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }

    const timeoutMs = query.timeoutMs ?? this.options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, context.limits.timeoutMs));

    let response: Response;
    try {
      response = await fetch(url.toString(), { method, headers, body, signal: controller.signal, redirect: "follow" });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new Error(`REST request to "${url.toString()}" timed out after ${timeoutMs}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new Error(`REST request to "${url.toString()}" failed with status ${response.status} ${response.statusText}.`);
    }

    const text = await readBodyWithLimit(response, this.options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`REST response from "${url.toString()}" was not valid JSON.`);
    }

    const value = query.resultPath ? getPath(parsed, query.resultPath) : parsed;
    return { value: value as DataSet["value"] };
  }
}

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return response.text();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`REST response exceeded the maximum allowed size of ${maxBytes} bytes.`);
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
}

function getPath(obj: unknown, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}
