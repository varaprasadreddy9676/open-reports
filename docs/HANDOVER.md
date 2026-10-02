# Open Reports — Engineering Handover

Branch: `claude/upbeat-volta-pe84n7`. Check the current commit and working tree before continuing; the baseline was fast-forwarded to `95d47c9` on 2026-10-01.
Repo: `varaprasadreddy9676/open-reports`. pnpm monorepo, Node 22, TypeScript strict.

Read first, in this order: this file → `docs/GAP_ANALYSIS.md` (audit with P0/P1/P2 and exact files/functions) → `docs/ARCHITECTURE.md` → `docs/REPORT_DEFINITION.md`.

## 1. What the product is

Open-source reporting / document / print platform. Pipeline:
params → datasets → expressions → **band expansion** → Resolved Report Tree → paginate → renderers (PDF, HTML, XLSX, CSV, ESC/POS, …). Server (Fastify) stores templates + renders; designer (React + Vite + zustand) edits one JSON report definition (Visual / Low-code / Code views stay in sync). MCP/AI layer exists.

Packages: `schema` (zod), `expressions`, `core` (validator, pipeline, `bands.ts`), `layout` (box layout, `paginate.ts`, `design.ts`), `renderer-*`, `datasource-*`, `server`, `mcp`, `apps/designer`.

## 2. The current mandate (user's "Designer 2.0 — Enterprise Banded Report Designer")

Thesis: Open Reports had a page/component designer; it must become a true **report-structure designer** (Crystal / Jasper / DevExpress / ActiveReports / FastReport / Stimulsoft class). Bands must be part of the **universal schema and core layout engine**, not only visual rectangles. The user said: do **not** spend the sprint on AI, charts, templates, docs or new renderers. Mandated order (steps 1–12 release-blocking):

1. Native band model in schema — **DONE**
2. Banded visual canvas — **DONE (v1)**
3. True H/V rulers (units mm/cm/in/pt/px) — **DONE** (printer-dots unit and configurable origin missing)
4. Draggable margins + guides — **DONE** (margins on rulers, click-ruler-to-add-guide, drag/delete guides, persistent in `report.guides`; named guides UI missing)
5. Grid / snap / smart guides / dimension lines — **PARTIAL** (grid lines/dots/hidden, snap to guides + sibling edges + equal-distance labels existed; major/minor grid sizes, per-snap toggles, equal-spacing guides missing)
6. Section resize / collapse / reorder — **DONE** (ruler edge drag, double-click fit, caret collapse, tab drag-reorder with order validation, "+" insertion)
7. Report explorer — **PARTIAL (2026-10-01)** (`LeftPanel.tsx` now shows nested group order, group add/remove, all active band types, component layers and actions, band selection/collapse/add/reorder through `ops`; richer group-to-band nesting remains)
8. Report/page/group/data headers+footers — **engine DONE**, designer UI only via "+" menu
9. Group designer (wizard, nested groups) — **DONE (2026-10-01)** (`GroupWizard.tsx` selects an array dataset and field/expression, print rules, header/footer; uses `ops.addGroup`; the explorer adds/removes levels)
10. Section-Expert style properties panel — **DONE (2026-10-01)** (`BandProps.tsx` opens when a band is selected; all principal schema fields, group settings, and band actions are editable)
11. Table designer (merge/spans/multi-level headers) — **DONE v1 (2026-10-02)** (explicit header and body colSpan/rowSpan, merge/split inspector, pagination-safe vertical body merges, PDF/HTML/XLSX/ESC-POS/canvas output; positional body merges use resolved row order)
12. Real pagination visualization on the canvas — **PARTIAL (2026-10-01)** (structure view maps real sample page starts to source bands, shows page thumbnails, decision popovers, and a paginated sample split pane; shared PDF font measurement and exhaustive break explanations remain)
13. Figma-style Auto Layout inside bands — PARTIAL (`layout/gap/alignItems/justifyContent/columns` are editable in Section Expert; drag/reflow controls remain)
14. AI awareness of bands/pagination — NOT DONE (`apps/designer/src/lib/ai.ts`, `packages/mcp`)

Remaining spec items (from the 50-item list, none started unless noted): multiple sections of same type with printOn first/last/odd/even (schema `appliesTo` exists), column bands/multi-column, cross-band objects, page masters UI beyond existing, pagination simulation/debugger ("why did this move to page 4?"), design+preview split with the real pipeline, page thumbnails, physical print mode + calibration wizard, layers, reusable sections, styles/tokens, low-code condition/calculation builders for bands, test bench (0/1/N/N+1/stress rows), linting, data lineage, subreports, crosstab, ghost repetitions UI (engine support done, a basic "Examples +N" selector exists), constraints, overflow policies, export-aware design, code/split mode for bands, command palette entries, keyboard workflow.

## 3. What was built this phase (so you can trust it)

### Schema (`packages/schema/src`)
- `sections.ts`: 14 section types (`reportHeader,pageHeader,dataHeader,groupHeader,detail,child,groupFooter,dataFooter,noData,pageFooter,reportFooter,background,columnHeader,columnFooter`), `groupDefinitionSchema` (`id,name,dataset,by,sort,repeatHeader,newPage,keepTogether,minDetailRows`), section pagination props (`repeatEveryPage,newPageBefore/After,keepTogether,allowSplit,keepWithNext,keepWithPrevious,printAtBottom,suppressWhenBlank,visibleWhen,appliesTo,collapsed,parent,groupId,height,minHeight,layout,gap,…`).
- `report.ts`: `groups[]`, `guides[]` (`{id,name?,axis:"x"|"y",pos(pt),locked?}`).

### Core (`packages/core/src`)
- `bands.ts` `expandBodyBands(deps)`: region splitting by dataset, implicit groups from legacy `groupBy`, nested groups (outer→inner), group header/footer, data header/footer, child bands, noData, `group` expression context (`key,count,rows,first,last,index,level,id`), `design` mode with ghost rows (`resolveReport(..., {design:{ghosts}})`, tolerant key evaluation).
- `pipeline.ts`: page bands vs body split; `resolved-report.ts`: `BandMeta` on resolved containers.
- `validator.ts` `validateBands`: duplicate ids, unknown group/parent, page band with data, repeat on non-group-header, unused group, expression syntax.

### Layout (`packages/layout/src`)
- `paginate.ts`: keepWithNext chains, repeated group headers (repeat stack), `flowParts()` dissolution of oversized nested flow containers (fixed silent data loss P0-1 for flow content; **a `row` with tall side-by-side children is still not splittable**), per-page backgrounds, new decision kinds.
- `design.ts` `layoutStructure(resolved, sections)`: one-page "structure" layout, every band once, returns `bands[]` (`sectionIndex,type,name,y,height,collapsed,fixedHeight,zone,groupId,level,hiddenByRule,instance`) for the designer.

### Designer (`apps/designer/src`)
- `engine.ts`: `runEngine` also returns `structure`; option `ghosts`.
- `store.ts`: `canvasView ("structure"|"pages", persisted in localStorage designer.canvasView)`, `ghosts`, `rulerUnit` (persisted), `gridMode`, `selectedBand`; `select()` clears `selectedBand`.
- `model/ops.ts` (end of file): `BAND_TYPES, BAND_TITLES, BAND_CODES, bandDisplayName, defaultBandIndex, addBand, updateBand, canMoveBand, moveBand, duplicateBand, addGroup, updateGroup, removeGroup, bandIndexOf, addGuide, updateGuide, removeGuide`. Ordering rules live in `orderKey` (RH < DH < group headers outer→inner < detail/child < group footers inner→outer < DF < ND < RF; page bands unconstrained). Unit tests: `apps/designer/tests/unit/bands-ops.test.ts`.
- `components/Rulers.tsx` (unit ticks, margin markers, click-to-guide, band resize edges on vertical ruler; bottom margin marker hidden in structure view), `components/BandLayer.tsx` (`BandBar` toolbar, `BandChrome` tabs/collapse/"+" menu/drag reorder, `GuideLayer`), `Canvas.tsx` uses `engine.structure` when `canvasView==="structure"`, `lib/snap.ts` snaps to guides.
- Example: `department-report` in `scripts/build-examples.mjs` + `apps/designer/src/lib/templates.ts`.

### Gotchas learned
- Canvas page `onPointerDown` captures the pointer; any interactive overlay inside `.page` must `stopPropagation` on pointerdown or its clicks are retargeted (this bit the band tab/plus).
- Engine runs debounced (60 ms); UI toggles must read current state from `doc`, not from engine output (collapse toggle bug).
- Structure page height = content end + bottom margin, so the bottom margin marker collides with the last band edge (hidden in structure view on purpose).
- Playwright config sets `localStorage designer.canvasView=pages` for the legacy specs; `tests/e2e/bands.spec.ts` overrides to `structure`.
- `Parser.parse` is static (expressions package). Layout tests with height<300 silently normalize orientation (use landscape helper).
- Tests that read section children after band expansion use `packages/core/tests/helpers.ts#sectionChildren`.

## 4. Verified state at handover

- Packages: all builds pass (`pnpm -r --filter "./packages/*" build`); layout 53 tests, core/other suites passed when last run; designer unit 30 passed; designer e2e **49 passed, 5 skipped** (`cd apps/designer && npx playwright test`, needs `pnpm build` of packages and server dist; uses :3100/:4100, Chromium at `/opt/pw-browsers`).
- Re-run the whole suite first thing (`pnpm -r test`, designer unit, e2e) before changing anything.

### 2026-10-01 continuation

- Fast-forwarded this branch to `95d47c9` before edits. Untracked `output/` contains prior UI screenshots and was left alone.
- Baseline under Node 22: package builds passed; designer unit 30 passed; designer browser suite 49 passed, 5 skipped. `pnpm -r test` stopped in `datasource-sql` because local PostgreSQL (:5432) and MySQL (:3306) are unavailable. No SQL assertion failure was observed.
- Added `components/BandProps.tsx` and wired `Properties.tsx` to show it for `selectedBand`. The panel edits name, dataset/group/parent, page applicability, size/layout, visibility expression and simple condition, pagination controls, and the owning group's settings; it also duplicates, deletes, and moves bands.
- `ops.updateBand` now preserves explicit `allowSplit: false` and `repeatEveryPage: false`; both override inherited defaults. Unit and browser tests cover these cases.
- Verification after the change: designer build/typecheck passed, 31 unit tests passed, 52 browser tests passed and 5 skipped. The full recursive workspace test suite remains unverified until SQL services are available.
- Initial ESC/POS long-receipt review: the renderer emitted all resolved rows and cut once at the end, but table cells truncated to their allotted width; no automated long-bill or physical-printer test existed. PDF uses fixed-height pages. Later increments below add long-bill tests and table-value wrapping.
- The initial 500-row synthetic 80 mm ESC/POS receipt produced 24,116 bytes, contained all 500 SKU identifiers, and ended with a cut command. The first row showed its long product name truncated at that time; physical printer/spooler behavior remains unverified.
- Replaced the old 5-type "Add section" list with a report explorer in `LeftPanel.tsx`: nested group names, band rows that open Section Expert, collapse, add and drag-reorder guarded by `ops.moveBand`, plus existing component rename/hide/lock/drag actions. Browser checks cover valid and invalid reorder, group hierarchy, selection, and adding a band.
- Added `GroupWizard.tsx` and connected it to the explorer and group-band insertion. It discovers array datasets and sample fields, accepts a formula, and sets name, sort, optional header/footer, repeat header, page break, keep together, and minimum detail rows. Creating a second group makes an inner level; group removal keeps the detail band. Unit and browser checks cover this flow.
- Pagination decision page numbers were corrected in `packages/layout/src/paginate.ts` for post-break and repeated group-header decisions. Previously they pointed one page ahead, which would misplace structure-canvas explanations. All 53 layout tests pass with added page-number assertions.
- `lib/pagination-map.ts` maps page starts back to source bands, including dissolved table slices and repeated group headers. `StructurePagination.tsx` adds page thumbnails, source-band break explanations, and a per-page “Why?” control even when several pages start within one band. The split pane now embeds the PDF returned by the real render endpoint. The structure marker indicates which source band a page starts within; for repeated data it is a symbolic source location rather than literal paper geometry. Designer unit and browser checks cover a 120-row table. The editable canvas still uses different font measurement from PDF pagination.
- Verification for this increment: package builds and designer typecheck passed; `pnpm -r test` passed with local PostgreSQL 16 and MySQL 8 test databases and Noto fonts supplied through `FONTS_DIR`; designer browser suite passed 56 tests with 5 skipped. The PDF watermark test requires Noto Sans Devanagari on this Mac, matching the CI font setup.
- A 500-item continuous ESC/POS receipt is now checked on both 58 mm and 80 mm widths: every item remains in order, one cut command follows the receipt, and no renderer warnings are emitted. This verifies generated printer bytes, not a physical printer or spooler.
- Long table values now wrap within their column on ESC/POS receipts. A 500-item bill with multi-line product names, quantities, and amounts passes on 58 mm and 80 mm output: all item IDs, names, and amounts remain in order with one final cut. Physical printer and spooler behavior remains unverified.
- Table headers now accept an explicit `headerRows` grid with horizontal and vertical cell spans. Core rejects gaps, overlaps, and out-of-bounds spans; layout reserves all header rows; PDF and HTML repeat them on page breaks; XLSX writes merged cells before data rows; ESC/POS prints the header levels as text. The table inspector can add a level, split, merge and edit cells; adding/removing a column maintains the grid. Legacy `columns[].header` still supplies a single row. Package builds, recursive tests, designer typecheck, and browser suite (57 passed, 5 skipped) passed for the header-grid increment.
- Body `cellSpans` use positions after table sort/filter. Core validates overlap and bounds, skips out-of-range sample spans with a warning, and warns when a covered value differs from the anchor; PDF and HTML return that warning. Layout measures merged widths/heights and keeps vertical spans on one page; an oversized vertical span fails explicitly. PDF/HTML/canvas draw body merges; XLSX writes actual merged ranges at fixed physical rows so streaming data remains aligned; ESC/POS prints anchor values and blanks covered cells. The inspector displays resolved sample rows in windows of eight and merges/splits a selected rectangle. Recursive build and tests passed; designer browser suite passed 58 tests with 5 skipped.

## 5. Next steps (do in this order)

### D2-C
1. **Section Expert** — implemented and verified in `BandProps.tsx` (2026-10-01). Band visibility and group-by formulas now share the component formula editor, with validation, field suggestions, and a readable expression summary; group fields use the owning group's dataset.
2. **Report Explorer** — implemented for group order, add/remove, band and component layers, and band reorder (2026-10-01). Remaining refinement: show bands inside their owning group node and add band-level visibility/lock semantics.
3. **Group wizard** — implemented in `GroupWizard.tsx` with nested levels and print settings (2026-10-01).
4. **Pagination visualization on the structure canvas** — page thumbnails, source-band break lines, per-page reasons, and a real rendered-PDF split pane are implemented. Remaining: make the editable structure/page canvas use PDF font metrics, and show repeated-row page starts at a meaningful position without implying their symbolic band marker is physical paper geometry.
5. e2e: Section-Expert edits, nested group wizard, and explorer reorder are covered; add full designer-only report construction with repeated headers, page variants, noData and totals, then run full suites.

### D2-D
6. **Table designer**: v1 header/body spans, multi-level headers, merge/split UI implemented (2026-10-02). Follow-up: merge positions are tied to resolved row order, so changing sort/filter can change which data is covered; test this explicitly in report designs.
7. **Band Auto Layout UI** (Figma-style: direction, gap, padding, align, hug/fill) bound to section `layout/gap/alignItems/justifyContent`.
8. **AI/MCP awareness of bands, groups, pagination** (`apps/designer/src/lib/ai.ts`, `packages/mcp`): expose band/group schema to prompts and tools; add band/group ops as tools; include decisions log in context.
9. **Test bench** (0/1/N/N+1/stress rows, long text), **linter** (`validateBands` + layout warnings as design-time problems), data lineage, reusable sections, styles/tokens, command palette/keyboard shortcuts for bands, printer-dots ruler unit + origin, named guides panel, equal-spacing smart guides, physical print/calibration wizard, multi-column bands, cross-band objects, subreports, crosstab.

### Engine/platform backlog (unchanged from `docs/GAP_ANALYSIS.md`, tasks #30–35)
- P0-1 remainder: `row` with tall side-by-side children still cannot split across pages (silent clipping risk).
- P0-2 strict render mode: data-loss warnings → HTTP 422 + warnings JSON.
- P0-3 time-zone independent date handling (calendar-date parsing, explicit tz, injectable clock).
- P0-4/5/6 security: REST redirect re-validation + DNS pinning (`packages/datasource-rest/src/ssrf-guard.ts` only checks the first URL), SQL read-only enforcement + streaming, image/asset path confinement.
- P0-7: remove or implement schema fields that are advertised but inert; add a CI guard that every schema field has a consumer (and fix docs).
- P1 bundle: shared font measurer (designer measurer ≠ PDF measurer), text splitting, error policy, worker pool/quotas, auth hardening, AI risky-change review, designer draft safety, XLSX/PDF parity, deps, Docker/CI verification.
- Docs: update `docs/REPORT_DEFINITION.md`, `docs/USER_GUIDE.md`, `CHANGELOG.md` for the band/group/guide model and the new designer (not yet done); refresh screenshots.

## 6. Definition of done for "Designer 2.0"
Steps 1–12 above complete with tests; a report with nested groups, repeated group headers, page header/footer variants, noData, and totals can be built **entirely in the designer without touching JSON**, the canvas matches the PDF (shared measurer), and the pagination view explains every page break. All suites green, docs updated, then merge.

## 7. Process notes
- Commit trailer used in this repo: `Co-Authored-By: Claude …` + session link (optional for you).
- Never create a PR unless the user asks. Push only to `claude/upbeat-volta-pe84n7`.
- Run `npx tsc --noEmit` in `apps/designer` and `pnpm -r build` before e2e (e2e uses built server and package dists).
