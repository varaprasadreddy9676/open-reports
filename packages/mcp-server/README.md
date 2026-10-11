# open-reports-mcp

The [Model Context Protocol](https://modelcontextprotocol.io) server for [Open Reports](https://github.com/varaprasadreddy9676/open-reports), the open-source report designer and rendering engine. It lets Claude, Cursor, Codex or any MCP client design, check, render and save reports: invoices, statements, lab reports, labels and receipts, as PDF, Word, Excel, HTML, CSV, ZPL or ESC/POS.

The AI only edits the report's JSON definition. The Open Reports engine does all layout, pagination and rendering, so results stay deterministic. You bring your own model; this server holds no model keys.

## Quick start

You need Node.js 18.3 or newer and an Open Reports server: your own (see the [quick start](https://github.com/varaprasadreddy9676/open-reports#quick-start)) or the public demo at `https://open-reports-demo.onrender.com` for trying it with sample data.

**Claude Code**

```sh
claude mcp add open-reports -e REPORTS_API_URL=http://localhost:4000 -e REPORTS_API_KEY=your-key -- npx -y open-reports-mcp
```

**Claude Desktop** (Settings → Developer → Edit Config) and **Cursor** (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "open-reports": {
      "command": "npx",
      "args": ["-y", "open-reports-mcp"],
      "env": { "REPORTS_API_URL": "http://localhost:4000", "REPORTS_API_KEY": "your-key" }
    }
  }
}
```

Leave out `REPORTS_API_KEY` if your server has no API keys. The designer's **Settings → AI tools (MCP)** writes this configuration for you, with your server's address filled in.

**No install:** an Open Reports server also speaks MCP over HTTP at `https://your-server/mcp` (send the API key as `x-api-key` or `Authorization: Bearer`). Use this package when you also want the tools that work with files on your computer.

## Options

| Flag | Environment | Default |
|---|---|---|
| `--url <server>` | `REPORTS_API_URL` | `http://localhost:4000` |
| `--api-key <key>` | `REPORTS_API_KEY` | none |
| `--read-only` | `REPORTS_MCP_READ_ONLY=1` | off |

`--read-only` hides every tool that saves, publishes, deletes or writes files. Delete tools carry the MCP `destructiveHint`, so clients ask before running them. `--help` and `--version` print to stderr.

## Tools

| Tool | What it does |
|---|---|
| `get_report_schema`, `list_capabilities` | What a report may contain; formats, fonts, secret names, plugin extras |
| `list_examples`, `get_example` | Start from an invoice, lab report, label, sticker sheet… |
| `describe_report` | Outline of datasets, groups and every band with its components |
| `patch_report` | Change a report with an atomic JSON Patch addressed by component id |
| `analyze_report`, `validate_report` | Validate and paginate: page count, why content moved, warnings |
| `preview_report` | The text of every rendered page, to check content and page breaks |
| `test_dataset` | Run a dataset and see its real fields and first rows |
| `render_report` | Render inline or a stored template (any version), with subreports |
| `start_render_job`, `get_render_job` | Background jobs for very large renders |
| `list_templates`, `get_template`, `list_template_versions`, `save_template`, `publish_template`, `delete_template` | Versioned template storage |
| `list_blocks`, `get_block`, `save_block`, `delete_block` | Reusable components |
| `list_printer_profiles`, `save_printer_profile`, `delete_printer_profile` | Printer, label and receipt media setups |
| `list_plugins` | Installed server plugins |
| `open_report_file`, `save_report_file` | Read and write report JSON files on your computer |
| `render_to_file` | Render and save the document on your computer |
| `import_jrxml`, `import_jrxml_folder` | Convert JasperReports JRXML (a file, or a folder with subreports) |

Resources: `report://schema`, `report://capabilities`, `report://guide`, `report://examples/{name}`, `report://templates/{id}`. Prompt: `author_report`.

## Security

- The server you point it at decides what is allowed; use a key with only the access the AI needs, and `--read-only` for untrusted agents.
- File tools act with your user's permissions, on paths the AI chooses. Your MCP client shows each call before it runs; review writes.
- Report expressions cannot run code, and JRXML import never runs SQL or Java.

## Development

This package is built from [`packages/mcp-server`](https://github.com/varaprasadreddy9676/open-reports/tree/HEAD/packages/mcp-server) in the Open Reports monorepo, so its tools stay in step with the API and designer. `pnpm --filter @reporting/mcp-server build` writes the single-file bundle and the npm package to `dist/npm`. MIT licensed.
