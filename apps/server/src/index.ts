import { loadPlugins, PluginRegistry } from "@reporting/plugin-sdk";
import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 4000);
const dbPath = process.env.DB_PATH ?? "./reporting.sqlite";
const apiKeys = (process.env.API_KEYS ?? "").split(",").map((k) => k.trim()).filter(Boolean);

if (apiKeys.length === 0) {
  // eslint-disable-next-line no-console
  console.warn("[reporting-server] WARNING: API_KEYS is not set -- the server is running with NO authentication. Set API_KEYS for anything beyond local development.");
}

const designerDist = process.env.DESIGNER_DIST;

// REPORT_PLUGINS="@reporting/plugin-clinic-pack,./my-plugin.mjs" -- loaded before the server starts; a failing plugin is skipped and reported at /api/v1/plugins.
const plugins = new PluginRegistry({ logger: (m) => console.log(m) });
const specs = (process.env.REPORT_PLUGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
await loadPlugins(specs.map((s) => (s.startsWith(".") || s.startsWith("/") ? new URL(s, `file://${process.cwd()}/`).href : s)), plugins);
for (const st of plugins.statuses) console.log(`[reporting-server] plugin ${st.name}: ${st.state}${st.error ? ` (${st.error})` : ""}`);

const { app } = buildApp({ dbPath, apiKeys, designerDist, plugins });

app
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    // eslint-disable-next-line no-console
    console.log(`[reporting-server] listening on http://localhost:${port}`);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
