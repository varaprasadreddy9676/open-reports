/** Builds the MCP client configuration shown in Settings → AI tools (MCP). */
export type McpClient = "claude-desktop" | "claude-code" | "cursor";
/** remote: the server's own MCP endpoint over HTTP. local: the open-reports-mcp npm package, run with npx. */
export type McpMode = "remote" | "local";

export interface McpConfigInput {
  client: McpClient;
  mode: McpMode;
  /** The reporting server, e.g. https://reports.example.com. */
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
export const MCP_NPM_PACKAGE = "open-reports-mcp";

const quote = (value: string) => (/^[\w./:@~-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`);

export const mcpEndpoint = (serverUrl: string, readOnly: boolean) => `${serverUrl.replace(/\/+$/, "")}/mcp${readOnly ? "?read-only" : ""}`;

export function mcpConfig({ client, mode, serverUrl, readOnly }: McpConfigInput): string {
  if (mode === "remote") {
    const url = mcpEndpoint(serverUrl, readOnly);
    if (client === "claude-code") return `claude mcp add --transport http open-reports ${quote(url)} --header ${quote(`x-api-key: ${MCP_KEY_PLACEHOLDER}`)}`;
    if (client === "cursor") return JSON.stringify({ mcpServers: { "open-reports": { url, headers: { "x-api-key": MCP_KEY_PLACEHOLDER } } } }, null, 2);
    return url;
  }
  const args = ["-y", MCP_NPM_PACKAGE, ...(readOnly ? ["--read-only"] : [])];
  const env = { REPORTS_API_URL: serverUrl, REPORTS_API_KEY: MCP_KEY_PLACEHOLDER };
  if (client === "claude-code") {
    return `claude mcp add open-reports ${Object.entries(env).map(([k, v]) => `-e ${k}=${quote(v)}`).join(" ")} -- npx ${args.join(" ")}`;
  }
  return JSON.stringify({ mcpServers: { "open-reports": { command: "npx", args, env } } }, null, 2);
}

/** Where each client keeps the configuration, shown above the snippet. */
export function mcpClientHint(client: McpClient, mode: McpMode): string {
  if (mode === "remote") {
    if (client === "claude-desktop") return "In Claude Desktop, open Settings → Connectors → Add custom connector and paste this URL. Custom connectors cannot send an API key, so this works only when the server has no API keys; otherwise choose “Run on this computer”.";
    if (client === "claude-code") return "Run this once in a terminal. Add --scope project to share it with your team through .mcp.json.";
    return "Add this to .cursor/mcp.json in your project (or ~/.cursor/mcp.json for every project).";
  }
  if (client === "claude-desktop") return "Claude Desktop → Settings → Developer → Edit Config, add this to claude_desktop_config.json and restart Claude.";
  if (client === "claude-code") return "Run this once in a terminal. Add --scope project to share it with your team through .mcp.json.";
  return "Add this to .cursor/mcp.json in your project (or ~/.cursor/mcp.json for every project).";
}

export function groupTools(tools: McpToolInfo[]) {
  return {
    read: tools.filter((t) => t.readOnly && !t.local),
    write: tools.filter((t) => !t.readOnly && !t.destructive && !t.local),
    destructive: tools.filter((t) => t.destructive && !t.local),
    local: tools.filter((t) => t.local),
  };
}
