# Changelog

All notable changes. Format based on [Keep a Changelog](https://keepachangelog.com); versions follow semver once 1.0 is reached (0.x may change between minors; report-definition changes bump `schemaVersion` with a migration).

## [0.1.0] — first public release
### Engine
- Report definition schema (+ JSON Schema), sandboxed expression language, parameters, datasets (inline, JSON, REST, SQL, CSV via inline), variables, fragments.
- Pagination: repeating headers/footers, page X of Y, table splitting, orphan/widow, keep-together / keep-with-next, forced breaks, first/last/odd/even page layouts, decision log.
- Layout: flow, row, grid, absolute; margins/padding/gap/grow/min-max; label sheets (N-up stickers).
### Outputs
- PDF (multi-script Noto fonts, charts, barcodes/QR, bookmarks, watermarks), HTML, XLSX (streaming), CSV, ZPL, ESC/POS; plugin formats.
### Server
- REST API, versioned templates (published = immutable), async jobs, reusable blocks, analyze/validate, OpenAPI, API-key auth, SQL connections from env, REST allow-list and secrets.
### Designer
- Design / Data / Code / Preview, layers, smart guides, page layouts, print profiles + ZPL preview, label sheets, 23 starter templates, CodeMirror editor, version compare, problems with one-click fixes, pagination explainer, BYOK AI bar with diff review.
### AI
- MCP server (tools, resources, prompt, read-only mode) and shared tool catalogue; id-addressed JSON Patch.
### Extensibility
- Plugin SDK: renderers, datasources, expression functions, components, storage.
### Ops
- Dockerfile + compose, GitHub Actions CI (PostgreSQL/MySQL services), benchmarks, visual regression, security suite.
### Known gaps
- No typed SDK/CLI, PDF/A, signatures, footnotes/TOC, EPL, subreport execution, live co-editing.
