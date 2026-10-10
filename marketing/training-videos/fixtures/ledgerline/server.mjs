// Ledgerline training host: a fictional payments dashboard that keeps its report layouts as published
// Open Reports templates and renders them by template ID. Local demo only: no authentication, synthetic data.
// Run: node marketing/training-videos/fixtures/ledgerline/server.mjs   (then open http://localhost:3003)
import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createEventHub, flowIdOf, readJson, pdfjsDir, readRegion, sendJson, serveStatic, tracedEngineCall } from "../shared/host-kit.mjs";
import { invoiceAmounts, invoiceData, invoices, merchant, statementData } from "./data.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.LEDGERLINE_PORT || 3003);
const PUBLIC_URL = process.env.LEDGERLINE_PUBLIC_URL || `http://127.0.0.1:${PORT}`;
const OPEN_REPORTS_URL = (process.env.OPEN_REPORTS_URL || "http://127.0.0.1:4000").replace(/\/$/, "");
const hub = createEventHub();
const TEMPLATES = {
  "ledgerline-merchant-invoice": "reports/merchant-invoice.report.json",
  "ledgerline-settlement-statement": "reports/settlement-statement.report.json",
};

const invoiceOf = (id) => {
  const invoice = invoices.find((item) => item.id === id);
  if (!invoice) throw Object.assign(new Error(`Invoice ${id} not found`), { status: 404 });
  return invoice;
};

// #region publish-templates
async function publishTemplates(req, res) {
  const flowId = flowIdOf(req);
  const published = [];
  for (const [id, file] of Object.entries(TEMPLATES)) {
    const definition = JSON.parse(await readFile(path.join(here, file), "utf8"));
    const existing = await fetch(`${OPEN_REPORTS_URL}/api/v1/templates/${id}`);
    const call = existing.status === 404
      ? { route: "/api/v1/templates", body: { id, name: definition.name, definition } }        // first time: create it
      : { method: "PUT", route: `/api/v1/templates/${id}`, body: { definition, publish: true } }; // later: new version
    const { response, bytes } = await tracedEngineCall(hub, flowId, { engineUrl: OPEN_REPORTS_URL, label: `Store ${id}`, ...call });
    if (!response.ok) return sendJson(res, 502, { error: JSON.parse(bytes.toString("utf8")).error?.message ?? "Could not store the template" });
    if (existing.status === 404) {
      const publish = await tracedEngineCall(hub, flowId, { engineUrl: OPEN_REPORTS_URL, route: `/api/v1/templates/${id}/versions/1/publish`, body: {}, label: `Publish ${id}` });
      if (!publish.response.ok) return sendJson(res, 502, { error: "Could not publish the template" });
    }
    published.push(id);
  }
  sendJson(res, 200, { published });
}
// #endregion

// #region download-invoice
async function renderInvoice(req, res, invoiceId) {
  const flowId = flowIdOf(req);
  const invoice = invoiceOf(invoiceId);
  hub.emit("host:step", { flowId, text: "Ledgerline looked up the invoice; the layout lives in Open Reports as a published template", detail: "template ledgerline-merchant-invoice" });
  const { response, bytes } = await tracedEngineCall(hub, flowId, {
    engineUrl: OPEN_REPORTS_URL,
    route: "/api/v1/templates/ledgerline-merchant-invoice/render",   // render by template ID: no definition in the request
    body: { format: "pdf", data: invoiceData(invoice, PUBLIC_URL) },
    label: `Render ${invoice.id}`,
  });
  if (!response.ok) return sendJson(res, 502, { error: "Open Reports could not render this invoice. Publish the templates first." });
  res.writeHead(200, { "content-type": "application/pdf", "content-length": String(bytes.byteLength), "content-disposition": `attachment; filename="${invoice.id}.pdf"`, "cache-control": "no-store" });
  res.end(bytes);
}
// #endregion

const SOURCE_REGIONS = {
  "publish-templates": [path.join(here, "server.mjs"), "publish-templates"],
  "download-invoice": [path.join(here, "server.mjs"), "download-invoice"],
  "statement-viewer": [path.join(here, "public/app.js"), "statement-viewer"],
};

async function route(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean);
  if (req.method === "GET" && url.pathname === "/app-api/events") return hub.handle(req, res);
  if (req.method === "GET" && url.pathname === "/app-api/config") {
    const status = await Promise.all(Object.keys(TEMPLATES).map(async (id) => {
      try { const r = await fetch(`${OPEN_REPORTS_URL}/api/v1/templates/${id}`); return [id, r.ok ? await r.json() : null]; } catch { return [id, null]; }
    }));
    return sendJson(res, 200, { engineUrl: OPEN_REPORTS_URL, merchant, templates: Object.fromEntries(status) });
  }
  if (req.method === "GET" && url.pathname === "/app-api/invoices") return sendJson(res, 200, invoices.map((invoice) => ({ ...invoice, ...invoiceAmounts(invoice) })));
  if (parts[0] === "app-api" && parts[1] === "invoices" && parts[2] && parts[3] === "pdf" && req.method === "POST") return renderInvoice(req, res, parts[2]);
  if (req.method === "GET" && url.pathname === "/app-api/statement-data") return sendJson(res, 200, statementData(PUBLIC_URL));
  if (req.method === "POST" && url.pathname === "/app-api/templates/publish") { await readJson(req); return publishTemplates(req, res); }
  if (req.method === "GET" && url.pathname === "/app-api/source") {
    const entry = SOURCE_REGIONS[url.searchParams.get("region")];
    if (!entry) return sendJson(res, 404, { error: "Unknown source region" });
    return sendJson(res, 200, { file: path.relative(path.resolve(here, "../../../.."), entry[0]), code: await readRegion(...entry) });
  }
  if (req.method === "GET") {
    const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    if (await serveStatic(res, pathname, { "/vendor/pdfjs/": pdfjsDir(), "/shared/": path.join(here, "../shared"), "/": path.join(here, "public") })) return;
  }
  sendJson(res, 404, { error: "Not found" });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, PUBLIC_URL);
  try { await route(req, res, url); }
  catch (error) { if (!res.headersSent) sendJson(res, error.status || 500, { error: error.message || "Request failed" }); }
}).listen(PORT, "127.0.0.1", () => console.log(`Ledgerline on http://localhost:${PORT} · engine ${OPEN_REPORTS_URL}`));
