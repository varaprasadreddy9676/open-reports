import React, { useEffect, useState } from "react";
import { api, settings } from "../lib/api";
import { groupTools, MCP_CLIENT_HINTS, MCP_KEY_PLACEHOLDER, mcpConfig, type McpClient, type McpToolInfo } from "../lib/mcp-config";

type Info = Awaited<ReturnType<typeof api.mcpInfo>>;

const CLIENTS: [McpClient, string][] = [["claude-desktop", "Claude Desktop"], ["claude-code", "Claude Code"], ["cursor", "Cursor"]];
const GROUPS: [keyof ReturnType<typeof groupTools>, string, string][] = [
  ["read", "Read and check", "Look things up, render, preview and validate. Never change anything."],
  ["write", "Save and publish", "Change stored templates, components and printer profiles. Hidden in read-only mode."],
  ["destructive", "Delete", "Permanently remove stored items. Clients ask before running these. Hidden in read-only mode."],
  ["local", "On your computer", "Open and save report files, render to a file and import JasperReports JRXML."],
];

/** Settings → AI tools: download the single-file MCP server and connect Claude, Cursor or another MCP client to it. */
export function McpSettingsPanel({ onTabKeyDown }: { onTabKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState("");
  const [client, setClient] = useState<McpClient>("claude-desktop");
  const [filePath, setFilePath] = useState("/path/to/open-reports-mcp.mjs");
  const [readOnly, setReadOnly] = useState(false);
  const [copied, setCopied] = useState(false);
  const serverUrl = settings.apiBase || window.location.origin;

  useEffect(() => {
    let active = true;
    api.mcpInfo().then((value) => { if (active) setInfo(value); }).catch((e: Error) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);

  const config = mcpConfig({ client, filePath: filePath.trim() || "/path/to/open-reports-mcp.mjs", serverUrl, readOnly });
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
      <div className="integration-intro"><span className="integration-step">1</span><div><h3>Download the Open Reports MCP server</h3><p>One file that lets Claude, Cursor and other MCP clients design, check, render and save reports on this server. It runs on your computer with Node.js and holds no keys or settings.</p></div></div>
      {error && <p className="field-error settings-feedback" role="status" data-testid="mcp-error">Could not load the MCP download details: {error}</p>}
      {!info && !error && <p className="field-hint" role="status">Checking this server…</p>}
      {info && !info.available && <p className="field-error settings-feedback" role="status" data-testid="mcp-unavailable">This server was built without the MCP download. Build it from <code>packages/mcp-server</code> instead (see the docs).</p>}
      {info?.available && <div className="mcp-download">
        <a className="btn primary" data-testid="mcp-download" href={`${settings.apiBase}${info.downloadPath}`} download="open-reports-mcp.mjs">Download open-reports-mcp.mjs</a>
        <span className="field-hint">Version {info.version ?? "unknown"} · {info.tools.length} tools · needs {info.requires}</span>
      </div>}

      <div className="integration-intro"><span className="integration-step">2</span><div><h3>Add it to your AI client</h3><p>Save the file somewhere permanent, enter that path, then copy the configuration. Replace <code>{MCP_KEY_PLACEHOLDER}</code> with your server API key, or remove that line if the server has no keys.</p></div></div>
      <label className="field wide"><span className="field-label">Where you saved the file</span><input data-testid="mcp-file-path" value={filePath} onChange={(e) => setFilePath(e.target.value)} spellCheck={false} autoComplete="off" /><span className="field-hint">Use the full path, for example /Users/you/tools/open-reports-mcp.mjs or C:\tools\open-reports-mcp.mjs.</span></label>
      <label className="mcp-readonly"><input type="checkbox" data-testid="mcp-read-only" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} /><span><strong>Read-only</strong> — the AI can look, preview and render, but cannot save, publish, delete or write files.</span></label>
      <div className="integration-code-heading"><div><h4>Configuration</h4><p>{MCP_CLIENT_HINTS[client]}</p></div><div className="integration-code-tabs" role="tablist" aria-label="AI client" onKeyDown={onTabKeyDown}>{CLIENTS.map(([id, label]) => <button key={id} id={`mcp-client-tab-${id}`} role="tab" aria-controls="mcp-config-panel" tabIndex={client === id ? 0 : -1} aria-selected={client === id} data-testid={`mcp-client-${id}`} onClick={() => { setClient(id); setCopied(false); }}>{label}</button>)}</div></div>
      <pre className="integration-code" id="mcp-config-panel" role="tabpanel" aria-labelledby={`mcp-client-tab-${client}`} tabIndex={0} data-testid="mcp-config"><code>{config}</code></pre>
      <div className="dialog-actions integration-actions"><button className="btn" type="button" data-testid="mcp-copy" onClick={copy}>{copied ? "Copied" : "Copy configuration"}</button><span className="spacer" /><span className="field-hint" aria-live="polite">Connects to {serverUrl}</span></div>

      {tools.length > 0 && <div className="integration-next-steps mcp-tools" data-testid="mcp-tools">
        <h4>What the AI can do ({tools.length} tools)</h4>
        {GROUPS.map(([key, title, hint]) => groups[key].length > 0 && <details key={key} open={key === "read"}>
          <summary>{title} ({groups[key].length})</summary>
          <p>{hint}</p>
          <ul>{groups[key].map((tool) => <li key={tool.name}><code>{tool.name}</code> — {tool.description.split(/(?<=\.)\s/)[0]}</li>)}</ul>
        </details>)}
        <p>Word (DOCX) import and “generate from sample JSON” stay in the designer for now; ask the AI to build those reports with its tools instead.</p>
      </div>}
    </section>
  );
}
