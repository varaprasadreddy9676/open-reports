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
7. Report explorer — **PARTIAL (2026-10-01)** (`LeftPanel.tsx` now shows nested group order, all active band types, component layers and actions, band selection/collapse/add/reorder through `ops`; group wizard and richer group-to-band nesting remain)
8. Report/page/group/data headers+footers — **engine DONE**, designer UI only via "+" menu
9. Group designer (wizard, nested groups) — **ops DONE (`addGroup/updateGroup/removeGroup`), UI NOT DONE**
10. Section-Expert style properties panel — **DONE (2026-10-01)** (`BandProps.tsx` opens when a band is selected; all principal schema fields, group settings, and band actions are editable)
11. Table designer (merge/spans/multi-level headers) — NOT DONE (also GAP P2-3, task #17)
12. Real pagination visualization on the canvas — NOT DONE on structure canvas (a decisions log + Pagination bottom panel exist for pages view)
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
- ESC/POS long-receipt review: the renderer emits all resolved rows and cuts once at the end, but table cells truncate to their allotted width; no long-bill stress or physical-printer test exists. PDF uses fixed-height pages.
- A 500-row synthetic 80 mm ESC/POS receipt produced 24,116 bytes, contained all 500 SKU identifiers, and ended with a cut command. The rendered first row showed its long product name truncated; physical printer/spooler behavior remains unverified.
- Replaced the old 5-type "Add section" list with a report explorer in `LeftPanel.tsx`: nested group names, band rows that open Section Expert, collapse, add and drag-reorder guarded by `ops.moveBand`, plus existing component rename/hide/lock/drag actions. Browser checks cover valid and invalid reorder, group hierarchy, selection, and adding a band.

## 5. Next steps (do in this order)

### D2-C (was in progress; nothing uncommitted)
1. **Section-Expert panel** — new `components/BandProps.tsx`, wired in `Properties.tsx` `Properties()`: when `selection.length===0 && selectedBand!==null` render it (before `PageProps`). Fields: name, dataset (detail), group (group header/footer), `appliesTo` (page bands), height/minHeight, checkboxes for `newPageBefore/After, keepTogether, keepWithNext, keepWithPrevious, allowSplit, printAtBottom, suppressWhenBlank, repeatEveryPage (group header)`, `visibleWhen` (reuse `FormulaInput`/`ConditionBuilder` from Properties.tsx), layout/gap/align/columns, actions: duplicate/delete/move up/down (`ops.duplicateBand/removeSection/moveBand`). Write via `ops.updateBand` (it deletes falsy booleans). Also show the owning group's settings (`ops.updateGroup`). Use existing `Section/Field/Num` helpers (they are file-local — export or move to a shared file).
2. **Report Explorer** — replace `LayersTab` in `components/LeftPanel.tsx`: tree = Report → Groups (nested, add/remove) → Bands (code chip + `ops.bandDisplayName`, drag to reorder using `ops.canMoveBand`, click selects via `set({selectedBand})`, eye/lock/collapse) → components under each band (existing `LayerRow`). Keep the `data-testid="section-<type>"` hooks that existing e2e specs use, or update those specs. Remove the old `SECTION_TYPES` "Add section" select in favour of `ops.addBand`.
3. **Group wizard** — dialog/inline form: dataset select, field chosen from `inferFields(datasetValue(doc,sample,dataset))` (see `lib/fields.ts`) or free expression, name, sort, header/footer toggles, repeat header, new page, keep together, min detail rows → `ops.addGroup`. The band "+" menu currently toasts "Create a group first" when no groups exist; link it to this wizard.
4. **Pagination visualization on the structure canvas** — page-boundary lines computed from a real paginate of the same report overlaid on the structure (map via `band.instance`/`BandMeta`), plus a "why" popover from `engine.paginated.decisions` (decision kinds in `packages/layout/src/types.ts`). Add page thumbnails strip and a design/preview split using the real pipeline.
5. e2e: Section-Expert edits write to doc; group wizard creates nested groups; explorer drag-reorder honours order rules; run full suites.

### D2-D
6. **Table designer**: colSpan/rowSpan (schema + layout + renderers + XLSX merge; task #17, GAP P2-3), multi-level headers, merge/split UI.
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
