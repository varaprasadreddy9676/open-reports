#!/usr/bin/env node
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createHttpApi } from "@reporting/ai-tools";
import { createMcpServer } from "./index.js";

// Configure in your MCP client, e.g. Claude Desktop / Claude Code / Cursor:
//   { "command": "npx", "args": ["-y", "open-reports-mcp"], "env": { "REPORTS_API_URL": "http://localhost:4000", "REPORTS_API_KEY": "..." } }
// stdout carries the MCP protocol, so everything for people goes to stderr.
const version = process.env.OPEN_REPORTS_MCP_VERSION ?? "dev";
const HELP = `open-reports-mcp ${version}: the Open Reports MCP server (stdio)

Lets Claude, Cursor and other MCP clients design, check, render and save reports on an Open Reports server.

Usage: open-reports-mcp [--url <server>] [--api-key <key>] [--read-only]

  --url        Open Reports server (default: $REPORTS_API_URL or http://localhost:4000)
  --api-key    API key, if the server requires one (default: $REPORTS_API_KEY)
  --read-only  Hide every tool that saves, publishes, deletes or writes files ($REPORTS_MCP_READ_ONLY=1)
  --version    Print the version
  --help       Print this help

Docs: https://github.com/varaprasadreddy9676/open-reports/blob/HEAD/docs/AI_AND_MCP.md`;

let flags;
try {
  ({ values: flags } = parseArgs({ options: { url: { type: "string" }, "api-key": { type: "string" }, "read-only": { type: "boolean" }, version: { type: "boolean" }, help: { type: "boolean", short: "h" } } }));
} catch (error) {
  console.error(`${error instanceof Error ? error.message : String(error)}\n\n${HELP}`);
  process.exit(2);
}
if (flags.help) { console.error(HELP); process.exit(0); }
if (flags.version) { console.error(version); process.exit(0); }

const baseUrl = (flags.url ?? process.env.REPORTS_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
try {
  if (!["http:", "https:"].includes(new URL(baseUrl).protocol)) throw new Error();
} catch {
  console.error(`[open-reports-mcp] "${baseUrl}" is not an http(s) URL. Set --url or REPORTS_API_URL to your Open Reports server.`);
  process.exit(2);
}
const apiKey = flags["api-key"] ?? process.env.REPORTS_API_KEY;
const readOnly = Boolean(flags["read-only"]) || process.env.REPORTS_MCP_READ_ONLY === "1";
const server = createMcpServer({ api: createHttpApi({ baseUrl, apiKey }), readOnly, local: true, version });
await server.connect(new StdioServerTransport());
console.error(`[open-reports-mcp] ${version} connected to ${baseUrl}${readOnly ? " (read-only)" : ""}`);

// A clear early warning beats a confusing failure on the first tool call. Never fatal: the server may start later.
fetch(`${baseUrl}/api/v1/templates`, { headers: apiKey ? { "x-api-key": apiKey } : {}, signal: AbortSignal.timeout(5000) })
  .then((res) => {
    if (res.status === 401) console.error("[open-reports-mcp] warning: the server rejected the API key. Set REPORTS_API_KEY (or --api-key).");
    else if (!res.ok) console.error(`[open-reports-mcp] warning: ${baseUrl} answered ${res.status}. Is this an Open Reports server?`);
  })
  .catch(() => console.error(`[open-reports-mcp] warning: cannot reach ${baseUrl} yet. Tools will fail until it is running.`));
