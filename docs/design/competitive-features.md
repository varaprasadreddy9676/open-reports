# Competitive features: how they work, how to develop and test them

This is the working guide for the features added to close the gaps with JasperReports, Bold Reports, ActiveReportsJS, Stimulsoft and Carbone.

| # | Feature | Status | Commit |
|---|---|---|---|
| 0 | Canvas 2.0 (zoom, keyboard model, instant feedback, dust delete, data switcher) | Shipped | `0b6ce2c` (plan: [canvas-2.md](canvas-2.md)) |
| 1 | Embedding kit (`<open-report-viewer>`, `<open-report-designer>`) | Shipped | `2ec7995` |
| 2 | Crosstab (pivot table) + JRXML crosstab import | Shipped | `166f70d` |
| 3 | Interactive viewer (find, contents, sorting, drill-down, drill-through, links) | Shipped | `4ce3f30` |
| 4 | Word (DOCX) export | Shipped | `0a32819` |
| 5 | More chart types and in-table visuals | **Not started**: plan below | |
| 6 | SSRS (RDL) import | **Not started**: plan below | |

Not in this list but researched: scheduling and delivery, and translation dictionaries (see the competitive research in the conversation history and the roadmap issues).

---

## Development setup

```bash
fnm use 22                 # or nvm; Node 22 is required (the SQLite module is built for it)
corepack enable && pnpm install
pnpm -r --filter "./packages/**" build && pnpm --filter @reporting/server build
pnpm dev                   # API :4000, designer :3000 with hot reload
```

- **Node version.** Node 24 fails with `NODE_MODULE_VERSION` from `better-sqlite3`. Prefix commands with `fnm exec --using=22` if your default is newer.
- **Ports.** `pnpm dev` passes the environment to the API server, so a `PORT` already set in your shell (some preview tools set `PORT=3000`) moves the API onto the designer's port. Run `PORT=4000 pnpm dev`. `.claude/launch.json` does this for the Claude preview.
- **Packages are consumed from `dist/`.** After editing anything under `packages/`, rebuild that package (`pnpm --filter @reporting/<name> build`) before the designer or server sees it. The designer's Vite server picks up the rebuilt files on reload.

### Test commands

| What | Command |
|---|---|
| One package's unit tests | `pnpm --filter @reporting/core test` (any package name) |
| All package tests | `pnpm -r --filter "./packages/**" test` |
| Server tests | `pnpm --filter @reporting/server test` (add `exec vitest run --exclude tests/visual.test.ts` on macOS, see below) |
| Designer unit tests | `pnpm --filter @reporting/designer test` |
| Designer end-to-end, one file | `pnpm --filter @reporting/designer exec playwright test tests/e2e/embed.spec.ts` |
| Designer end-to-end, all functional | `pnpm --filter @reporting/designer exec playwright test --grep-invert @visual` |
| Schema field audit | `pnpm -r --filter "./packages/**" build && node scripts/schema-consumers.mjs` |
| Typecheck / lint | `pnpm typecheck` / `pnpm lint` |

Playwright starts its own API (`:4100`) and designer (`:3100`); stop other runs first or they collide on those ports. The suite runs on one worker against a shared SQLite file, so a full run takes 5–15 minutes. Run single files while developing.

### Tests that fail for reasons outside these features

Check these before assuming you broke something:

- **macOS only:**
  - `renderer-pdf` "watermark supports non-Latin text" needs the Noto Devanagari font (`fonts-noto-core`), which CI's Linux image has.
  - Server `tests/visual.test.ts` and the designer `@visual` specs compare against Linux reference images. Regenerate designer images with `scripts/update-visual-baselines.sh` (Docker) and server images with `UPDATE_BASELINES=1` inside the CI container.
- **Already failing in CI since `bab39b6`:**
  - About 30 designer e2e tests, mostly in `bands.spec.ts`. Blank reports now open in Pages view while those tests expect Structure view.
  - Also `workspace.spec.ts:95/:300/:501`, `font-preview`, `label-journey`, `letterheads`, `nested-lists` and `theme`.
  - Fixing them is separate work: either restore Structure view for blank reports in tests, or update the tests to switch views.
- **macOS only, known:** `jrxml-folder.spec.ts:68`.

---

## 1. Embedding kit

**What it is.** One script tag gives any web page `<open-report-viewer>` (a published report with parameters, find, contents, sorting, drill-down, drill-through, print and downloads) and `<open-report-designer>` (the whole designer in a frame). User docs: [EMBEDDING.md](../EMBEDDING.md).

**Where the code is**

| Piece | File |
|---|---|
| Custom elements, public API | `packages/embed/src/index.ts` (browser entry `open-reports.ts`) |
| Viewer UI and navigation stack | `packages/embed/src/viewer.ts`, styles in `styles.ts` |
| Interactivity inside the rendered report | `packages/embed/src/interactive.ts` |
| Server calls | `packages/embed/src/client.ts` |
| Designer frame + postMessage protocol | `packages/embed/src/designer.ts`, `protocol.ts` |
| Designer's embed mode | `apps/designer/src/lib/embed-host.ts` (started from `App.tsx`; skips the draft and home screen) |
| Served at `/embed/` | `apps/server/src/app.ts` (`resolveEmbedDist`); dev proxy in `apps/designer/vite.config.ts` |

**Rules to keep**

- **The protocol is versioned:** `PROTOCOL = "open-reports/1"`.
  - Never send the API key in a URL; it travels in the `init` message.
  - Both sides check `event.source` and `event.origin`; keep that in any new message.
  - Messages to the frame are queued until it reports `ready`.
- **The viewer's report frame is sandboxed** without `allow-scripts`. All behaviour is attached from outside (`interactive.ts`). Do not add script to the HTML renderer.
- **The viewer never reorders or hides rows itself.** Every interactive choice goes back to the server as `viewerState`, so pagination and totals stay correct.

**How to test**

- Unit: `packages/embed/tests/params.test.ts` (parameter coercion, message validation). There is no DOM test library in the repo, so the UI is covered end to end.
- End to end: `apps/designer/tests/e2e/embed.spec.ts` and `viewer-interactive.spec.ts`.
  - They serve a host page with `page.route("**/host.html")` on the test origin and load `/embed/open-reports.js` through the Vite proxy.
  - Templates are created and published through the API in each test.
- By hand: run `pnpm dev`, save and publish a template in the designer, then open an HTML file that contains the script tag and `<open-report-viewer server="http://localhost:4000" template="<id>">`.

**Next steps**

- React and Vue wrapper packages; publishing `@reporting/embed` to npm.
- A render-only API key scope, so public pages don't need a full key.
- Designer embed options: hide panels, restrict to one dataset.

---

## 2. Crosstab

**What it is.** `type: "crosstab"` with `rows`, `columns`, `measures` (sum, count, avg, min, max), totals, sorting and table styles. Reference: [REPORT_DEFINITION.md → Crosstabs](../REPORT_DEFINITION.md).

**How it works.** `packages/core/src/crosstab.ts` (`pivotCrosstab`) pivots the rows, then `resolveCrosstab` in `resolve-component.ts` resolves the result as an ordinary **table** over a private dataset (`__crosstab:<id>`). Layout, pagination, header repetition, PDF, HTML, XLSX, CSV, DOCX and the canvas therefore need no crosstab code.

- Totals are computed from raw values (an average total is a true average).
- Several measures produce `headerRows`, a two-level header.
- Nested row dimensions use `mergeRepeated`.
- Too many column values are capped by `maxColumns`, with `CROSSTAB_COLUMNS_TRUNCATED`.
- **Designer:** palette item in `LeftPanel.tsx`; inspector in `components/CrosstabProps.tsx`. Choosing a dataset auto-fills rows, columns and a sum.
- **JRXML:** `convertCrosstab` in `packages/jrxml-import/src/index.ts` maps row/column groups, measures and `totalPosition`.

**How to test**

- `packages/core/tests/crosstab.test.ts`: pivot maths, sorting, aggregates, headings, caps, end to end through `resolveReport`.
- `packages/renderer-pdf/tests/crosstab-pdf.test.ts`: real PDF text, a two-level header repeated on every page.
- `packages/jrxml-import/src/index.test.ts`: JRXML crosstab import.
- `apps/designer/tests/e2e/crosstab.spec.ts`: build one from the palette.

**Next steps**

- Subtotals per outer row group; percentage-of-row and percentage-of-column measures.
- Splitting very wide crosstabs across pages with the row headings repeated (the "explained column break" idea).
- Importing JRXML cell styles and number patterns.

---

## 3. Interactive viewer and links

**What it is**

- **Report features:**
  - `link` on any element or table column: `url`, a per-record `expression`, or a `report` drill-through with parameters.
  - `drillDown` on groups.
  - `sortBy` on crosstabs.
- **Viewer features** (in `<open-report-viewer>`):
  - find with highlights;
  - a contents sidebar from bookmarks;
  - click-to-sort headings;
  - drill-down toggles;
  - drill-through with a Back trail.

**Where the code is**

| Piece | File |
|---|---|
| Link schema (`linkSchema`) | `packages/schema/src/common.ts`; column `link` in `components.ts` |
| Resolving links (safe schemes only) | `packages/core/src/links.ts`, attached in `resolve-component.ts` (`resolveComponent` wrapper, table rows' `links`) |
| Viewer state (sort, drill-down toggles) | `packages/core/src/viewer-state.ts` (`applyViewerState`) |
| Drill-down groups | `buildGroupInstance` in `resolve-component.ts` (`drillDown`, `drillToggled`, `drillToggle` marker) |
| Server: accepts `viewerState`, applies it after validation | `apps/server/src/render-pipeline.ts` (`parseViewerState`) |
| HTML markers: bookmarks, `data-component` / `data-column`, links, `.or-toggle` | `packages/renderer-html/src/render-node.ts` |
| PDF link annotations | `addLink` in `packages/renderer-pdf/src/draw-node.ts` |
| Designer: Link editor, drill-down option | `apps/designer/src/components/LinkProps.tsx`; Grouping section in `Properties.tsx` |

**Rules to keep**

- **Links:** only `http(s)`, `mailto` and `tel` (`LINK_BLOCKED` otherwise). Drill-through links never appear in PDFs.
- **Viewer state:** the server bounds what it accepts (10 sorts, 50 toggles); keep any new field bounded too.
- **Column ids** fall back to `binding`, then `header`. The HTML `data-column` and `applyViewerState` both rely on this order.

**How to test**

- `packages/core/tests/links.test.ts`, `viewer-state.test.ts`, `drill-down.test.ts`.
- `packages/renderer-html/tests/interactive.test.ts`.
- PDF links: `packages/renderer-pdf/tests/crosstab-pdf.test.ts` ("links in PDF").
- `apps/designer/tests/e2e/viewer-interactive.spec.ts`: the full flow, including drill-down.

**Next steps**

- Interactive sorting and drill-down in the designer's own Preview tab (it uses the PDF viewer today).
- Remember viewer state in the page URL.
- "Expand all" / "collapse all".
- Drill-through that opens in a new tab.

---

## 4. Word (DOCX) export

**What it is.** Format `docx`: an editable Word document, not a fixed-page copy.

- **Content:** paragraphs and headings (bookmarked text becomes Word headings and stays with the following paragraph); real tables with repeating header rows and merged header/body cells; side-by-side rows as borderless tables; native editable bar, line and pie charts; images, QR codes and barcodes.
- **Page furniture:** clickable web links; normal, first, odd and even page headers and footers whose page numbers are live `PAGE` / `NUMPAGES` fields; the report's page size and margins. Explicitly blank page masters suppress inherited furniture.

**How it works.** `packages/renderer-docx/src/render.ts`, built on the MIT `docx` library.

- **Page numbers:** headers and footers are resolved with sentinel page numbers (`987654321`, `123456789`), and `runs()` replaces those digits with Word fields.
- **Linked images:** the server resolves allowed local paths and URLs into embedded image data before DOCX rendering. PNG and JPEG work in this flow; unsupported formats and unresolved sources produce `DOCX_IMAGE_SKIPPED`.
- **Warnings instead of silent loss:** charts without usable data (`DOCX_CHART_AS_TEXT`), unsupported images (`DOCX_IMAGE_SKIPPED`), label sheets, and last-page-only headers or footers (`DOCX_PAGE_MASTERS`). Word handles its own pagination, so exact PDF page breaks and fixed element positions are not preserved.
- **Registered in:** `apps/server/src/renderers.ts`, the capabilities list in `app.ts`, the designer export menu and palette, and the viewer's download labels.

**How to test**

- `packages/renderer-docx/tests/render.test.ts` unzips the output with JSZip and checks `word/document.xml`, headers, footers, relationships and media.
- `apps/server/tests/server.test.ts`: "renders an editable Word document".
- By hand: export from the designer (Export → Word) and open in Word, LibreOffice or Google Docs. Check headings in the navigation pane, header-row repeat on long tables, and live page numbers after editing.

**Remaining separate feature**

- **Templates designed in Word (the Carbone idea):** import a `.docx` as a starting layout. This is outside DOCX export.

---

## 5. More chart types and in-table visuals (not started)

**Goal.** Match Bold Reports and Stimulsoft basics:

- area, stacked bar and column, donut and scatter charts;
- **sparklines** and **data bars** inside table cells.

**Where it goes.** Every output shares one SVG chart generator, so most of the work is in one file.

| Step | File | Notes |
|---|---|---|
| Schema | `packages/schema/src/components.ts` (`chartComponentSchema`) | Extend `chartType` with `area`, `stackedBar`, `donut`, `scatter`. Add optional `stacked`, `showLegend`, `showValues`, `colors`. Every new field must be read by the engine (`node scripts/schema-consumers.mjs`). |
| Resolve | `packages/core/src/resolve-component.ts` (`case "chart"`) | Scatter needs an `x` binding per series. Keep values numeric. |
| Draw | `packages/renderer-html/src/chart.ts` (`renderChartSvg`) | Used by HTML, PDF (`renderer-pdf/src/draw-node.ts` converts the SVG) and the canvas (`apps/designer/src/components/Canvas.tsx`). Keep the output deterministic, with no randomness or timestamps. |
| In-table visuals | `tableColumnSchema`: `visual: { type: "sparkline" \| "dataBar", binding, min?, max?, color? }` | Resolve per row in `resolveTable` (raw values onto `row.visuals[colId]`). Draw: an inline SVG in HTML `<td>`, `doc.path` and `doc.rect` in `renderer-pdf` table cells, a small `<svg>` in the canvas `TableView`. XLSX can use Excel data bars (exceljs conditional formatting). |
| Designer | `ChartProps` in `apps/designer/src/components/Properties.tsx`; palette entries in `LeftPanel.tsx` | One palette entry per chart type, as for bar, line and pie. |
| DOCX | `packages/renderer-docx/src/render.ts` | Add native Word mappings for any new chart types; warn when a chart cannot be represented. |

**Tests to write first**

- `packages/renderer-html/tests/charts.test.ts`: snapshot of the SVG for each type with fixed data (values, labels, legend present).
- `packages/core/tests`: data bars clamp to `min` and `max`; sparklines ignore non-numbers.
- `packages/renderer-pdf/tests`: a page with a donut and a data-bar column renders, with no layout warnings.
- Server visual baseline for one example per new type (`UPDATE_BASELINES=1`, in the CI container).
- `apps/designer/tests/e2e`: insert each type from the palette; it shows on the canvas.

**Done when**

- Every new type renders identically in canvas, HTML and PDF.
- XLSX shows data bars.
- DOCX shows a real chart or a warning.
- The schema audit passes.

---

## 6. SSRS (RDL) import (not started)

**Goal.** A second migration path next to JasperReports, the angle Bold Reports uses: import `.rdl` / `.rdlc` files as editable drafts with a review list.

**Design.** Mirror `packages/jrxml-import`:

- a new package `packages/rdl-import` exporting `importRdl(xml, { id }) → { report, issues, format }`;
- issues use the same `converted` / `needs-review` / `unsupported` statuses, so the designer's Migration panel shows them unchanged.

| RDL | Open Reports |
|---|---|
| `Page` (`PageHeight`, `PageWidth`, margins; units `in`, `cm`, `mm`, `pt`) | `page` (convert units with the same helper style as JRXML) |
| `ReportParameters/ReportParameter` (`DataType`, `Prompt`, `DefaultValue`, `ValidValues`) | `parameters` (`enum` when `ValidValues` lists values) |
| `DataSets/DataSet` (`Query/CommandText`, `Fields/Field@Name` + `DataField`) | `datasets`, query kept for review (`needs-review`: connection strings never imported) |
| `PageHeader`, `PageFooter`, `Body/ReportItems` | `pageHeader`, `pageFooter`, `detail` sections |
| `Textbox` (`Paragraphs/TextRuns/Value`, `Style`) | `text` / `field`, style mapped |
| `Image`, `Line`, `Rectangle` (with nested items) | `image`, `line`, `container` (absolute) |
| `Tablix` with only row groups / details | `table` (columns from `TablixColumns`, header from the first row) |
| `Tablix` with column groups (a matrix) | `crosstab` (row groups → `rows`, column groups → `columns`, aggregated cells → `measures`) |
| `Chart` | `chart` (bar, line, pie first) |
| `Subreport` | `subreport` (`needs-review`, like JRXML) |

**Expressions.** RDL uses VB.NET. Translate only a safe subset and flag the rest:

- `=Fields!X.Value` → `row.X`; `=Parameters!X.Value` → `params.X`;
- `=Globals!PageNumber` / `TotalPages` → `page.number` / `page.total`;
- `=Sum(Fields!X.Value)` → column footer `aggregate: "sum"`;
- `&` → `+`;
- string literals.

Anything else (`IIf`, `Format`, custom code, `Code.`) is `needs-review` with the original kept. **Never execute embedded code.**

**Where it plugs in**

- Server: an `/api/v1/import/rdl` endpoint next to the JRXML one, accepting the same size limits.
- Designer:
  - the Import dialog accepts `.rdl` / `.rdlc` (look for the JRXML dialog in `apps/designer/src/components/Shell.tsx`, `JrxmlImportDialog`, and `JrxmlFolderImport.tsx`);
  - home-page copy: "Import JRXML or RDL".

**Tests to write first**

- `packages/rdl-import/src/index.test.ts`:
  - a minimal report (textbox, parameter, dataset) imports with the right geometry;
  - a Tablix with a details group becomes a table with a header row;
  - a matrix becomes a crosstab;
  - `=Fields!Amount.Value` and `Sum(...)` translate;
  - `IIf(...)` and `Code.X` become `needs-review` with the original text;
  - unit conversion (in, cm) is exact to 0.01 pt.
- Fixtures: a few public sample RDLs (for example from the Microsoft SQL Server samples repository; check the licence) in `packages/rdl-import/tests/fixtures`.
- `apps/designer/tests/e2e`: import an `.rdl` through the dialog and see the review list.

**Done when**

- A typical invoice RDL and a matrix RDL import as editable drafts.
- Every element is listed as converted, needs review or unsupported.
- Nothing from the file is executed.
