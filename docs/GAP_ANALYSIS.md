# Gap analysis — implementation vs. design

*Audit of the code as of commit `c102699` (v0.1). Method: static reading of every package's entry points, a schema-field → consumer cross-reference, and **live probes** (scripts run against the built packages and a running server, PostgreSQL included). Every P0 below was reproduced, not inferred; the evidence line says how.*

**Severity**
- **P0** — wrong or lost output, a security hole, or a public claim that is false. Fix before promoting the project.
- **P1** — a core promise only partly met, or a production-readiness gap. Fix for a credible 1.0.
- **P2** — missing capability, polish, or hardening. Schedule.

| | P0 | P1 | P2 |
|---|---|---|---|
| Count | 7 | 15 | 14 |

**Correction to earlier statements at the time of the audit.** Table span/rowSpan/colSpan support was absent in the original audit; header and body spans were subsequently implemented on 2026-10-02. Orphan/widow control for text (`minLinesAtTop/Bottom`) remains unimplemented. Orphan/widow control works for **table rows only**.

---

## P0 — fix first

### P0-1 · Content nested in a container is never paginated → silent data loss
**Evidence.** A 300-row table wrapped in `container`, `column`, `row` or `keepTogether`, or a 300-item `repeater` / `group`:
`container>table` → layout 1 page, content bottom at **5 176 pt on an 842 pt page**; PDF shows **42 of 300 rows**; the other 258 are drawn off the page (or, for the repeater/group, pdfkit auto-adds ~244 pages of scattered lines). The same table at top level paginates correctly (8 pages).
**Cause.** Only a *top-level* `table` goes through `placeTable`. Every other component is placed as one unbreakable box.
**Where.**
- `packages/layout/src/paginate.ts` → `layoutContentIntoPages` (l.145–262: the `else` branch that probes `layoutComponent` and either moves the whole box or warns "taller than a full page… not yet supported"); `placeTable` (l.272).
- `packages/layout/src/box-layout.ts` → `layoutContainer` (l.248), `layoutGroup` (l.269), `layoutFlow` (l.133), `layoutRow` (l.160).
**Fix.**
1. Make pagination recursive over the *flow tree*: before placement, **flatten transparent containers** (`container`/`column`/`repeater`/`group`/`keepTogether` with no fixed height, background, border or absolute layout) into the parent's child list, carrying margin/padding as offsets. `group` becomes header (`keepWithNext`) + rows + footer.
2. For decorated containers, add `splitNode(node, available)` that places children sequentially and emits **fragments** (decoration repeated per fragment, like CSS `box-decoration-break: clone`).
3. `row` (side-by-side) children split in lock-step; until then refuse with an error (P0-2), never truncate.
4. `keepTogether` that cannot fit a fresh page must degrade to "allow split" with a decision-log entry.
**Acceptance tests.** Extend `renderer-pdf/tests/pagination-boundary.test.ts`: the five shapes above × (N−1, N, N+1, 2N+1 rows) — every row exactly once, header repeated, footer `Page x/y` correct. Add the same for HTML.

### P0-2 · Overflow is only a warning — the API returns `200` with clipped output
**Evidence.** All the cases above return HTTP 200; the only trace is a `CONTENT_OVERFLOWS_PAGE` warning that the server reduces to a count (`x-render-warnings: 1`). HTML pages have `overflow:hidden`, so the rows exist in the DOM but are invisible when printed.
**Where.** `apps/server/src/render-pipeline.ts` → `runRender`; `apps/server/src/app.ts` l.166–172 (render route headers); `packages/layout/src/paginate.ts` (`warnings.push(CONTENT_OVERFLOWS_PAGE)`); `apps/designer/src/engine.ts` (shows it as a *warning*).
**Fix.** Add `strict` (default **true**) to render options: layout warnings with `severity:"data-loss"` (`CONTENT_OVERFLOWS_PAGE`, unknown glyphs, dropped label-sheet items) fail with `422 REPORT_RENDER_FAILED` and the component id. Return warnings as JSON (`x-render-warnings` → also `?warnings=body` envelope or a `/render/analyze` call). Designer: surface as **error** with a jump-to link.
**Test.** `security`-style suite entry: strict render of the P0-1 shapes while unfixed → 422; after P0-1 → 200.

### P0-3 · Dates depend on the server's time zone → wrong calendar day
**Evidence.** `formatDate('2025-01-15','dd MMM yyyy')` prints **14 Jan** under `TZ=America/Los_Angeles`, 15 Jan under UTC/Kolkata. `formatDate('2025-01-15T23:30:00Z','dd/MM/yyyy HH:mm')` yields four different results across four zones. Invoices would show a different date depending on where the server runs — which breaks the "deterministic" claim.
**Where.**
- `packages/expressions/src/functions.ts` → `toDate` (l.12: `new Date(string)` parses date-only strings as UTC), `formatDate` (l.73) which formats with local getters.
- `packages/core/src/format.ts` → `formatDatePattern` (l.44, `date.getFullYear()/getMonth()` local) and `case "date"` (l.24).
- Same code runs in the designer (browser TZ).
**Fix.** Parse date-only (`YYYY-MM-DD`) as a **calendar date** (no zone). For instants, format with an explicit IANA zone: `report.theme.timezone` (field exists, unused) defaulting to `UTC`. Use `Intl.DateTimeFormat(locale,{timeZone})` parts, not local getters. `now()` should read an injectable clock (`generatedAt` option) so reruns are reproducible.
**Test.** Matrix test spawning `TZ=UTC|Asia/Kolkata|America/Los_Angeles|Pacific/Kiritimati` and asserting identical output for 12 date inputs.

### P0-4 · REST datasets: redirects bypass the SSRF guard (and DNS can change after the check)
**Evidence.** With an allow-listed host `127.0.0.1` that answers `302 → http://127.0.0.2:…`, the data source **fetched the non-allow-listed host** and returned its body.
**Where.** `packages/datasource-rest/src/index.ts` l.64 (`fetch(..., { redirect: "follow" })`); `packages/datasource-rest/src/ssrf-guard.ts` → `assertUrlIsSafe` (l.55–100) validates only the first URL and resolves DNS separately from the connection (TOCTOU / DNS rebinding).
**Fix.** `redirect: "manual"`, re-run `assertUrlIsSafe` on every hop (max 3, same-scheme or https upgrade only). Pin the connection to the validated IP with a custom undici `Agent({ connect: { lookup } })` that rejects private addresses at connect time. Add IPv6-mapped (`::ffff:10.0.0.1`), decimal/octal/hex IPv4 forms and `localhost.` to the tests.
**Test.** `datasource-rest/tests`: redirect-to-internal (both modes), rebinding stub (`lookup` returns public then private), encoded-IP URLs.

### P0-5 · SQL datasets can modify data; no read-only enforcement; results fully buffered
**Evidence.** A dataset with `sql: "DELETE FROM audit_t RETURNING *"` executed and emptied the table. `maxRows=100` on a 300 000-row query still materialised all rows (+24 MB heap) and sliced afterwards.
**Where.** `packages/datasource-sql/src/index.ts` → `execute` (slice after fetch), `runPostgres`, `runMysql`.
**Impact.** Report definitions are edited by designers, API callers and AI tools; "use a read-only DB user" is advice, not a control.
**Fix.** PostgreSQL: run in `BEGIN READ ONLY` with `SET LOCAL statement_timeout`, fetch through a cursor (`pg-cursor`) and stop at `maxRows+1` (flag truncation). MySQL: `START TRANSACTION READ ONLY` + `MAX_EXECUTION_TIME` hint, stream rows. Reject multi-statement text. Surface "result truncated at maxRows" as a warning (P0-2 `strict` makes it an error by default).
**Test.** Extend `sql-datasource.test.ts`: `INSERT/UPDATE/DELETE/DROP/CREATE` rejected on both engines; `SELECT pg_sleep(30)` cancelled by timeout; memory bound with 1 M-row table.

### P0-6 · `image.src` can read arbitrary files on the server (and leaks which exist)
**Evidence.** `src:"/tmp/audit-secret.png"` rendered into the PDF (HTTP 200, no warning); a missing path → warning; an existing non-image (`/etc/hostname`) → `422 "Unknown image format"`. Any image file readable by the server process can be embedded, and the three responses form a file-existence oracle.
**Where.** `packages/renderer-pdf/src/images.ts` → `resolveImageSource` (`fs.existsSync(src)`); `packages/renderer-pdf/src/draw-node.ts` (image case); `packages/renderer-html/src/render-node.ts` l.24–26 (passes `src` straight into `<img>`).
**Fix.** Allow only `data:` URIs and a confined **asset reference** (`asset:<id>` resolved inside `ASSET_ROOT`, realpath-checked as `datasource-json` does). Add an SSRF-guarded fetcher (same hardened client as P0-4) for `https:` images with size/time limits — this also removes the "remote images not fetched" usability gap. Return identical, generic errors for "missing" and "not an image".
**Test.** `security.test.ts`: absolute paths, `../`, symlink out of `ASSET_ROOT`, `file://`, error-message equality.

### P0-7 · Public docs and UI advertise features that do nothing
The `schema → consumer` cross-reference (script in the appendix) found fields the schema, designer UI and docs expose but **no layout/renderer reads**:

| Field | Promised in | Reality |
|---|---|---|
| `minLinesAtTop` / `minLinesAtBottom` | designer *Page breaks* section, `docs/USER_GUIDE.md`, `docs/USE_CASES.md` (“stops one stray line”) | text is never split; no effect |
| `style.overflow: "ellipsis"/"clip"` | designer *Advanced → Overflow* | HTML only; **PDF ignores** |
| `colSpan` / `rowSpan` | task #17 “completed” | **Addressed 2026-10-02:** explicit `headerRows` and positional body `cellSpans`; see current schema and tests. |
| `table.groupBy` | schema, `docs/REPORT_DEFINITION.md` | ignored — no group rows/subtotals |
| `richText` component | palette, docs | renders markup literally (`**bold**` shown as text) |
| `allowRowSplit`, `allowSplit`, `keepFooterTogether` | schema comments say “implemented” | no consumer found |
| `repeatOn`, `showOn` (section) | schema comments | dead (page masters use `appliesTo`) |
| `resetOn` (variable) | schema | dead |
| `style.borderRadius` | `plugin-clinic-pack` statusBadge uses it | no renderer draws it |
| `style.verticalAlign`, `letterSpacing` (PDF), `direction` (PDF), `wrap` | schema | PDF ignores |
| `theme.colors`, `theme.fontSizes`, `theme.timezone` | schema | dead |
| `itemLayout` (repeater) | schema | dead |

**Fix.** For each: implement, or delete from schema + designer + docs. Add a **CI guard** (`scripts/schema-consumers.mjs`, appendix) failing when a schema field has no consumer and is not on an explicit `PLANNED` allow-list. Fix the user-guide wording now.

---

## P1 — core promises partly met

| # | Gap | Evidence | Where | Fix |
|---|---|---|---|---|
| P1-1 | **Designer and HTML pagination ≠ PDF.** They paginate with the approximate default measurer; the PDF uses real Noto metrics | `account-statement`: designer/HTML **3 pages**, PDF **4** — the Pagination panel, thumbnails and HTML print can lie | `apps/designer/src/engine.ts` l.147 `paginate(...)` (no measurer); `packages/renderer-html/src/render.ts` l.16 | Extract a font-metrics measurer independent of pdfkit (opentype/fontkit on the bundled Noto subset, or precomputed advance tables) in `@reporting/layout`; use it in designer + HTML. Interim: the designer calls `POST /api/v1/analyze` (debounced) for page counts/decisions |
| P1-2 | **Long paragraphs are not under layout control** | 400-line paragraph → pdfkit auto-flows onto extra pages: no repeated header/footer, no widow/orphan, layout warns overflow | `paginate.ts` (no text splitting); `renderer-pdf/src/draw-node.ts` text case | Add `splitText(node, available)` using the measurer's line breaks; draw with a `lineRange`; honour `minLinesAtTop/Bottom`. Needed for 100-page clinical narratives |
| P1-3 | **`groupHeader`/`groupFooter` sections wrong** | `GH GH GH a1 a2 b1 GF` (header once per *row*, footer once total) | `packages/core/src/pipeline.ts` (section → components), `resolve-component.ts` | Either implement as bands bound to the section’s `groupBy`, or remove the section types and point to the `group` component (which works) |
| P1-4 | **No group subtotals on tables** | `table.groupBy` ignored | `resolve-component.ts` → `resolveTable`; `layout/paginate.ts` → `placeTable` | Group rows + per-group footer aggregates; keep group header with its first row |
| P1-5 | **No error/null policy** | `formatDate('garbage')` → `NaN`; `1/0` → `Infinity`; `formatCurrency(null)` → `$0.00`, printed into documents | `expressions/src/functions.ts`, `evaluator.ts` (`evalBinary`), `core/src/format.ts` | Per-report `onError: "fail"|"warn"|"blank"` and `nullDisplay`; formatters return `""`/placeholder + warning with component id; division by zero = error |
| P1-6 | **No render resource protection** | CPU-bound render blocks the event loop (50 000-row table: 5.2 s, health checks stall); 300 queued jobs all accepted; no per-render timeout | `apps/server/src/jobs.ts` → `enqueue`/`run`; `render-pipeline.ts` → `runRender`; `app.ts` | `worker_threads` pool with per-job wall-clock + memory limit; bounded queue → `429`; concurrency cap; cancel actually aborts work |
| P1-7 | **API input validation & error handling** | template id `""`, `"../x"`, `"a b"`, 300 chars all `201`; no `setErrorHandler` (500s expose messages); unbounded list endpoints; no request ids | `apps/server/src/app.ts` l.181 (`POST /api/v1/templates`), storage layer | `^[a-z0-9][a-z0-9._-]{0,99}$` for ids; length limits; pagination (`limit/cursor`); central error handler with `{error:{code,message,requestId}}`; structured request logging; graceful shutdown on SIGTERM |
| P1-8 | **Auth model too thin** | single shared key set; `Set.has` (not constant-time); CORS reflects **any** origin (`origin:true`); no-key mode binds `0.0.0.0` | `apps/server/src/auth.ts`; `app.ts` l.36; `index.ts` | Named keys with roles (`admin`, `render-only`, `read-only`); `crypto.timingSafeEqual`; `CORS_ORIGINS` allow-list; refuse non-loopback bind without keys unless `ALLOW_INSECURE=1`; rate limit (`@fastify/rate-limit`) |
| P1-9 | **AI review can hide dangerous edits** | `summarizeChanges` reports datasets/print/etc. only as `changed report datasets`; the exact patch is behind a collapsed checkbox. An AI/MCP patch could add a REST dataset to an attacker URL or an external image and the user sees one vague line | `packages/ai-tools/src/patch.ts` → `summarizeChanges`; `apps/designer/src/lib/ai.ts` → `makeProposal`; `components/AiBar.tsx` | Classify **risky** ops (datasets, `source`, URLs, secrets, plugin `custom`, `image.src`, `print`); always show them expanded with the literal values; require an extra confirm; MCP `patch_report` returns `riskyChanges[]` |
| P1-10 | **Designer can destroy unsaved work** | *New → starter*, *From sample JSON*, *Open* replace the current report with no confirm; a single localStorage draft slot | `apps/designer/src/components/Shell.tsx` (`create` ≈ l.421; `GenerateDialog` ≈ l.504); `store.ts` → `loadDoc`, `openTemplate` | Confirm when `meta.dirty`; keep N recent drafts; `beforeunload` guard; two-tab conflict detection |
| P1-11 | **XLSX is data-only** | no column alignment/number alignment, wrap, header fill, freeze panes, autofilter; widths from header length | `packages/renderer-xlsx/src/render.ts` l.71–117 | Header style, freeze first row, autofilter, widths from column spec, wrap, align numbers right, honour `style` (bold/colour) |
| P1-12 | **PDF style parity** | `lineHeight` is *measured* but not *drawn* (layout/draw mismatch); `letterSpacing`, `verticalAlign`, `overflow`, `borderRadius`, `direction`, `justify` ignored | `renderer-pdf/src/draw-node.ts` → `drawRuns`, `drawBoxDecoration`; `render.ts` measurer | Implement or remove (ties to P0-7); `lineHeight` must be passed to pdfkit `lineGap` |
| P1-13 | **Dependency advisories** | `pnpm audit --prod`: **1 high + 3 moderate in `@fastify/static`** (route-guard bypass / path traversal), 1 moderate `uuid` via `exceljs` | `apps/server/package.json` | Upgrade `@fastify/static` ≥ 10.1.2; add `pnpm audit --prod` to CI (non-blocking → blocking at 1.0); renovate/dependabot |
| P1-14 | **Docker image and CI workflow were never executed** | no Docker daemon in the build environment; workflow YAML never run on GitHub | `Dockerfile`, `.github/workflows/ci.yml`, `docker/nginx.conf` | Run them once; add a `make verify` (build image, boot, render a Hindi PDF, fonts present) and fix whatever breaks |
| P1-15 | **No asset management** | logos must be pasted as base64; remote images unsupported | designer `ImageProps` (`Properties.tsx`), server | `POST /api/v1/assets` (size/type limits, content-addressed), `asset:<id>` refs, designer upload (pairs with P0-6) |

---

## P2 — capability and hardening

| # | Gap | Where / note |
|---|---|---|
| P2-1 | **Subreports** declared but not executed (`SUBREPORT_NOT_RENDERED`) | `core/src/resolve-component.ts` l.250 |
| P2-2 | **`richText`** needs real inline formatting (bold/italic/links, bullet lists) | `resolve-component.ts` case `"richText"`; renderers |
| P2-3 | **`allowRowSplit` remains unimplemented**; table header/body spans now have schema, layout, output and designer support | `schema/components.ts`, `layout/box-layout.ts`, `layout/paginate.ts` |
| P2-4 | **`page.number` / `page.total` in body text** evaluates to empty (`"p/"`); only header/footer sections are re-resolved per page | `core/src/pipeline.ts` → `resolvePageSection` |
| P2-5 | **Reproducible `now()`**: allow `generatedAt` input so a rerun is byte-comparable | `expressions/functions.ts` |
| P2-6 | **Footnotes, TOC, PDF/A, signatures, bookmarks UI levels** | roadmap items #19, #21 |
| P2-7 | **EPL output; ESC/POS** code pages, raster images, drawer kick; **ZPL** TTF download for non-Latin | `renderer-zpl`, `renderer-escpos` |
| P2-8 | **Plugin isolation**: in-process, no `expand` timeout/size cap, no `apiVersion` negotiation | `plugin-sdk/src/index.ts`, `core` custom case |
| P2-9 | **OpenAPI is summaries only** (no request/response schemas) — blocks SDK/CLI generation | `apps/server/src/app.ts` → `buildOpenApiDocument` |
| P2-10 | **Observability**: structured logs, `/metrics`, render timings, request ids | `apps/server` |
| P2-11 | **Designer performance/a11y**: one 1.0 MB JS chunk (lazy-load CodeMirror, Preview, AI); `Canvas.tsx`/`CodeEditor.tsx` have no ARIA, no keyboard navigation between elements; no i18n of the UI | `apps/designer` |
| P2-12 | **Designer unit-test depth**: `store.ts`, `engine.ts → analyse` (barcode/QR size, safe area, fonts), `ops.ts` (group/align/distribute/move) are covered only indirectly by e2e | `apps/designer/tests/unit` |
| P2-13 | **Concurrency control on templates**: no `If-Match`/version precondition, last-write-wins from two tabs | `apps/server/src/storage/sqlite-storage.ts`, `app.ts` PUT |
| P2-14 | **OSS hygiene**: third-party notices (Noto fonts are OFL), SBOM, `SECURITY.md` contact address, release automation, `CODEOWNERS` | repo root |

---

## What was verified as solid
- Top-level table pagination: repeated header, row splitting, orphan/widow rows, footer — boundary suite passes on real PDFs (N−1/N/N+1, 2N, 2N+1, other page sizes, wrapped and multi-script cells).
- Formula sandbox (own-property lookups, blocked prototype paths, depth limit), HTML escaping (script/attr/style/`</style>` injection all neutralised), CSV formula injection, ZPL control-character stripping, API-key checks, template immutability once published, concurrent `PUT` versioning (8 parallel → 8 versions), static-file traversal tests.
- Performance is **linear**: ≈ 0.1 ms/row paginate; 100 000-row XLSX ≈ 8 s, CSV ≈ 5 s.
- Missing/unknown fields fail loudly with suggestions rather than printing blanks.

---

## Recommended order of work
1. **Safety net first (½ day):** P0-7 CI guard + wording fixes, P1-13 dependency upgrade, P1-7 id validation — cheap, and they stop the claims/vuln bleeding.
2. **Security P0s (≈2 days):** P0-4, P0-5, P0-6 (shared hardened HTTP client + asset roots), then P1-8/P1-9.
3. **Correctness P0s (≈3–4 days):** P0-3 dates; P0-2 strict mode; P0-1 recursive pagination (largest item — build the failing tests first).
4. **Fidelity P1s:** P1-1 shared measurer (unblocks trustworthy designer + HTML), P1-2 text splitting, P1-5 error policy, P1-3/4 grouping.
5. **Operability P1s:** P1-6 worker pool and quotas, P1-10, P1-11/12, P1-14/15.
6. P2 as capacity allows; subreports and rich text before spans.

**Working agreement for the fixes:** each item starts with a failing test that reproduces the evidence above (they are all scriptable), lands with the fix, and removes its row from this file.

---

## Appendix — reproducing the audit

*Schema-field consumer check* (fields declared in `packages/schema/src/*.ts` and not referenced by `core`, `layout` or any renderer):
`allowRowSplit, allowSplit, borderRadius, colors, fontSizes, itemLayout, keepFooterTogether, minLinesAtBottom, minLinesAtTop, repeatOn, resetOn, showOn, timezone, verticalAlign` (`connectionId, method, resultPath, url, language, printerType, safeMargin, locked` are consumed by data sources / the designer and are not gaps).

*Style-key × renderer matrix* — keys with no PDF consumer: `verticalAlign, letterSpacing, borderRadius, wrap, overflow, direction`; no XLSX consumer: all except borders and header bold.

*Probe summary* (all against built packages): REST redirect (two local servers on `127.0.0.1`/`127.0.0.2`); PostgreSQL `DELETE … RETURNING` and a 300 000-row `SELECT`; `POST /api/v1/render` with `image.src` = real PNG / missing path / `/etc/hostname`; layout of nine nested shapes with 300 rows; `TZ=…` matrix for `formatDate`; designer-vs-PDF page counts for all 23 examples; 8 parallel `PUT`s; 300 queued jobs; template ids `""`, `"../x"`, `"a b"`, 300×`x`, `"<script>"`; `pnpm audit --prod`.
