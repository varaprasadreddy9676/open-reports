// MCP for AI clients, two ways:
// - Remote: POST /mcp speaks MCP over Streamable HTTP (stateless), with the same API keys as the REST API.
//   Each tool call is replayed against this server's own REST routes with the caller's key, so auth, validation
//   and limits are identical to direct API use.
// - Local: the single-file stdio server (also published to npm as open-reports-mcp) is offered for download at
//   /mcp/open-reports-mcp.mjs; it holds no keys or settings. The bundle and its tool manifest are copied into
//   dist/mcp at build time (scripts/copy-mcp.mjs).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createHttpApi } from "@reporting/ai-tools";
import { createMcpServer } from "@reporting/mcp-server";

export const MCP_ENDPOINT = "/mcp";

export const MCP_DOWNLOAD_PATH = "/mcp/open-reports-mcp.mjs";

/** The bundled single-file MCP server: MCP_BUNDLE, else dist/mcp beside this module. */
export function resolveMcpBundle(): string | undefined {
  const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const candidates = [process.env.MCP_BUNDLE, path.join(serverRoot, "dist/mcp/open-reports-mcp.mjs")];
  return candidates.find((file): file is string => Boolean(file) && fs.existsSync(file!));
}

function readManifest(bundle: string | undefined) {
  if (!bundle) return undefined;
  try {
    return JSON.parse(fs.readFileSync(bundle.replace(/\.mjs$/, ".tools.json"), "utf8")) as { version?: string; requires?: string; tools?: unknown[] };
  } catch {
    return undefined;
  }
}

/** A fetch that answers from this Fastify app in-process, forwarding the MCP caller's credentials. */
function inProcessFetch(app: FastifyInstance, request: FastifyRequest): typeof fetch {
  const credentials = Object.fromEntries((["x-api-key", "authorization"] as const).flatMap((name) => typeof request.headers[name] === "string" ? [[name, request.headers[name] as string]] : []));
  return (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const res = await app.inject({ method: (init.method ?? "GET") as any, url: url.pathname + url.search, headers: { ...(init.headers as Record<string, string>), ...credentials }, payload: init.body as string | undefined });
    const headers = new Headers();
    for (const [name, value] of Object.entries(res.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : String(value));
    return new Response([204, 304].includes(res.statusCode) ? null : res.rawPayload, { status: res.statusCode, headers });
  }) as typeof fetch;
}

export function registerMcpRoutes(app: FastifyInstance, bundle = resolveMcpBundle()) {
  const manifest = readManifest(bundle);

  // Remote MCP. Authentication runs first (see app.ts); ?read-only hides every write tool.
  app.post(MCP_ENDPOINT, async (request, reply) => {
    const readOnly = Object.prototype.hasOwnProperty.call(request.query ?? {}, "read-only");
    const server = createMcpServer({ api: createHttpApi({ baseUrl: "http://open-reports.internal", fetch: inProcessFetch(app, request) }), readOnly, version: manifest?.version });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    for (const [name, value] of Object.entries(reply.getHeaders())) if (value !== undefined) reply.raw.setHeader(name, value as string);
    reply.hijack();
    reply.raw.on("close", () => { void transport.close(); void server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);
    } catch (error) {
      request.log.error(error);
      if (!reply.raw.headersSent) reply.raw.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null }));
    }
  });
  // Stateless: no server-initiated streams or sessions to resume or end.
  const notAllowed = async (_request: FastifyRequest, reply: import("fastify").FastifyReply) => reply.code(405).header("allow", "POST").send({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. Send MCP requests with POST." }, id: null });
  app.get(MCP_ENDPOINT, notAllowed);
  app.delete(MCP_ENDPOINT, notAllowed);

  app.get(MCP_DOWNLOAD_PATH, async (_request, reply) => {
    if (!bundle) return reply.code(404).send({ error: { code: "MCP_UNAVAILABLE", message: "This server was built without the MCP download." } });
    reply.header("content-type", "text/javascript; charset=utf-8").header("content-disposition", 'attachment; filename="open-reports-mcp.mjs"').header("cache-control", "no-cache");
    return reply.send(fs.createReadStream(bundle));
  });

  app.get("/api/v1/mcp", async () => ({
    available: Boolean(bundle),
    downloadPath: MCP_DOWNLOAD_PATH,
    version: manifest?.version,
    requires: manifest?.requires ?? "Node.js 18 or newer",
    endpoint: MCP_ENDPOINT,
    npmPackage: "open-reports-mcp",
    tools: manifest?.tools ?? [],
  }));
}
