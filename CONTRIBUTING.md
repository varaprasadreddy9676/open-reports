# Contributing

## Setup
```bash
corepack enable            # pnpm 10
pnpm install
sudo apt-get install fonts-noto-core poppler-utils   # fonts decide pagination; poppler is used by PDF tests
pnpm -r --filter "./packages/**" build && pnpm --filter @reporting/server build
```

## Everyday commands
| Task | Command |
|---|---|
| All package tests | `pnpm -r --filter "./packages/**" test` |
| Server tests (incl. security, examples, visual) | `pnpm --filter @reporting/server test` |
| Designer unit / end-to-end | `pnpm --filter @reporting/designer test` / `... exec playwright test` |
| Run server + designer | `PORT=4000 node apps/server/dist/index.js` and `pnpm --filter @reporting/designer dev` |
| Regenerate sample reports | `node scripts/build-examples.mjs` |
| Benchmarks | `pnpm --filter @reporting/server bench` |

SQL datasource tests need PostgreSQL (`reporting_test`, user `postgres`) and MySQL/MariaDB (`reporting_test`, user `reporting`) running locally; CI provides both.

## Ground rules
1. **The report definition JSON is the single model.** UI, SDK and AI features edit it; they never keep a second copy of the truth.
2. **Determinism.** Same definition + data + fonts must give the same pages. Anything that can change layout (fonts, measurement) must be covered by a test.
3. **No `eval`, no dynamic code in reports.** Expressions go through `@reporting/expressions` only.
4. **Renderers never compute business logic.** They consume the Resolved Report Tree.
5. **Add a test with every behaviour change.** Pagination changes need a case in `renderer-pdf/tests/pagination-boundary.test.ts` or `layout/tests`. Visual output changes need refreshed baselines: `UPDATE_BASELINES=1 pnpm --filter @reporting/server test visual` — review the PNG diffs in the PR.
6. Security-relevant changes (datasources, expressions, renderers' escaping) need a case in `apps/server/tests/security.test.ts`.

## Pull requests
Keep them focused, describe the user-visible change, and note any schema change (schemas are versioned; breaking changes need a migration path).
