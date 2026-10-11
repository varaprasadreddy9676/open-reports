// Offers the Open Reports MCP server as one downloadable file, and describes its tools for the designer's
// Settings → AI tools panel. The file is the open-source MCP program itself: it holds no keys or settings.
// The bundle and its tool manifest are copied into dist/mcp at build time (scripts/copy-mcp.mjs), so this
// module has no runtime dependency on the MCP packages.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";

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

export function registerMcpRoutes(app: FastifyInstance, bundle = resolveMcpBundle()) {
  const manifest = readManifest(bundle);

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
    tools: manifest?.tools ?? [],
  }));
}
