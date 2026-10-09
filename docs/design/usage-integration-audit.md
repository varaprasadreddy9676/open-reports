# Reporting workflow and integration UX audit

Reviewed: 9 October 2026. Baseline: `dc2f56c` (the deployed Learning Studio release).

## Result

The host-owned reporting workflow is usable after the fixes below: load JSON, preview authorized sample data, edit, save through the host callback, and render the same definition without an Open Reports template record. A separate HTTP host application and the deployed demo were exercised with fictional data. This is evidence for the tested contracts, not a guarantee for every application's deployment or browser.

## Issues reproduced and fixed

| Area | Observed problem | Resolution |
| --- | --- | --- |
| Host persistence | A synchronous callback exception left Save pending indefinitely. | Catch synchronous and asynchronous failures; preserve edits, report the error, and allow retry. |
| Save under concurrent editing | Save events could return the current definition instead of the snapshot actually stored. | Return the acknowledged snapshot; keep later edits dirty; coalesce repeated SDK saves. |
| Save lifecycle | No bounded wait; callbacks could outlive a reloaded frame. | Configurable save timeout, cleanup on destroy, and ignore replies belonging to an older frame. |
| Reload/reconnect | The original JSON reopened after a successful host save. | Reopen the latest confirmed saved or successfully loaded definition; custom elements retain it through reconnect. |
| Host preview | Initial data/parameters had no public designer option; undeclared preview objects disappeared. | `data`, `parameters`, and `load(definition, preview)` work without adding sample values to saved JSON. |
| Host UI | Publish, server template actions, “unsaved” version pills, and local-draft wording appeared in host mode. | Show host save status and Open file; leave publishing and version history with the host. |
| Host isolation | An embedded designer inherited browser connection settings and wrote report/sample data into the standalone local draft. | Session-only embedded connection settings; no embedded local-draft persistence. |
| Export/reopen | Exported JSON had no obvious file-opening workflow. | Validated JSON file picker in Open, with invalid-file feedback and existing replacement protection. |
| Shared headers/footers | Exported bundled subreports were ignored when the JSON was sent directly to the engine. | Resolve bundled children recursively; explicit request resources can override them. |
| Viewer recovery | A rejected first lookup was retained forever, so Refresh could not recover. | Retry initial lookup; show progress, disable unavailable print/download controls, ignore obsolete request errors. |
| Settings | A web page with HTTP 200 was reported as a working API; Save accepted invalid server URLs. | Check the response shape and validate before saving. Add an embedded-editor quick start. |
| Text editing | Resize handles overlapped the centre of small text, blocking double-click editing. | Hide overlapping middle handles on small objects; corners remain available. |
| Placement | Automatic-width text kept a full-width box after an x offset and failed printable-width checks. | Use the remaining width in free layout and page headers/footers. Explicit widths retain their intended geometry. |
| Absolute layout | New elements in an absolute band lacked X/Y controls until they had explicit coordinates. | Show coordinates whenever the parent uses absolute layout. |
| Command palette | Modal focus moved from the search field to Close, preventing immediate typing. | Give the command input explicit initial focus. |

## Coverage

| Journey | Evidence |
| --- | --- |
| Create a report | Blank/JSON/sample starters, data binding, tables, expressions, styles, PDF, save/reopen/export and publication checks. |
| Designer modes and panels | Design, Data, Code, Preview; Structure, Components, Pages; page/print/details and element content/style/layout/rules inspectors. |
| Direct editing | Drag, live resize, keyboard, undo/redo, grouping, guides, snap, layout handles, small text editing, sidebar search and focus mode. |
| Tables and pagination | Multi-level headers, merge/split, conditions, groups, totals, row splitting, page masters and break explanations. |
| Printing | A4 report journeys, label calibration/profiles, continuous receipt and a 500-item bill, PDF/ZPL/ESC/POS previews. Physical printers were not used. |
| Reuse/import | JSON reopening, file-picked subreports, reusable blocks, DOCX and JRXML import paths. |
| Integration | Actual second-origin host; native custom elements and JS API; host-owned and stored-template modes; save failures/timeouts, delayed save edits, reconnect, preview data and no server template storage. |
| Interactive viewer | Parameters, refresh, downloads, search, contents, sort, drill-through/back and drill-down; failed-first-request recovery and bundled child overrides. |
| Developer surfaces | Connection validation, all HTTP example languages, clipboard, embedded-designer example, API/embedding links and preferences. |
| Extensions | Plugin and MCP API tests; AI UX uses a mocked provider. No real paid AI provider was called. |

### Verification results

- Production build passed on an isolated checkout of the deployed baseline plus these changes.
- Broad browser run: 225 passed, one font-position check failed while the canvas was still settling. Waiting for font/layout readiness preserved its original tolerances; it then passed three repeated runs and the release check.
- Release browser checks: 25 passed, including embedding/settings, font parity and visual version comparison.
- Designer unit tests: 189 passed. Core/layout/embed/client tests: 248 passed.
- Server functional tests: 228 passed, including bundled-header rendering and absence of server template storage.
- Live API: 20 successful renders — two fictional clients × five formats × local/live. Each live PDF had all 80 rows exactly once, the correct client name/footer and three A4 pages. Word contained all 80 rows and A4 portrait page settings. Base64 encoding/decoding preserved the PDF bytes.
- Invalid report and invalid format requests returned structured HTTP 400 errors.

Screenshots, PDFs, Word/Excel/CSV/HTML outputs, request result metadata and the screenshot manifest are kept locally in `output/playwright/usage-audit/`. Generated audit captures and the temporary host harness are not part of the release.

## Remaining verification boundaries

- Ten legacy PDF screenshot baselines differed from the current samples before these fixes. They were not replaced or counted as passing. They need a separate reviewed baseline refresh.
- The six video-production scenarios are intentionally skipped unless video recording is enabled. Existing training playback was verified in the prior release.
- Real external SQL/REST credentials, every host authentication/proxy configuration, physical printers, and a real AI provider were not exercised here.
- Cross-origin testing used Chromium. This does not certify every Safari/Firefox release, restrictive CSP, or reverse-proxy path layout.
- Unsaved edits do not survive an iframe reload. Host saving is confirmed persistence; the engine does not own the application's versioning or tenant policy.
