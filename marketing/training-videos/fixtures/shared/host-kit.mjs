// Small server helpers shared by the CareDesk and Ledgerline training hosts.
// They are local demo servers with no authentication: never deploy them as production code.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml",
};

export function sendJson(res, status, value) {
  res.writeHead(status, { "content-type": MIME[".json"], "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}

export async function readJson(req, maxBytes = 8 * 1024 * 1024) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > maxBytes) throw Object.assign(new Error("Request body is too large"), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw Object.assign(new Error("Request body is not valid JSON"), { status: 400 }); }
}

/** Serves a file from one of the mounted folders, refusing paths that escape them. */
export async function serveStatic(res, pathname, mounts) {
  for (const [prefix, folder] of Object.entries(mounts)) {
    if (!pathname.startsWith(prefix)) continue;
    const relative = pathname.slice(prefix.length) || "index.html";
    const file = path.resolve(folder, relative);
    if (!file.startsWith(path.resolve(folder) + path.sep)) break;
    try {
      if (!(await stat(file)).isFile()) break;
      res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      res.end(await readFile(file));
      return true;
    } catch { break; }
  }
  return false;
}

/** Server-sent events: the browser's developer view and flow overlay listen to what the server really does. */
export function createEventHub() {
  const clients = new Set();
  let sequence = 0;
  return {
    handle(req, res) {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      res.write(": connected\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
    },
    emit(type, payload) {
      const event = { id: ++sequence, type, at: Date.now(), ...payload };
      for (const client of clients) client.write(`data: ${JSON.stringify(event)}\n\n`);
    },
  };
}

/** A readable summary of a render request: the full data, and the definition reduced to what identifies it. */
export function summarizeRenderBody(body) {
  const summary = { ...body };
  if (body.report && typeof body.report === "object") {
    summary.report = {
      "(definition)": `${body.report.name ?? body.report.id} · ${JSON.stringify(body.report).length.toLocaleString("en-US")} bytes of JSON`,
      id: body.report.id, schemaVersion: body.report.schemaVersion, page: body.report.page,
      sections: (body.report.sections ?? []).map((section) => section.type),
      subreports: Object.keys(body.report.subreports ?? {}),
    };
  }
  return summary;
}

/**
 * Calls the Open Reports engine and reports the hop to the event hub before and after, so the developer view shows
 * the real URL, body, status and timing. Returns the engine response and its bytes.
 */
export async function tracedEngineCall(hub, flowId, { engineUrl, method = "POST", route, body, label }) {
  const url = `${engineUrl}${route}`;
  hub.emit("engine:request", { flowId, label, method, url, body: body === undefined ? undefined : summarizeRenderBody(body) });
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "";
    hub.emit("engine:response", {
      flowId, label, status: response.status, contentType, bytes: bytes.byteLength,
      renderId: response.headers.get("x-render-id") ?? undefined, ms: Date.now() - started,
      error: response.ok ? undefined : errorMessage(bytes, contentType),
    });
    return { response, bytes };
  } catch (error) {
    hub.emit("engine:response", { flowId, label, status: 0, ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
    throw Object.assign(new Error("The reporting engine could not be reached. Is Open Reports running?"), { status: 502 });
  }
}

function errorMessage(bytes, contentType) {
  if (!contentType.includes("json")) return `Engine returned ${bytes.byteLength} bytes`;
  try { return JSON.parse(bytes.toString("utf8"))?.error?.message ?? "Engine error"; } catch { return "Engine error"; }
}

/** Returns the source between `// #region name` and `// #endregion` so the app can show the code that actually runs. */
export async function readRegion(file, name) {
  const lines = (await readFile(file, "utf8")).split("\n");
  const start = lines.findIndex((line) => line.trim() === `// #region ${name}`);
  const end = lines.findIndex((line, index) => index > start && line.trim() === "// #endregion");
  if (start < 0 || end < 0) throw new Error(`Region ${name} not found`);
  const body = lines.slice(start + 1, end);
  const indent = Math.min(...body.filter((line) => line.trim()).map((line) => line.match(/^ */)[0].length));
  return body.map((line) => line.slice(indent)).join("\n");
}

export function flowIdOf(req) {
  const value = req.headers["x-flow-id"];
  return typeof value === "string" && /^[\w-]{6,64}$/.test(value) ? value : `flow-${Date.now().toString(36)}`;
}
