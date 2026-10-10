// CareDesk HIMS training host: a fictional hospital billing app that prints invoices with Open Reports
// and embeds the designer. Local demo only: no authentication, synthetic data.
// Run: node marketing/training-videos/fixtures/caredesk/server.mjs   (then open http://localhost:3002)
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEventHub, flowIdOf, readJson, readRegion, sendJson, serveStatic, tracedEngineCall } from "../shared/host-kit.mjs";
import { amounts, bills, branches, renderData } from "./data.mjs";
import { REPORT_DIR, describe, loadDefinition, reportPathFor, resetBranch, saveDefinition } from "./reports.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.CAREDESK_PORT || 3002);
const PUBLIC_URL = process.env.CAREDESK_PUBLIC_URL || `http://127.0.0.1:${PORT}`;
const OPEN_REPORTS_URL = (process.env.OPEN_REPORTS_URL || "http://127.0.0.1:4000").replace(/\/$/, "");
const DESIGNER_URL = (process.env.OPEN_REPORTS_DESIGNER_URL || "http://localhost:3000").replace(/\/$/, "");
const hub = createEventHub();
let failNextSave = false;

const branchOf = (value) => {
  if (!branches[value]) throw Object.assign(new Error(`Unknown branch "${value}"`), { status: 404 });
  return value;
};
const billOf = (id) => {
  const bill = bills.find((item) => item.id === id);
  if (!bill) throw Object.assign(new Error(`Bill ${id} not found`), { status: 404 });
  return bill;
};
const summary = (bill) => ({ id: bill.id, date: bill.date, visit: bill.visit, payer: bill.payer, status: bill.status, patient: bill.patient, lines: bill.items.length, ...amounts(bill) });

// #region print-invoice
async function renderInvoice(req, res, billId) {
  const flowId = flowIdOf(req);
  const bill = billOf(billId);                       // 1. The app's own record (authorise the user here).
  const reportPath = reportPathFor(bill.branch);     // 2. The app's own setting: which report file to use.
  const report = await loadDefinition(bill.branch);  //    CareDesk reads the JSON itself...
  hub.emit("host:step", { flowId, text: "Loaded the invoice definition from CareDesk's report folder", detail: reportPath });

  const { response, bytes } = await tracedEngineCall(hub, flowId, {
    engineUrl: OPEN_REPORTS_URL,
    route: "/api/v1/render",                         // 3. ...and sends the definition and the data to Open Reports.
    body: { report, format: "pdf", data: renderData(bill, PUBLIC_URL) },
    label: `Render ${bill.id}`,
  });
  if (!response.ok) return sendJson(res, 502, { error: "Open Reports could not render this invoice. See the developer view." });

  res.writeHead(200, {                               // 4. The PDF goes back to the browser to print or save.
    "content-type": "application/pdf",
    "content-length": String(bytes.byteLength),
    "content-disposition": `inline; filename="${bill.id}.pdf"`,
    "cache-control": "no-store",
  });
  res.end(bytes);
}
// #endregion

// #region save-designer-edits
async function saveFromDesigner(req, res, branch) {
  const flowId = flowIdOf(req);
  const definition = await readJson(req);
  if (failNextSave) {                                // Training switch used to film a failed save.
    failNextSave = false;
    return sendJson(res, 503, { error: "CareDesk storage is temporarily unavailable. Your edits are still in the designer." });
  }
  const { response, bytes } = await tracedEngineCall(hub, flowId, {
    engineUrl: OPEN_REPORTS_URL, route: "/api/v1/validate", body: { report: definition }, label: "Validate edited definition",
  });
  const validation = response.ok ? JSON.parse(bytes.toString("utf8")) : { valid: false };
  if (!validation.valid) return sendJson(res, 422, { error: "The edited report is not valid.", issues: validation.issues ?? [] });
  const saved = await saveDefinition(branch, definition);
  hub.emit("host:step", { flowId, text: `Saved version ${saved.version} to CareDesk's report folder`, detail: saved.path });
  sendJson(res, 200, saved);
}
// #endregion

const SOURCE_REGIONS = {
  "print-invoice": [path.join(here, "server.mjs"), "print-invoice"],
  "save-designer-edits": [path.join(here, "server.mjs"), "save-designer-edits"],
  "embed-designer": [path.join(here, "public/designer.js"), "embed-designer"],
};

async function route(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean);
  if (req.method === "GET" && url.pathname === "/app-api/events") return hub.handle(req, res);
  if (req.method === "GET" && url.pathname === "/app-api/config") {
    const reportFiles = Object.fromEntries(await Promise.all(Object.keys(branches).map(async (id) => [id, await describe(id)])));
    return sendJson(res, 200, { engineUrl: OPEN_REPORTS_URL, designerUrl: DESIGNER_URL, branches, reportFiles });
  }
  if (req.method === "GET" && url.pathname === "/app-api/bills") {
    const branch = branchOf(url.searchParams.get("branch") || "bengaluru");
    return sendJson(res, 200, bills.filter((bill) => bill.branch === branch).map(summary));
  }
  if (parts[0] === "app-api" && parts[1] === "bills" && parts[2]) {
    if (req.method === "GET" && parts.length === 3) return sendJson(res, 200, { ...billOf(parts[2]), ...amounts(billOf(parts[2])) });
    if (req.method === "POST" && parts[3] === "pdf") return renderInvoice(req, res, parts[2]);
  }
  if (url.pathname === "/app-api/definition") {
    const branch = branchOf(url.searchParams.get("branch") || "bengaluru");
    if (req.method === "GET") return sendJson(res, 200, { definition: await loadDefinition(branch), file: await describe(branch), preview: renderData(bills.find((bill) => bill.branch === branch), PUBLIC_URL) });
    if (req.method === "PUT") return saveFromDesigner(req, res, branch);
  }
  if (req.method === "GET" && url.pathname === "/app-api/source") {
    const entry = SOURCE_REGIONS[url.searchParams.get("region")];
    if (!entry) return sendJson(res, 404, { error: "Unknown source region" });
    return sendJson(res, 200, { file: path.relative(path.resolve(here, "../../../.."), entry[0]), code: await readRegion(...entry) });
  }
  if (req.method === "POST" && url.pathname === "/app-api/training/reset") {
    const { mode = "finished" } = await readJson(req);
    await Promise.all(Object.keys(branches).map((id) => resetBranch(id, mode)));
    return sendJson(res, 200, { ok: true, mode });
  }
  if (req.method === "POST" && url.pathname === "/app-api/training/fail-next-save") {
    failNextSave = true;
    return sendJson(res, 200, { ok: true });
  }
  if (req.method === "GET") {
    const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const served = await serveStatic(res, pathname, { "/shared/": path.join(here, "../shared"), "/assets/": path.join(here, "assets"), "/": path.join(here, "public") });
    if (served) return;
  }
  sendJson(res, 404, { error: "Not found" });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, PUBLIC_URL);
  try { await route(req, res, url); }
  catch (error) { if (!res.headersSent) sendJson(res, error.status || 500, { error: error.message || "Request failed" }); }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`CareDesk HIMS on http://localhost:${PORT} · engine ${OPEN_REPORTS_URL} · designer ${DESIGNER_URL} · reports in ${REPORT_DIR}`);
});
