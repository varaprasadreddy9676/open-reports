# Contributing

## Setup
```bash
corepack enable            # pnpm 10
pnpm install
sudo apt-get install fonts-noto-core poppler-utils   # fonts decide pagination; poppler is used by PDF tests
pnpm doctor                # verifies everything
pnpm build:all
```

## Everyday commands
| Task | Command |
|---|---|
| All package tests | `pnpm -r --filter "./packages/**" test` |
| Server tests (incl. security, examples, visual) | `pnpm --filter @reporting/server test` |
| Designer unit / end-to-end | `pnpm --filter @reporting/designer test` / `... exec playwright test` |
| Run server + designer (hot reload) | `pnpm dev` (API :4000, designer :3000) |
| Run the production build | `pnpm start` (:4000) |
| Regenerate README screenshots | `SCREENSHOTS=1 pnpm --filter @reporting/designer exec playwright test screenshots` |
| Regenerate sample reports | `node scripts/build-examples.mjs` |
| Benchmarks | `pnpm --filter @reporting/server bench` |

SQL datasource tests need PostgreSQL (`reporting_test`, user `postgres`) and MySQL/MariaDB (`reporting_test`, user `reporting`) running locally; CI provides both.

Working on the canvas, embedding, crosstabs, the interactive viewer, DOCX, charts or RDL import? Start with [docs/design/competitive-features.md](docs/design/competitive-features.md): where the code is, how to test it, the tests that already fail for unrelated reasons, and plans for the parts not built yet.

## Ground rules
1. **The report definition JSON is the single model.** UI, SDK and AI features edit it; they never keep a second copy of the truth.
2. **Determinism.** Same definition + data + fonts must give the same pages. Anything that can change layout (fonts, measurement) must be covered by a test.
3. **No `eval`, no dynamic code in reports.** Expressions go through `@reporting/expressions` only.
4. **Renderers never compute business logic.** They consume the Resolved Report Tree.
5. **Add a test with every behaviour change.** Pagination changes need a case in `renderer-pdf/tests/pagination-boundary.test.ts` or `layout/tests`. Visual output changes need refreshed baselines: `UPDATE_BASELINES=1 pnpm --filter @reporting/server test visual` — review the PNG diffs in the PR.
6. Security-relevant changes (datasources, expressions, renderers' escaping) need a case in `apps/server/tests/security.test.ts`.

## Good first contributions
- A **starter template** for your industry: add it to `scripts/build-examples.mjs`, run `pnpm examples`, register its group in `apps/designer/src/lib/templates.ts`.
- Docs fixes and recipes in `docs/USE_CASES.md`.
- A plugin (data source, format, formula functions) — see `docs/PLUGIN_DEVELOPMENT.md`.
- Anything labelled `roadmap` (PDF/A, signatures, footnotes/TOC, EPL, SDK/CLI) — comment first so we can agree on the design.

## Pull requests
Keep them focused, describe the user-visible change, and note any schema change (schemas are versioned; breaking changes need a migration path).
