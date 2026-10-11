import React, { useEffect, useState } from "react";
import { api, settings } from "../lib/api";
import { groupTools, MCP_KEY_PLACEHOLDER, MCP_NPM_PACKAGE, mcpClientHint, mcpConfig, type McpClient, type McpMode, type McpToolInfo } from "../lib/mcp-config";

type Info = Awaited<ReturnType<typeof api.mcpInfo>>;

const CLIENTS: [McpClient, string][] = [["claude-desktop", "Claude Desktop"], ["claude-code", "Claude Code"], ["cursor", "Cursor"]];
const MODES: [McpMode, string, string][] = [
  ["remote", "Connect by URL", "Nothing to install. The AI client talks to this server’s MCP endpoint directly."],
  ["local", "Run on this computer", `Runs the ${MCP_NPM_PACKAGE} npm package with npx (Node.js 18.3+). Adds tools for files on your computer and JRXML import.`],
];
const GROUPS: [keyof ReturnType<typeof groupTools>, string, string][] = [
  ["read", "Read and check", "Look things up, render, preview and validate. Never change anything."],
  ["write", "Save and publish", "Change stored templates, components and printer profiles. Hidden in read-only mode."],
  ["destructive", "Delete", "Permanently remove stored items. Clients ask before running these. Hidden in read-only mode."],
  ["local", "On your computer (Run on this computer only)", "Open and save report files, render to a file and import JasperReports JRXML."],
];

/** Settings → AI tools: connect Claude, Cursor or another MCP client to this server, by URL or with the npm package. */
export function McpSettingsPanel({ onTabKeyDown }: { onTabKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<McpMode>("remote");
  const [client, setClient] = useState<McpClient>("claude-code");
  const [readOnly, setReadOnly] = useState(false);
  const [copied, setCopied] = useState(false);
  const serverUrl = settings.apiBase || window.location.origin;

  useEffect(() => {
    let active = true;
    api.mcpInfo().then((value) => { if (active) setInfo(value); }).catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);

  const config = mcpConfig({ client, mode, serverUrl, readOnly });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(config);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  const tools: McpToolInfo[] = info?.tools ?? [];
  const groups = groupTools(tools);

  return (
    <section className="settings-section integration-quickstart mcp-settings" id="settings-panel-ai" role="tabpanel" aria-labelledby="settings-tab-ai" tabIndex={0}>
      <div className="integration-intro"><span className="integration-step">1</span><div><h3>Choose how your AI client connects</h3><p>The Open Reports MCP server lets Claude, Cursor and other MCP clients design, check, render and save reports on this server with your own model.{info?.version ? ` Version ${info.version}, ${tools.length} tools.` : ""}</p></div></div>
      {error && <p className="field-error settings-feedback" role="status" data-testid="mcp-error">Could not load the MCP details from this server: {error}</p>}
      <div className="mcp-modes" role="radiogroup" aria-label="Connection">
        {MODES.map(([id, label, hint]) => <label key={id} className="mcp-mode" data-selected={mode === id}><input type="radio" name="mcp-mode" value={id} data-testid={`mcp-mode-${id}`} checked={mode === id} onChange={() => { setMode(id); setCopied(false); }} /><span><strong>{label}</strong><span>{hint}</span></span></label>)}
      </div>
      <label className="mcp-readonly"><input type="checkbox" data-testid="mcp-read-only" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} /><span><strong>Read-only</strong>: the AI can look, preview and render, but cannot save, publish, delete or write files.</span></label>

      <div className="integration-intro"><span className="integration-step">2</span><div><h3>Add it to your AI client</h3><p>Copy the configuration below. Replace <code>{MCP_KEY_PLACEHOLDER}</code> with your server API key, or remove it if the server has no API keys. Keep keys out of shared files.</p></div></div>
      <div className="integration-code-heading"><div><h4>Configuration</h4><p>{mcpClientHint(client, mode)}</p></div><div className="integration-code-tabs" role="tablist" aria-label="AI client" onKeyDown={onTabKeyDown}>{CLIENTS.map(([id, label]) => <button key={id} id={`mcp-client-tab-${id}`} role="tab" aria-controls="mcp-config-panel" tabIndex={client === id ? 0 : -1} aria-selected={client === id} data-testid={`mcp-client-${id}`} onClick={() => { setClient(id); setCopied(false); }}>{label}</button>)}</div></div>
      <pre className="integration-code" id="mcp-config-panel" role="tabpanel" aria-labelledby={`mcp-client-tab-${client}`} tabIndex={0} data-testid="mcp-config"><code>{config}</code></pre>
      <div className="dialog-actions integration-actions"><button className="btn" type="button" data-testid="mcp-copy" onClick={copy}>{copied ? "Copied" : "Copy configuration"}</button><span className="spacer" /><span className="field-hint" aria-live="polite">Connects to {serverUrl}</span></div>
      {mode === "local" && info?.available && <p className="field-hint">No npm access? <a data-testid="mcp-download" href={`${settings.apiBase}${info.downloadPath}`} download="open-reports-mcp.mjs">Download the single file</a> and use <code>node /full/path/to/open-reports-mcp.mjs</code> in place of <code>npx -y {MCP_NPM_PACKAGE}</code>.</p>}

      {tools.length > 0 && <div className="integration-next-steps mcp-tools" data-testid="mcp-tools">
        <h4>What the AI can do</h4>
        {GROUPS.map(([key, title, hint]) => groups[key].length > 0 && <details key={key} open={key === "read"}>
          <summary>{title} ({groups[key].length})</summary>
          <p>{hint}</p>
          <ul>{groups[key].map((tool) => <li key={tool.name}><code>{tool.name}</code>: {tool.description.split(/(?<=\.)\s/)[0]}</li>)}</ul>
        </details>)}
        <p>Word (DOCX) import and “generate from sample JSON” stay in the designer for now; the AI can build the same reports with its tools.</p>
      </div>}
      <div className="integration-doc-links"><a href="https://github.com/varaprasadreddy9676/open-reports/blob/HEAD/docs/AI_AND_MCP.md" target="_blank" rel="noreferrer">MCP guide ↗</a><a href="https://www.npmjs.com/package/open-reports-mcp" target="_blank" rel="noreferrer">open-reports-mcp on npm ↗</a></div>
    </section>
  );
}
