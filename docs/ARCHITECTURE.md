# Architecture

## The one rule
A **Report Definition** (JSON, validated by `@reporting/schema`) is the only model. The designer, code editor, API, plugins and (future) AI tools all read and write it. Nothing else holds state about a report.

## Pipeline
```
 definition ─▶ validate ─▶ parameters ─▶ datasets (parallel, timeout, row cap)
            ─▶ expressions + variables ─▶ Resolved Report Tree ─▶ paginate(layout) ─▶ renderer
```
1. **Validate** (`@reporting/core` validator): schema errors, unknown datasets/fields (with "did you mean"), expression syntax, circular fragments.
2. **Parameters / datasets**: typed parameters; datasets run in parallel through registered data sources (`inline`, `json`, `rest`, `sql`, `plugin:*`).
3. **Resolve** (`resolve-component.ts`): evaluates bindings and expressions, applies conditional styles, empty states, fragments, label sheets and plugin components. Output is a plain tree of *resolved* components — text already computed.
4. **Paginate** (`@reporting/layout`): box layout (flow, row, grid, absolute; margins, padding, gap, grow, min/max) and page breaking. Produces `PaginatedReport`: pages, header/body/footer zones, which page master was used, and a **decision log** explaining each break.
5. **Render**: every renderer consumes only the resolved tree (and the paginated pages for paged formats). Renderers never run SQL, call APIs or evaluate formulas.

## Why pagination is its own engine
Typography decides page breaks, so layout measures text with the same font metrics the PDF renderer draws with (`createPdfMeasurer`, Noto fonts, per-script runs). HTML shares the same paginated output, so on-screen and print agree. Key behaviours: repeated table headers, row splitting, `minRowsBeforeBreak/AfterBreak` (orphan/widow), `keepTogether`, `keepWithNext`, forced breaks, and page masters (`appliesTo`: first / last / odd / even / standard). The last-page master changes available height, so the page count is resolved to a fixed point.

## Packages
```
schema ─ expressions ─ core ─ layout ─ renderer-pdf / html / xlsx / csv / zpl
                         └─ datasource-json / rest / sql
plugin-sdk ─ plugin-clinic-pack            apps/server (Fastify, SQLite)     apps/designer (React, Vite, zustand)
```
Dependencies point downward only: `core` knows nothing about renderers or concrete data sources; renderers know nothing about each other.

## Server
Fastify 5 + better-sqlite3 (swappable via a storage plugin). Templates have **versions**: a draft can change, a **published** version is immutable. Rendering supports inline definitions, stored templates and async jobs. A `RenderRuntime` (renderers, data sources, plugin functions and components) is built once per server from the plugin registry.

## Designer
The designer runs `core` and `layout` **in the browser** against sample data, so the canvas is the real engine, not an approximation (the Preview tab uses the server's PDF renderer for exact output). Edits are pure functions over the JSON (`model/ops.ts`); undo/redo and the labelled history are snapshots of the JSON. The code editor and the canvas stay in sync through the same store.

## Extension points
Plugins (`@reporting/plugin-sdk`) can add: output formats, data sources, expression functions, `custom` components that expand into ordinary components (so all renderers support them), and a storage backend. See [PLUGIN_DEVELOPMENT.md](PLUGIN_DEVELOPMENT.md).

## Determinism and testing strategy
- Layout/pagination: unit tests plus a real-PDF boundary suite.
- Output stability: rasterised visual baselines.
- Safety: sandbox, SSRF, injection, traversal tests.
- Performance: repeatable benchmark script, run in CI as a smoke test.
