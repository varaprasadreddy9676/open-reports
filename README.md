# Open Reports

An open-source, **AI-ready reporting, document and print platform**. You describe a document once as plain JSON; the engine turns it into pixel-stable **PDF, HTML, Excel, CSV and Zebra (ZPL) labels** — invoices, 100-page clinical reports, receipts, wristbands, and sheets of stickers.

```
Report Definition (JSON)  →  params → datasets → expressions → Resolved Tree → pagination → PDF · HTML · XLSX · CSV · ZPL · (plugins)
        ▲  ▲  ▲
  Design │  │  └ Code (CodeMirror, schema-aware)
         │  └ Low-code (field pickers, condition & calculation builders)
         └ Visual designer (canvas, layers, data, pagination, print)
```

Design, Low-code and Code are three views of **the same JSON**, so a first-time user can build an invoice without reading docs and an expert can tune orphan/widow rules on a 100-page report in the same tool.

## Why it is different
- **Pagination is the product.** Header/footer repeat, "Page X of Y", table splitting with repeated headers, orphan/widow control, keep-together / keep-with-next, first/last/odd/even page masters, and a *Why did this move to the next page?* decision log — measured with real font metrics.
- **Deterministic and self-contained.** No browser engine, no JasperReports, no `eval`. Same input + fonts ⇒ same pages.
- **Print-native.** Physical units (mm), print profiles (DPI, safe margin), barcodes/QR with scan-size validation, ZPL output, and N-up **label sheets** (e.g. 2×4 on A4, start at position 5).
- **Multilingual.** Latin, Devanagari, Telugu, Kannada, Tamil and Arabic (RTL) with per-script fonts.
- **Extensible.** Plugins add renderers, datasources, expression functions, components and storage.
- **AI-ready, not AI-dependent.** The JSON is the contract: an **MCP server** (Claude, Codex, Cursor…) and the designer's **AI bar** edit it with validated JSON Patches you review as a diff. Bring your own key; the engine never lets AI calculate or render. ([details](docs/AI_AND_MCP.md))

## Quick start
### Docker
```bash
docker compose up --build
# Designer  http://localhost:3000     API (+ bundled designer)  http://localhost:4000
```
Set `API_KEYS=key1,key2` in your environment before exposing it anywhere. Data persists in the `reporting-data` volume.

### From source
```bash
corepack enable && pnpm install
sudo apt-get install fonts-noto-core            # required for correct glyphs and pagination
pnpm -r --filter "./packages/**" build && pnpm --filter @reporting/server build
PORT=4000 node apps/server/dist/index.js &       # API
pnpm --filter @reporting/designer dev            # designer on :3000 (proxies /api to :4000; set API_URL to change)
```

### Render with one request
```bash
curl -X POST localhost:4000/api/v1/render -H 'content-type: application/json' -H 'x-api-key: $KEY' \
  -d '{"format":"pdf","report":'"$(cat examples/invoice.report.json)"'}' -o invoice.pdf
```

## What is in the box
| Package | Purpose |
|---|---|
| `@reporting/schema` | Zod schema + JSON Schema for report definitions |
| `@reporting/expressions` | Safe formula language (no `eval`) |
| `@reporting/core` | Validation, parameters, datasets, Resolved Report Tree |
| `@reporting/layout` | Box layout and the pagination engine |
| `@reporting/renderer-{pdf,html,xlsx,csv,zpl}` | Output formats |
| `@reporting/datasource-{json,rest,sql}` | Data sources (REST is SSRF-guarded; SQL is parameterised; PostgreSQL + MySQL) |
| `@reporting/plugin-sdk` | Extension API ([guide](docs/PLUGIN_DEVELOPMENT.md)) |
| `@reporting/ai-tools`, `@reporting/mcp-server` | AI tool catalogue and the MCP server ([guide](docs/AI_AND_MCP.md)) |
| `@reporting/plugin-clinic-pack` | Example plugin |
| `apps/server` | REST API, template versioning (draft → immutable published), async jobs, OpenAPI at `/openapi.json` |
| `apps/designer` | The visual designer |

23 ready-made examples in [`examples/`](examples): invoice, receipt (80 and 58 mm), purchase order, account statement, grouped sales, charts, multilingual, lab / radiology / discharge reports, prescription, specimen / pharmacy / blood-bag / generic labels, wristband, patient ID card, A4 sticker sheet.

## Documentation
[User guide](docs/USER_GUIDE.md) · [Architecture](docs/ARCHITECTURE.md) · [Report definition reference](docs/REPORT_DEFINITION.md) · [Plugin development](docs/PLUGIN_DEVELOPMENT.md) · [AI & MCP](docs/AI_AND_MCP.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)

## Quality gates
Unit tests per package; a **pagination boundary suite** (N−1/N/N+1 rows, multi-page, other page sizes, wrapped and multi-script cells) on real PDFs; **visual regression** against committed baselines; **security tests** (expression sandbox, SSRF, injection, traversal); a **benchmark** script (`pnpm --filter @reporting/server bench`); and end-to-end browser tests of the designer. CI runs all of them against real PostgreSQL and MySQL.

Indicative speed on a laptop-class CPU (see `benchmarks/results.json`): 100 000-row XLSX ≈ 8 s, 100 000-row CSV ≈ 5 s, 2 000-row PDF ≈ 0.8 s, 16 concurrent 500-row PDFs ≈ 3 s.

## Status and roadmap
Done: engine, all five renderers, datasources, server, designer, plugin system, label sheets, MCP server and designer AI bar (BYOK), docs, Docker, CI, test suites.
Not built yet: a typed **SDK** and **CLI** (use the REST API or MCP meanwhile), PDF/A and digital signatures, footnotes/TOC/bookmarks, EPL and ESC/POS output, and streaming for million-row exports. Known limitation: subreports are declared in the schema but not executed.

## License
MIT — see [LICENSE](LICENSE).
