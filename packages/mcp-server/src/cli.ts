#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createHttpApi } from "@reporting/ai-tools";
import { createMcpServer } from "./index.js";

// Configure in your MCP client, e.g. Claude Desktop / Claude Code / Cursor:
//   { "command": "node", "args": ["packages/mcp-server/dist/cli.js"], "env": { "REPORTS_API_URL": "http://localhost:4000", "REPORTS_API_KEY": "..." } }
const baseUrl = process.env.REPORTS_API_URL ?? "http://localhost:4000";
const api = createHttpApi({ baseUrl, apiKey: process.env.REPORTS_API_KEY });
const readOnly = process.argv.includes("--read-only") || process.env.REPORTS_MCP_READ_ONLY === "1";
const server = createMcpServer({ api, readOnly });
await server.connect(new StdioServerTransport());
console.error(`[open-reports-mcp] connected to ${baseUrl}${readOnly ? " (read-only)" : ""}`);
