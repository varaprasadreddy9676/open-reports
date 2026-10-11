// Copies the single-file MCP server and its tool manifest into dist/mcp, so the server can offer them for
// download without depending on the MCP packages at runtime. Build @reporting/mcp-server first.
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const from = new URL("../../../packages/mcp-server/dist/", import.meta.url);
const to = new URL("../dist/mcp/", import.meta.url);
const files = ["open-reports-mcp.mjs", "open-reports-mcp.tools.json"];
if (!files.every((file) => existsSync(new URL(file, from)))) {
  console.warn("[copy-mcp] packages/mcp-server is not built; the MCP download will be unavailable.");
} else {
  await mkdir(to, { recursive: true });
  for (const file of files) await copyFile(new URL(file, from), new URL(file, to));
  console.log("[copy-mcp] copied the MCP server bundle into dist/mcp");
}
