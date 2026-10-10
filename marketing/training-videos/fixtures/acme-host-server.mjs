import http from "node:http";
import path from "node:path";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const reportRoot = process.env.ACME_REPORT_DIR || "/tmp/open-reports-acme-orders/reports/acme";
const reportPath = path.join(reportRoot, "invoice.report.json");
const engineUrl = (process.env.OPEN_REPORTS_URL || "http://127.0.0.1:4000").replace(/\/$/, "");
const trustedDefinitionUrl = "http://127.0.0.1:3001/reports/acme/invoice.report.json";
const clientBrands = {
  acme: { name: "ACME SUPPLY CO.", logo: "http://127.0.0.1:3001/assets/acme-mark.png", address: "1200 Market Street · Bengaluru 560001", phone: "+91 80 5550 2048", gstin: "29ABCDE1234F1Z5", footer: "Thank you for your business." },
  northstar: { name: "NORTHSTAR CLINIC", logo: "http://127.0.0.1:3001/assets/acme-certification.png", address: "44 Residency Road · Bengaluru 560025", phone: "+91 80 4567 8900", gstin: "29NORTH1234F1Z8", footer: "Thank you for choosing Northstar Clinic." }
};
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".css": "text/css; charset=utf-8" };
let version = 1;
let trace = { message: "No invoice has been rendered yet." };

const blankDefinition = {
  schemaVersion: "1.0", id: "acme-invoice", name: "Acme invoice", datasets: [],
  page: { size: "A4", orientation: "portrait", unit: "mm", margin: { top: 16, right: 16, bottom: 16, left: 16 } },
  sections: []
};

function json(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(value));
}
async function body(req, maxBytes = 8 * 1024 * 1024) {
  const chunks = []; let length = 0;
  for await (const chunk of req) { length += chunk.length; if (length > maxBytes) throw new Error("Request body is too large"); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
function validateDefinition(value) {
  if (!value || typeof value !== "object" || value.schemaVersion !== "1.0" || !Array.isArray(value.sections) || !value.page) throw new Error("Expected an Open Reports JSON definition.");
  return value;
}
async function storedDefinition() {
  try { return JSON.parse(await readFile(reportPath, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; return blankDefinition; }
}
async function staticFile(res, pathname) {
  if (pathname === "/reports/acme/invoice.report.json") {
    try { return json(res, 200, await storedDefinition()); }
    catch (error) { return json(res, 500, { error: error.message }); }
  }
  let file;
  if (pathname === "/") file = path.join(here, "acme-orders.html");
  else file = path.resolve(here, `.${decodeURIComponent(pathname)}`);
  const allowedRoot = pathname.startsWith("/assets/") ? path.join(here, "assets") : here;
  if (!file.startsWith(`${allowedRoot}${path.sep}`) && file !== allowedRoot) return json(res, 404, { error: "Not found" });
  try {
    const info = await stat(file);
    if (!info.isFile()) return json(res, 404, { error: "Not found" });
    const contents = await readFile(file);
    res.writeHead(200, { "content-type": mime[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(contents);
  } catch { json(res, 404, { error: "Not found" }); }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:3001");
  try {
    if (req.method === "GET" && url.pathname === "/app-api/definition") return json(res, 200, await storedDefinition());
    if (req.method === "POST" && url.pathname === "/app-api/reset-training") {
      await mkdir(reportRoot, { recursive: true });
      await writeFile(reportPath, `${JSON.stringify(blankDefinition, null, 2)}\n`, { mode: 0o600 });
      version = 1;
      trace = { message: "No invoice has been rendered yet." };
      return json(res, 200, { ok: true, version, reportPath });
    }
    if (req.method === "PUT" && url.pathname === "/app-api/definition") {
      const definition = validateDefinition(await body(req));
      await mkdir(reportRoot, { recursive: true });
      await writeFile(reportPath, `${JSON.stringify(definition, null, 2)}\n`, { mode: 0o600 });
      version += 1;
      return json(res, 200, { ok: true, version, bytes: Buffer.byteLength(JSON.stringify(definition)) });
    }
    if (req.method === "GET" && url.pathname === "/app-api/trace") return json(res, 200, trace);
    if (req.method === "POST" && url.pathname === "/app-api/render") {
      const input = await body(req);
      const source = input.source || "file";
      let report;
      if (source === "file") report = validateDefinition(await storedDefinition());
      else if (source === "object") report = validateDefinition(input.report);
      else if (source === "url") {
        const fetched = await fetch(trustedDefinitionUrl, { signal: AbortSignal.timeout(5000) });
        if (!fetched.ok) throw new Error(`Trusted report URL returned ${fetched.status}`);
        report = validateDefinition(await fetched.json());
      } else return json(res, 400, { error: "Unknown report source" });

      // The host selects approved client assets and overlays them on its stored definition for this render.
      const brand = clientBrands[input.brandId] || clientBrands.acme;
      report = structuredClone(report);
      const knownLogoPaths = Object.values(clientBrands).map((item) => new URL(item.logo).pathname);
      const replaceBrand = (value) => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) { for (const item of value) replaceBrand(item); return; }
        const imagePath = typeof value.src === "string" ? new URL(value.src, trustedDefinitionUrl).pathname : "";
        if (value.type === "image" && knownLogoPaths.includes(imagePath)) value.src = brand.logo;
        if (input.brandId !== "acme" && value.type === "text") {
          // These IDs are the editable organization name and footer in this training definition.
          // Targeting their roles keeps client branding working after a user edits the visible copy.
          if (value.id === "text-1") value.value = brand.name;
          if (value.id === "text-8") value.value = `${brand.footer} · GSTIN ${brand.gstin}`;
        }
        for (const child of Object.values(value)) if (child && typeof child === "object") replaceBrand(child);
      };
      replaceBrand(report);
      const renderData = { ...(input.data || {}), branding: [brand] };

      const renderRequest = { report, format: input.format || "pdf", data: renderData };
      const started = Date.now();
      const rendered = await fetch(`${engineUrl}/api/v1/render`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(renderRequest), signal: AbortSignal.timeout(60000)
      });
      const output = Buffer.from(await rendered.arrayBuffer());
      const renderId = rendered.headers.get("x-render-id") || "not returned";
      trace = {
        hostRoute: "POST /app-api/render", definitionSource: source === "file" ? reportPath : source === "url" ? trustedDefinitionUrl : "application JSON object",
        engineRequest: `POST ${engineUrl}/api/v1/render`, enginePayload: { report: "host-loaded JSON definition with client branding applied", format: renderRequest.format, dataKeys: Object.keys(renderRequest.data), clientBrand: brand.name },
        status: rendered.status, contentType: rendered.headers.get("content-type"), bytes: output.byteLength,
        renderId, elapsedMs: Date.now() - started, hostOwns: ["invoice authorization", "report lookup", "client branding", "PDF delivery"]
      };
      res.writeHead(rendered.status, {
        "content-type": rendered.headers.get("content-type") || "application/octet-stream",
        "content-length": String(output.byteLength), "x-render-id": renderId,
        "content-disposition": `inline; filename="INV-2048-Acme-Orders.${renderRequest.format}"`, "cache-control": "no-store"
      });
      return res.end(output);
    }
    if (req.method === "GET") return await staticFile(res, decodeURIComponent(url.pathname));
    json(res, 404, { error: "Not found" });
  } catch (error) {
    json(res, error.message === "Request body is too large" ? 413 : 400, { error: error.message || "Request failed" });
  }
});

server.listen(3001, "127.0.0.1", () => console.log(`Acme Orders demo listening on http://localhost:3001 (engine ${engineUrl}, report file ${reportPath})`));
