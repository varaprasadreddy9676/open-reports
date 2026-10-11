/** Builds the MCP client configuration shown in Settings → AI tools, for the downloadable Open Reports MCP server. */
export type McpClient = "claude-desktop" | "claude-code" | "cursor";

export interface McpConfigInput {
  client: McpClient;
  /** Absolute path where the user saved open-reports-mcp.mjs. */
  filePath: string;
  /** The reporting server the MCP server should call. */
  serverUrl: string;
  readOnly: boolean;
}

export interface McpToolInfo {
  name: string;
  description: string;
  readOnly: boolean;
  destructive: boolean;
  local: boolean;
}

export const MCP_KEY_PLACEHOLDER = "YOUR_API_KEY";

const quote = (value: string) => (/^[\w./:@~-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`);

export function mcpConfig({ client, filePath, serverUrl, readOnly }: McpConfigInput): string {
  const args = [filePath, ...(readOnly ? ["--read-only"] : [])];
  const env = { REPORTS_API_URL: serverUrl, REPORTS_API_KEY: MCP_KEY_PLACEHOLDER };
  if (client === "claude-code") {
    return `claude mcp add open-reports ${Object.entries(env).map(([k, v]) => `-e ${k}=${quote(v)}`).join(" ")} -- node ${args.map(quote).join(" ")}`;
  }
  return JSON.stringify({ mcpServers: { "open-reports": { command: "node", args, env } } }, null, 2);
}

/** Where each client keeps the configuration, shown beside the snippet. */
export const MCP_CLIENT_HINTS: Record<McpClient, string> = {
  "claude-desktop": "Claude Desktop → Settings → Developer → Edit Config, then add this to claude_desktop_config.json and restart Claude.",
  "claude-code": "Run this once in a terminal. Add --scope project to share it with your team through .mcp.json.",
  cursor: "Add this to .cursor/mcp.json in your project (or ~/.cursor/mcp.json for every project).",
};

export function groupTools(tools: McpToolInfo[]) {
  return {
    read: tools.filter((t) => t.readOnly && !t.local),
    write: tools.filter((t) => !t.readOnly && !t.destructive && !t.local),
    destructive: tools.filter((t) => t.destructive && !t.local),
    local: tools.filter((t) => t.local),
  };
}
