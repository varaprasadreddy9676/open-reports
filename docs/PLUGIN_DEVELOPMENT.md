# Plugin development

A plugin is an object with a `name` and a `setup(api)` function. It is loaded **in-process** at server start, so only install plugins you trust.

```ts
import { definePlugin } from "@reporting/plugin-sdk";

export default definePlugin({
  name: "acme-pack",            // lowercase letters, digits, . _ -
  version: "1.0.0",
  setup(api) {
    api.registerExpressionFunction("initials", (n) => String(n).split(" ").map((w) => w[0]).join(""), "initials(name)");
    api.registerComponent("statusBadge", (props) => [/* ordinary components */]);
    api.registerRenderer({ format: "txt", renderer, mimeType: "text/plain", supports: ["text", "table"] });
    api.registerDataSource("number-range", { execute: async (def) => ({ value: [...] }) });
  },
  dispose() { /* close connections */ },
});
```

## What you can register
| Call | Use in a report | Rules |
|---|---|---|
| `registerExpressionFunction(name, fn, doc?)` | `initials(data.p.name)` | Pure, synchronous, deterministic. Cannot shadow built-ins (`upper`, `sum`, …). Errors are reported with the function name. |
| `registerComponent(kind, expand, meta?)` | `{ "type": "custom", "kind": "statusBadge", "props": {...} }` | `expand(props, ctx)` returns ordinary components, so PDF, HTML, XLSX, … all work with no extra code. Unknown kinds become a warning, not a crash. |
| `registerRenderer({format, renderer, mimeType, supports})` | `POST /render` with `"format": "txt"` | Implements `ReportRenderer`. Cannot replace `pdf/html/xlsx/csv/zpl`. `supports` feeds the designer's "target" warnings. |
| `registerDataSource(name, ds)` | dataset `"source": "plugin:<name>"` | `execute(definition, {parameters, limits})` → `{ value }`. Honour `limits.maxRows` and `limits.timeoutMs`. |
| `registerStorage(provider)` | — | Full `StorageProvider` (templates, versions, blocks). One per server. |

Registration is **transactional**: if `setup` throws, nothing it registered is kept, the plugin is marked `failed` (see `GET /api/v1/plugins`), and the others keep working.

## Loading
```bash
REPORT_PLUGINS="@reporting/plugin-clinic-pack,./plugins/acme-pack.mjs" node apps/server/dist/index.js
```
Entries are npm module names or paths starting with `.`/`/`. The default export may be a plugin or a factory `(options) => plugin`. Programmatically: `loadPlugins([...], registry)` then `buildApp({ plugins: registry })`.

In the Docker image, install the package in a derived image (`RUN npm i --prefix /app acme-pack`) and set `REPORT_PLUGINS`.

## Testing a plugin
Register it in a `PluginRegistry`, build the app with `buildApp({ plugins })` and call `app.inject(...)` — see `apps/server/tests/plugins.test.ts` and `packages/plugin-sdk/tests/registry.test.ts`. The complete worked example is `packages/plugin-clinic-pack`.

## Designer support
Plugin components appear under **Components → Plugins**. The designer runs in the browser and cannot execute server plugins, so they show as a placeholder with a "previews in Preview" hint; the Preview tab and exports render them for real.
