import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 4000);
const dbPath = process.env.DB_PATH ?? "./reporting.sqlite";
const apiKeys = (process.env.API_KEYS ?? "").split(",").map((k) => k.trim()).filter(Boolean);

if (apiKeys.length === 0) {
  // eslint-disable-next-line no-console
  console.warn("[reporting-server] WARNING: API_KEYS is not set -- the server is running with NO authentication. Set API_KEYS for anything beyond local development.");
}

const { app } = buildApp({ dbPath, apiKeys });

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
