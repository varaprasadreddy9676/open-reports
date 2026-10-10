// Ledgerline front end: invoices downloaded from a stored template, a statement in the drop-in viewer,
// and a developer page that publishes the templates.
import { createDevTrace } from "/shared/devtrace.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const inr = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value);
const date = (value) => new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
const view = document.querySelector("#view");
const trace = createDevTrace({ app: "Ledgerline", server: "Ledgerline server" });
const devToggle = document.querySelector("#dev-toggle");
devToggle.addEventListener("click", () => trace.toggle());
document.addEventListener("devtrace-toggle", (event) => devToggle.setAttribute("aria-pressed", String(event.detail.open)));
let config;
let cleanup = () => {};

function toast(message, tone = "ok") {
  const item = Object.assign(document.createElement("div"), { className: `toast toast-${tone}`, textContent: message });
  document.querySelector("#toasts").append(item);
  setTimeout(() => item.remove(), 4000);
}
async function json(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error((await response.json()).error ?? "Request failed");
  return response.json();
}

async function render() {
  cleanup();
  cleanup = () => {};
  config = await json("/app-api/config");
  const page = (location.hash || "#/invoices").slice(2) || "invoices";
  document.querySelectorAll("[data-page]").forEach((link) => link.classList.toggle("is-active", link.dataset.page === page));
  if (page === "statements") return renderStatements();
  if (page === "developers") return renderDevelopers();
  return renderInvoices();
}

async function renderInvoices() {
  const invoices = await json("/app-api/invoices");
  view.innerHTML = `<div class="head"><div><h1>Invoices</h1><p>Invoices Brightside Coffee Co. sent through Ledgerline</p></div></div>
    <section class="card"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Method</th><th class="num">Total</th><th>Status</th><th></th></tr></thead>
    <tbody>${invoices.map((invoice) => `<tr><td><strong>${esc(invoice.id)}</strong><div class="sub">${date(invoice.date)}</div></td>
      <td>${esc(invoice.customer.name)}<div class="sub">${invoice.items.length} items</div></td><td>${esc(invoice.method)}</td>
      <td class="num"><strong>${inr(invoice.total)}</strong></td><td><span class="pill pill-${invoice.status.toLowerCase()}">${esc(invoice.status)}</span></td>
      <td class="num"><button type="button" class="btn" data-download="${esc(invoice.id)}" data-testid="ledgerline-download-${esc(invoice.id)}">⤓ Download PDF</button></td></tr>`).join("")}</tbody></table></section>`;
  view.querySelectorAll("[data-download]").forEach((button) => button.addEventListener("click", () => void download(button)));
}

async function download(button) {
  const id = button.dataset.download;
  button.setAttribute("aria-busy", "true");
  try {
    const response = await trace.fetch(`/app-api/invoices/${encodeURIComponent(id)}/pdf`, { method: "POST" }, `Download PDF · ${id}`);
    if (!response.ok) throw new Error((await response.json()).error);
    const url = URL.createObjectURL(await response.blob());
    Object.assign(document.createElement("a"), { href: url, download: `${id}.pdf` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    toast(`Downloaded ${id}.pdf`);
  } catch (error) {
    toast(error.message, "error");
  } finally {
    button.removeAttribute("aria-busy");
  }
}

async function renderStatements() {
  view.innerHTML = `<div class="head"><div><h1>Statements</h1><p>September 2026 settlements · search, sort and download in the viewer</p></div></div>
    <section class="card viewer-host" id="statement"></section>`;
  if (!config.templates["ledgerline-settlement-statement"]) {
    document.querySelector("#statement").innerHTML = `<p style="padding:24px">Publish the report templates on the Developers page first.</p>`;
    return;
  }
  const { createViewer } = await import(`${config.engineUrl}/embed/open-reports.js`);
  const statement = await json("/app-api/statement-data");

  // #region statement-viewer
  const viewer = createViewer(document.querySelector("#statement"), {
    server: config.engineUrl,                      // the viewer talks to Open Reports directly
    template: "ledgerline-settlement-statement",   // the published template, by ID
    data: statement,                               // this merchant's settlements, prepared by Ledgerline
    downloads: ["pdf", "xlsx", "csv"],
  });
  // #endregion
  cleanup = () => viewer.destroy();
}

async function renderDevelopers() {
  const rows = Object.entries(config.templates).map(([id, record]) => `<div class="template-row"><div><code>${esc(id)}</code><div class="sub">${record ? `Stored in Open Reports · ${esc(record.status)} version ${esc(record.currentVersion)}` : "Not published yet"}</div></div><span class="pill ${record ? "pill-paid" : "pill-pending"}">${record ? "Published" : "Missing"}</span></div>`).join("");
  view.innerHTML = `<div class="head"><div><h1>Developers</h1><p>How Ledgerline uses Open Reports</p></div></div>
    <div class="dev-grid">
      <section class="card dev-card"><h2>Report templates</h2><p>Ledgerline publishes its layouts to Open Reports once, then renders them by template ID.</p>${rows}
        <div style="margin-top:16px"><button type="button" class="btn primary" id="publish" data-testid="ledgerline-publish">Publish templates to Open Reports</button></div></section>
      <section class="card dev-card"><h2>Download an invoice</h2><p>The server sends only the template ID, the format and the data.</p><pre class="code" id="code-download">Loading…</pre></section>
      <section class="card dev-card"><h2>Publish the templates</h2><p>Runs once per layout change, for example in a deploy step.</p><pre class="code" id="code-publish">Loading…</pre></section>
      <section class="card dev-card"><h2>Statement viewer</h2><p>The drop-in viewer on the Statements page.</p><pre class="code" id="code-viewer">Loading…</pre></section>
    </div>`;
  for (const [region, target] of [["download-invoice", "#code-download"], ["publish-templates", "#code-publish"], ["statement-viewer", "#code-viewer"]]) {
    json(`/app-api/source?region=${region}`).then(({ code }) => { document.querySelector(target).textContent = code; });
  }
  document.querySelector("#publish").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.setAttribute("aria-busy", "true");
    try {
      const response = await trace.fetch("/app-api/templates/publish", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }, "Publish report templates", { animate: false });
      if (!response.ok) throw new Error((await response.json()).error);
      toast("Templates published to Open Reports");
      await render();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      button.removeAttribute("aria-busy");
    }
  });
}

addEventListener("hashchange", () => void render());
void render();
