# AI and MCP

**Principle:** AI edits report JSON — nothing else. The engine does all calculation, pagination and rendering, so results stay deterministic and auditable. You always bring your own model and key (BYOK); the platform ships no model and stores no AI keys on the server.

## 1. Use any AI tool through MCP (Claude, Codex, Cursor, …)
There are two ways to connect, and the designer's **Settings → AI tools (MCP)** writes the configuration for either, with your server's address filled in.

**Connect by URL (nothing to install).** Every Open Reports server speaks MCP over Streamable HTTP at `POST /mcp`, with the same API keys as the REST API (`x-api-key` or `Authorization: Bearer`). Each tool call runs through the server's own REST routes with the caller's key. Add `?read-only` to the URL to hide write tools.

```sh
# Claude Code
claude mcp add --transport http open-reports https://reports.example.com/mcp --header "x-api-key: <your key>"
```
```jsonc
// Cursor (.cursor/mcp.json)
{ "mcpServers": { "open-reports": { "url": "https://reports.example.com/mcp", "headers": { "x-api-key": "<your key>" } } } }
```
Claude Desktop adds remote servers under Settings → Connectors → Add custom connector. Custom connectors cannot send an API key, so use the npm package below for servers with keys.

**Run on your computer: the [`open-reports-mcp`](https://www.npmjs.com/package/open-reports-mcp) npm package.** A stdio server (Node.js 18.3+, no dependencies) that adds tools for files on your computer and JasperReports import.

```jsonc
// Claude Desktop (Settings → Developer → Edit Config) / Cursor
{ "mcpServers": { "open-reports": {
  "command": "npx", "args": ["-y", "open-reports-mcp"],
  "env": { "REPORTS_API_URL": "http://localhost:4000", "REPORTS_API_KEY": "<your key>" } } } }
```
```sh
# Claude Code
claude mcp add open-reports -e REPORTS_API_URL=http://localhost:4000 -e REPORTS_API_KEY=<your key> -- npx -y open-reports-mcp
```
`--url` and `--api-key` work in place of the environment variables; `--help` lists everything. Without npm, download the same program as one file from `GET /mcp/open-reports-mcp.mjs` and run it with `node /full/path/to/open-reports-mcp.mjs`. `GET /api/v1/mcp` describes the version and tools.

**Releasing the package.** It is built from `packages/mcp-server` (`pnpm --filter @reporting/mcp-server build` writes it to `packages/mcp-server/dist/npm`). Bump the version in `packages/mcp-server/package.json` and push a tag `mcp-v<version>`: the *Release open-reports-mcp* workflow runs every MCP test against the built file and publishes to npm with provenance (it needs the `NPM_TOKEN` repository secret).

Add `--read-only` (or `REPORTS_MCP_READ_ONLY=1`) to hide every tool that saves, publishes, deletes or writes files. Delete tools carry the MCP `destructiveHint`, so clients ask before running them. Run the API with `EXAMPLES_DIR=examples` so agents can start from known-good documents.

| Tool | Purpose |
|---|---|
| `get_report_schema`, `list_capabilities` | What a report may contain; formats, fonts, secret **names**, plugin extras |
| `list_examples`, `get_example` | Start from an invoice, lab report, label, sticker sheet… |
| `analyze_report`, `validate_report` | Validate **and** paginate: page count, pagination decisions (why content moved + suggested fixes), warnings |
| `describe_report` | Plain-text outline: datasets, groups, every band in print order with its print rules, and the component ids inside it |
| `patch_report` | The only way to change a report: atomic RFC 6902 JSON Patch with id-addressed paths (`#title/style/fontSize`) and band references (`@groupFooter:byRegion/children/-`) |
| `preview_report` | The text of every rendered page in layout order, so the agent can check content, page breaks and repeated headers instead of guessing |
| `test_dataset` | Run a dataset (inline, CSV, REST, SQL) and see its real fields and first rows before binding them |
| `render_report` | PDF / DOCX / HTML / XLSX / CSV / ZPL / ESC/POS, inline or by stored template (any version), with subreports and viewer state |
| `start_render_job`, `get_render_job` | Background jobs for very large renders |
| `list_templates`, `get_template`, `list_template_versions`, `save_template`, `publish_template`, `delete_template` | Versioned storage (published versions are immutable) |
| `list_blocks`, `get_block`, `save_block`, `delete_block` | Reusable components (the designer's *My Components*) |
| `list_printer_profiles`, `save_printer_profile`, `delete_printer_profile` | Saved printer and label/receipt media setups |
| `list_plugins` | Installed server plugins and what they add |
| `open_report_file`, `save_report_file` | Read and write report JSON files on your computer (npm package only, as are the two rows below) |
| `render_to_file` | Render and save the output document on your computer |
| `import_jrxml`, `import_jrxml_folder` | Convert JasperReports JRXML (one file, or a folder with its subreports) into Open Reports drafts with a review list |

Not available through MCP yet: Word (DOCX) import, which needs a browser, and the designer's *generate from sample JSON* (the agent can build the same report with `get_example` and `patch_report`).

Resources: `report://schema`, `report://capabilities`, `report://guide`, `report://examples/{name}`, `report://templates/{id}`. Prompt: `author_report`.

Why id-addressed patches: array indexes shift as soon as something is inserted; component ids don't. A patch with one bad operation changes nothing and says which operation failed, so the agent can fix and retry.

Bands (report sections) usually have no id, so they are addressed by reference: `@type`, then `:qualifier` where a type can occur more than once (the group id for group headers and footers, the `appliesTo` variant for page headers, footers and backgrounds, the parent id for child bands), then `#n` for the n-th of otherwise identical bands. Examples: `@detail/keepTogether`, `@pageFooter:last/children/-`, `@groupHeader:byRegion/repeatEveryPage`, `@detail#2`. A band with an id is `#id`. An ambiguous or unknown reference fails with the list of valid ones. `describe_report` starts every band line with its reference, and patch summaries report band changes (`added band @reportFooter`, `changed band @detail: keepTogether`). The authoring guide explains what each band type prints and its print rules.

## 2. The designer's AI bar (Ctrl+J)
1. Open **✦ AI**, add your key under ⚙ (Anthropic, or any OpenAI-compatible endpoint including local models).
2. Select components, a band (the scope chip then reads *Band @…*), or nothing for the whole report, and describe the change.
3. The model returns a patch. The canvas shows the **proposed result**; the panel lists each change in plain language and can show the technical patch. **Accept** applies it as one undoable step; **Reject** discards it. Editing by hand also discards a pending proposal.

**Privacy:** the key lives only in your browser's localStorage and goes only to the provider you chose — never to the report server. The model receives your request, the selected components or band (or the whole report when it is small), a band-by-band outline, dataset *field names and types*, and current problems. Inline sample data values are never sent. Use a local model (Ollama/LM Studio via the OpenAI-compatible option) for fully offline use.

## 3. Safety properties (tested)
- Patches are applied to a copy; invalid or inapplicable patches are rejected whole (`ai-tools/tests/patch.test.ts`, designer `ai.test.ts`).
- Prototype-pollution paths and whole-document replacement are refused.
- Everything the AI produces goes through the same schema/expression validation as hand-written reports — expressions cannot execute code.
- `apps/server/tests/mcp.test.ts` drives a real MCP client against the real server with API-key auth, and `mcp-tools.test.ts` runs every tool through the downloadable single file, including `--read-only`; `ai-tools.test.ts` runs the full edit → analyze → render loop.
