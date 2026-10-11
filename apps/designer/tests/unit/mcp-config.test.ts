import { describe, it, expect } from "vitest";
import { groupTools, mcpConfig, MCP_KEY_PLACEHOLDER } from "../../src/lib/mcp-config";

const base = { serverUrl: "https://reports.example.com", readOnly: false };

describe("MCP client configuration", () => {
  it("runs the npm package with npx for Claude Desktop and Cursor", () => {
    for (const client of ["claude-desktop", "cursor"] as const) {
      const config = JSON.parse(mcpConfig({ ...base, client, mode: "local" }));
      expect(config.mcpServers["open-reports"]).toEqual({
        command: "npx",
        args: ["-y", "open-reports-mcp"],
        env: { REPORTS_API_URL: base.serverUrl, REPORTS_API_KEY: MCP_KEY_PLACEHOLDER },
      });
    }
    expect(JSON.parse(mcpConfig({ ...base, client: "cursor", mode: "local", readOnly: true })).mcpServers["open-reports"].args).toEqual(["-y", "open-reports-mcp", "--read-only"]);
  });

  it("adds the npm package to Claude Code with its environment", () => {
    expect(mcpConfig({ ...base, client: "claude-code", mode: "local", readOnly: true })).toBe(`claude mcp add open-reports -e REPORTS_API_URL=https://reports.example.com -e REPORTS_API_KEY=${MCP_KEY_PLACEHOLDER} -- npx -y open-reports-mcp --read-only`);
  });

  it("connects by URL to the server's /mcp endpoint, with the key as a header", () => {
    expect(mcpConfig({ ...base, client: "claude-code", mode: "remote" })).toBe(`claude mcp add --transport http open-reports https://reports.example.com/mcp --header 'x-api-key: ${MCP_KEY_PLACEHOLDER}'`);
    expect(JSON.parse(mcpConfig({ ...base, client: "cursor", mode: "remote", readOnly: true })).mcpServers["open-reports"]).toEqual({ url: "https://reports.example.com/mcp?read-only", headers: { "x-api-key": MCP_KEY_PLACEHOLDER } });
    expect(mcpConfig({ ...base, serverUrl: "https://reports.example.com/", client: "claude-desktop", mode: "remote" })).toBe("https://reports.example.com/mcp");
  });

  it("groups tools into reading, writing, destructive and on-this-computer", () => {
    const tool = (name: string, readOnly: boolean, destructive = false, local = false) => ({ name, description: "", readOnly, destructive, local });
    const groups = groupTools([tool("preview_report", true), tool("save_template", false), tool("delete_block", false, true), tool("render_to_file", false, false, true)]);
    expect(Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.map((t) => t.name)]))).toEqual({ read: ["preview_report"], write: ["save_template"], destructive: ["delete_block"], local: ["render_to_file"] });
  });
});
