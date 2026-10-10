// Small UI helpers for CareDesk: formatting, toasts and a modal.
export const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
export const inr = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
export const date = (value) => new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
export const $ = (selector, root = document) => root.querySelector(selector);

export function toast(message, tone = "ok") {
  const host = $("#toasts");
  const item = document.createElement("div");
  item.className = `toast toast-${tone}`;
  item.setAttribute("role", tone === "error" ? "alert" : "status");
  item.textContent = message;
  host.append(item);
  setTimeout(() => item.classList.add("is-leaving"), 3800);
  setTimeout(() => item.remove(), 4200);
}

export function openModal({ title, body, wide = false }) {
  const dialog = document.createElement("dialog");
  dialog.className = `modal${wide ? " modal-wide" : ""}`;
  dialog.innerHTML = `<header><h2>${esc(title)}</h2><button type="button" class="icon-button" aria-label="Close">×</button></header><div class="modal-body"></div>`;
  dialog.querySelector(".modal-body").append(body);
  dialog.querySelector("header button").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

export function statusChip(status) {
  return `<span class="chip chip-${status === "Paid" ? "paid" : "due"}">${esc(status)}</span>`;
}

/** Shows the server-side code region that actually handles a request. */
export async function showSource(region, title) {
  const response = await fetch(`/app-api/source?region=${encodeURIComponent(region)}`);
  const { file, code } = await response.json();
  const body = document.createElement("div");
  body.innerHTML = `<p class="source-file">${esc(file)}</p><pre class="source-code"><code>${esc(code)}</code></pre>`;
  openModal({ title, body, wide: true });
}
