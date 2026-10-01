# AI and MCP

**Principle:** AI edits report JSON — nothing else. The engine does all calculation, pagination and rendering, so results stay deterministic and auditable. You always bring your own model and key (BYOK); the platform ships no model and stores no AI keys on the server.

## 1. Use any AI tool through MCP (Claude, Codex, Cursor, …)
`@reporting/mcp-server` is a stdio MCP server that talks to the REST API.

```jsonc
// Claude Desktop / Claude Code / Cursor MCP config
{ "mcpServers": { "open-reports": {
  "command": "node", "args": ["packages/mcp-server/dist/cli.js"],
  "env": { "REPORTS_API_URL": "http://localhost:4000", "REPORTS_API_KEY": "<your key>" } } } }
```
Add `--read-only` to hide the tools that write (`save_template`, `publish_template`). Run the API with `EXAMPLES_DIR=examples` so agents can start from known-good documents.

| Tool | Purpose |
|---|---|
| `get_report_schema`, `list_capabilities` | What a report may contain; formats, fonts, secret **names**, plugin extras |
| `list_examples`, `get_example` | Start from an invoice, lab report, label, sticker sheet… |
| `analyze_report`, `validate_report` | Validate **and** paginate: page count, pagination decisions (why content moved + suggested fixes), warnings |
| `patch_report` | The only way to change a report: atomic RFC 6902 JSON Patch with id-addressed paths (`#title/style/fontSize`) |
| `render_report` | PDF / HTML / XLSX / CSV / ZPL, inline or by stored template |
| `list_templates`, `get_template`, `save_template`, `publish_template` | Versioned storage (published versions are immutable) |

Resources: `report://schema`, `report://capabilities`, `report://guide`, `report://examples/{name}`, `report://templates/{id}`. Prompt: `author_report`.

Why id-addressed patches: array indexes shift as soon as something is inserted; component ids don't. A patch with one bad operation changes nothing and says which operation failed, so the agent can fix and retry.

## 2. The designer's AI bar (Ctrl+J)
1. Open **✦ AI**, add your key under ⚙ (Anthropic, or any OpenAI-compatible endpoint including local models).
2. Select components (or nothing for the whole report) and describe the change.
3. The model returns a patch. The canvas shows the **proposed result**; the panel lists each change in plain language and can show the technical patch. **Accept** applies it as one undoable step; **Reject** discards it. Editing by hand also discards a pending proposal.

**Privacy:** the key lives only in your browser's localStorage and goes only to the provider you chose — never to the report server. The model receives your request, the selected components (or an outline), dataset *field names and types*, and current problems. Inline sample data values are never sent. Use a local model (Ollama/LM Studio via the OpenAI-compatible option) for fully offline use.

## 3. Safety properties (tested)
- Patches are applied to a copy; invalid or inapplicable patches are rejected whole (`ai-tools/tests/patch.test.ts`, designer `ai.test.ts`).
- Prototype-pollution paths and whole-document replacement are refused.
- Everything the AI produces goes through the same schema/expression validation as hand-written reports — expressions cannot execute code.
- `apps/server/tests/mcp.test.ts` drives a real MCP client against the real server with API-key auth; `ai-tools.test.ts` runs the full edit → analyze → render loop.
