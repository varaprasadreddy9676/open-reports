import { describe, it, expect } from "vitest";
import { groupTools, mcpConfig, MCP_KEY_PLACEHOLDER } from "../../src/lib/mcp-config";

const base = { filePath: "/Users/me/tools/open-reports-mcp.mjs", serverUrl: "https://reports.example.com", readOnly: false };

describe("MCP client configuration", () => {
  it("writes the Claude Desktop and Cursor JSON with the server URL and a key placeholder", () => {
    for (const client of ["claude-desktop", "cursor"] as const) {
      const config = JSON.parse(mcpConfig({ ...base, client }));
      expect(config.mcpServers["open-reports"]).toEqual({
        command: "node",
        args: [base.filePath],
        env: { REPORTS_API_URL: base.serverUrl, REPORTS_API_KEY: MCP_KEY_PLACEHOLDER },
      });
    }
  });

  it("adds --read-only and quotes paths with spaces for Claude Code", () => {
    const command = mcpConfig({ ...base, client: "claude-code", filePath: "/Users/me/My Tools/open-reports-mcp.mjs", readOnly: true });
    expect(command).toBe(`claude mcp add open-reports -e REPORTS_API_URL=https://reports.example.com -e REPORTS_API_KEY=${MCP_KEY_PLACEHOLDER} -- node '/Users/me/My Tools/open-reports-mcp.mjs' --read-only`);
    expect(JSON.parse(mcpConfig({ ...base, client: "cursor", readOnly: true })).mcpServers["open-reports"].args).toEqual([base.filePath, "--read-only"]);
  });

  it("groups tools into reading, writing, destructive and on-this-computer", () => {
    const tool = (name: string, readOnly: boolean, destructive = false, local = false) => ({ name, description: "", readOnly, destructive, local });
    const groups = groupTools([tool("preview_report", true), tool("save_template", false), tool("delete_block", false, true), tool("render_to_file", false, false, true)]);
    expect(Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.map((t) => t.name)]))).toEqual({ read: ["preview_report"], write: ["save_template"], destructive: ["delete_block"], local: ["render_to_file"] });
  });
});
