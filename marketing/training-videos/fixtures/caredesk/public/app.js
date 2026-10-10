// CareDesk HIMS front end: bill list, bill detail with Print / Download PDF, and the invoice designer screen.
import { createDevTrace } from "/shared/devtrace.js";
import { openDesigner } from "./designer.js";
import { $, date, esc, inr, openModal, showSource, statusChip, toast } from "./ui.js";

const trace = createDevTrace({ app: "CareDesk HIMS", server: "CareDesk server" });
const view = $("#view");
const state = { config: null, branch: sessionStorage.getItem("caredesk-branch") || "bengaluru", closeDesigner: null };

const devToggle = $("#dev-toggle");
devToggle.addEventListener("click", () => trace.toggle());
document.addEventListener("devtrace-toggle", (event) => devToggle.setAttribute("aria-pressed", String(event.detail.open)));
if (trace.film) trace.setOpen(true);

async function api(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error((await response.json()).error ?? `Request failed (${response.status})`);
  return response.json();
}

async function init() {
  state.config = await api("/app-api/config");
  const select = $("#branch");
  select.innerHTML = Object.values(state.config.branches).map((branch) => `<option value="${branch.id}">${esc(branch.label)}</option>`).join("");
  select.value = state.branch;
  select.addEventListener("change", () => {
    state.branch = select.value;
    sessionStorage.setItem("caredesk-branch", state.branch);
    location.hash = "#/bills";
    void render();
  });
  $("#search").addEventListener("input", () => { if (location.hash.startsWith("#/bills") && location.hash.split("/").length === 2) void render(); });
  addEventListener("hashchange", () => void render());
  await render();
}

async function render() {
  state.closeDesigner?.();
  state.closeDesigner = null;
  const [, page, id] = (location.hash || "#/bills").split("/");
  try {
    if (page === "design") return await renderDesigner();
    if (page === "bills" && id) return await renderBill(decodeURIComponent(id));
    return await renderBills();
  } catch (error) {
    view.innerHTML = `<div class="card facts"><h3>Something went wrong</h3><p>${esc(error.message)}</p></div>`;
  }
}

async function renderBills() {
  $("#crumbs").innerHTML = "Billing / <b>Invoices</b>";
  const query = $("#search").value.trim().toLowerCase();
  const all = await api(`/app-api/bills?branch=${state.branch}`);
  const bills = all.filter((bill) => !query || `${bill.id} ${bill.patient.name} ${bill.patient.uhid}`.toLowerCase().includes(query));
  const collected = all.reduce((sum, bill) => sum + bill.paid, 0);
  const due = all.reduce((sum, bill) => sum + bill.balance, 0);
  view.innerHTML = `
    <div class="page-head"><div><h1>Invoices</h1><p>${esc(state.config.branches[state.branch].label)}</p></div>
      <button type="button" class="button" id="design-invoice">Design invoice layout</button></div>
    <section class="kpis" aria-label="Today">
      <div class="kpi"><small>Bills</small><strong>${all.length}</strong></div>
      <div class="kpi"><small>Collected</small><strong>${inr(collected)}</strong></div>
      <div class="kpi"><small>Outstanding</small><strong>${inr(due)}</strong></div>
      <div class="kpi"><small>Invoice layout</small><strong>v${state.config.reportFiles[state.branch].version || 1}</strong></div>
    </section>
    <section class="card"><div class="card-head"><h2>Recent bills</h2><span class="muted">${bills.length} shown</span></div>
      <table class="grid"><thead><tr><th>Bill</th><th>Patient</th><th>Visit</th><th>Payer</th><th class="num">Amount</th><th>Status</th></tr></thead>
      <tbody>${bills.map((bill) => `<tr class="is-link" data-id="${esc(bill.id)}" tabindex="0">
        <td><strong>${esc(bill.id)}</strong><br><small class="muted">${date(bill.date)}</small></td>
        <td class="patient-cell"><strong>${esc(bill.patient.name)}</strong><small>${esc(bill.patient.uhid)} · ${bill.patient.age} y · ${esc(bill.patient.sex)}</small></td>
        <td>${esc(bill.visit)}<br><small class="muted">${bill.lines} services</small></td><td>${esc(bill.payer)}</td>
        <td class="num"><strong>${inr(bill.net)}</strong></td><td>${statusChip(bill.status)}</td></tr>`).join("")}</tbody></table></section>`;
  view.querySelectorAll("tr.is-link").forEach((row) => {
    const open = () => { location.hash = `#/bills/${encodeURIComponent(row.dataset.id)}`; };
    row.addEventListener("click", open);
    row.addEventListener("keydown", (event) => { if (event.key === "Enter") open(); });
  });
  $("#design-invoice").addEventListener("click", () => { location.hash = "#/design"; });
}

async function renderBill(id) {
  const bill = await api(`/app-api/bills/${encodeURIComponent(id)}`);
  $("#crumbs").innerHTML = `Billing / Invoices / <b>${esc(bill.id)}</b>`;
  view.innerHTML = `
    <div class="page-head"><div><button type="button" class="back-link" id="back">← All invoices</button><h1>${esc(bill.id)} ${statusChip(bill.status)}</h1><p>${date(bill.date)} · ${esc(bill.visit)}</p></div>
      <div class="bill-actions">
        <button type="button" class="how-link" id="how">How does Print work?</button>
        <button type="button" class="button" id="design">Design invoice</button>
        <button type="button" class="button" id="download" data-testid="caredesk-download">⤓ Download PDF</button>
        <button type="button" class="button primary" id="print" data-testid="caredesk-print">⎙ Print invoice</button>
      </div></div>
    <div class="bill-grid">
      <section class="card facts"><h3>Patient</h3><p class="big">${esc(bill.patient.name)}</p><p>${esc(bill.patient.uhid)} · ${bill.patient.age} y · ${esc(bill.patient.sex)}</p><p class="muted">${esc(bill.patient.phone)}</p></section>
      <section class="card facts"><h3>Visit</h3><p class="big">${esc(bill.visit)}</p><p>${esc(bill.doctor)}</p><p class="muted">Payer: ${esc(bill.payer)}</p></section>
      <section class="card totals" aria-label="Amounts">
        <div><span>Subtotal</span><span>${inr(bill.subtotal)}</span></div><div><span>Discount</span><span>${inr(bill.discount)}</span></div>
        <div><span>Paid (${esc(bill.paymentMode)})</span><span>${inr(bill.paid)}</span></div><div class="grand"><span>Balance due</span><span>${inr(bill.balance)}</span></div></section>
    </div>
    <section class="card"><div class="card-head"><h2>Services</h2><span class="muted">${bill.items.length} lines</span></div>
      <table class="grid"><thead><tr><th>Service</th><th>Department</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
      <tbody>${bill.items.map((item) => `<tr><td>${esc(item.description)}</td><td>${esc(item.category)}</td><td class="num">${item.quantity}</td><td class="num">${inr(item.rate)}</td><td class="num">${inr(item.quantity * item.rate)}</td></tr>`).join("")}</tbody></table></section>`;
  $("#back").addEventListener("click", () => { location.hash = "#/bills"; });
  $("#design").addEventListener("click", () => { location.hash = "#/design"; });
  $("#how").addEventListener("click", () => void showSource("print-invoice", "CareDesk server · what happens when you click Print"));
  $("#print").addEventListener("click", (event) => void deliver(bill, "print", event.currentTarget));
  $("#download").addEventListener("click", (event) => void deliver(bill, "download", event.currentTarget));
}

async function deliver(bill, purpose, button) {
  button.setAttribute("aria-busy", "true");
  button.disabled = true;
  try {
    const response = await trace.fetch(`/app-api/bills/${encodeURIComponent(bill.id)}/pdf`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ purpose }),
    }, `${purpose === "print" ? "Print" : "Download PDF"} · ${bill.id}`);
    if (!response.ok) throw new Error((await response.json()).error ?? "Could not create the invoice PDF");
    const url = URL.createObjectURL(await response.blob());
    if (purpose === "download") {
      const link = Object.assign(document.createElement("a"), { href: url, download: `${bill.id}.pdf` });
      link.click();
      toast(`Downloaded ${bill.id}.pdf`);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } else {
      const frame = Object.assign(document.createElement("iframe"), { className: "pdf-frame", src: url, title: `${bill.id} invoice PDF` });
      const dialog = openModal({ title: `Print ${bill.id}`, body: frame, wide: true });
      frame.addEventListener("load", () => setTimeout(() => { try { frame.contentWindow.print(); } catch { /* the PDF toolbar's print button still works */ } }, 500));
      dialog.addEventListener("close", () => URL.revokeObjectURL(url));
    }
  } catch (error) {
    toast(error.message, "error");
  } finally {
    button.removeAttribute("aria-busy");
    button.disabled = false;
  }
}

async function renderDesigner() {
  $("#crumbs").innerHTML = "Billing / Settings / <b>Invoice layout</b>";
  state.closeDesigner = await openDesigner(view, { branch: state.branch, config: state.config, trace, onSaved: (file) => { state.config.reportFiles[state.branch] = file; } });
}

void init();
