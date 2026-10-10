// Developer view for the training hosts: lists each real request hop and drives the flow overlay.
// Every row comes from an actual fetch in this page or an event the host server emitted while handling it.
import { createFlowOverlay } from "./flow-overlay.js";

const esc = (value) => String(value).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
const kb = (bytes) => (bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`);
const newFlowId = () => `flow-${Math.random().toString(36).slice(2, 10)}`;

/**
 * @param {{ app: string, server: string, engine?: string }} names  Labels for the three parties in this demo.
 */
export function createDevTrace(names) {
  const film = new URLSearchParams(location.search).has("film");
  const overlay = createFlowOverlay({ ...names, engine: names.engine ?? "Open Reports" });
  const flows = new Map();
  const panel = document.createElement("aside");
  panel.className = "devtrace";
  panel.setAttribute("aria-label", "Developer view");
  panel.innerHTML = `<header><div><strong>Developer view</strong><span>Live requests from this page and its server</span></div>
    <label class="devtrace-switch"><input type="checkbox" ${film ? "checked" : ""}> Animate flow</label>
    <button type="button" class="devtrace-close" aria-label="Close developer view">×</button></header>
    <ol class="devtrace-flows"><li class="devtrace-empty">Click Print or Download PDF to see what happens.</li></ol>`;
  document.body.append(panel);
  const list = panel.querySelector(".devtrace-flows");
  const animate = panel.querySelector("input");
  panel.querySelector(".devtrace-close").addEventListener("click", () => setOpen(false));

  function setOpen(open) {
    panel.classList.toggle("is-open", open);
    document.body.classList.toggle("devtrace-open", open);
    document.dispatchEvent(new CustomEvent("devtrace-toggle", { detail: { open } }));
  }

  function step(flowId, html) {
    const flow = flows.get(flowId);
    if (!flow) return;
    const item = document.createElement("li");
    item.className = "devtrace-step";
    item.innerHTML = html;
    flow.steps.append(item);
    item.scrollIntoView({ block: "nearest" });
  }

  function jsonBlock(title, value) {
    if (value === undefined) return "";
    return `<details><summary>${esc(title)}</summary><pre>${esc(JSON.stringify(value, null, 2))}</pre></details>`;
  }

  const events = new EventSource("/app-api/events");
  events.onmessage = (message) => {
    const event = JSON.parse(message.data);
    if (!flows.has(event.flowId)) return;
    if (event.type === "host:step") {
      step(event.flowId, `<span class="hop hop-host">${esc(names.server)}</span><p>${esc(event.text)}</p>${event.detail ? `<code>${esc(event.detail)}</code>` : ""}`);
    } else if (event.type === "engine:request") {
      if (animate.checked) overlay.hop("server", "engine", `${event.method} ${new URL(event.url).pathname}`);
      step(event.flowId, `<span class="hop hop-out">${esc(names.server)} → Open Reports</span><p><b>${esc(event.method)}</b> ${esc(event.url)}</p>${jsonBlock("Request body", event.body)}`);
    } else if (event.type === "engine:response") {
      if (animate.checked) overlay.hop("engine", "server", event.status ? `${event.status} · ${kb(event.bytes ?? 0)}` : "failed");
      const ok = event.status >= 200 && event.status < 300;
      step(event.flowId, `<span class="hop ${ok ? "hop-ok" : "hop-bad"}">Open Reports → ${esc(names.server)}</span>
        <p><b>${event.status || "No response"}</b> ${esc(event.contentType ?? "")} · ${kb(event.bytes ?? 0)} · ${event.ms} ms</p>
        ${event.renderId ? `<code>render id ${esc(event.renderId)}</code>` : ""}${event.error ? `<p class="devtrace-error">${esc(event.error)}</p>` : ""}`);
    }
  };

  /** fetch() that records the browser → server hop and its response. */
  async function tracedFetch(url, init = {}, label = "Request") {
    const flowId = newFlowId();
    const steps = document.createElement("ol");
    const item = document.createElement("li");
    item.className = "devtrace-flow";
    item.innerHTML = `<h3>${esc(label)}<time>${new Date().toLocaleTimeString()}</time></h3>`;
    item.append(steps);
    list.querySelector(".devtrace-empty")?.remove();
    list.prepend(item);
    flows.set(flowId, { steps });
    const body = typeof init.body === "string" && init.headers?.["content-type"]?.includes("json") ? JSON.parse(init.body) : undefined;
    step(flowId, `<span class="hop hop-in">Browser → ${esc(names.server)}</span><p><b>${esc(init.method ?? "GET")}</b> ${esc(new URL(url, location.href).pathname)}</p>${jsonBlock("Request body", body)}`);
    if (animate.checked) overlay.start(label, "browser", "server", `${init.method ?? "GET"} ${new URL(url, location.href).pathname}`);
    const headers = { ...(init.headers ?? {}), "x-flow-id": flowId };
    try {
      const response = await fetch(url, { ...init, headers });
      const size = Number(response.headers.get("content-length") ?? 0);
      const type = response.headers.get("content-type") ?? "";
      if (animate.checked) overlay.hop("server", "browser", `${response.status} · ${type.split(";")[0]}`, { done: true, ok: response.ok });
      step(flowId, `<span class="hop ${response.ok ? "hop-ok" : "hop-bad"}">${esc(names.server)} → Browser</span><p><b>${response.status}</b> ${esc(type)}${size ? ` · ${kb(size)}` : ""}</p>`);
      return response;
    } catch (error) {
      if (animate.checked) overlay.hop("server", "browser", "network error", { done: true, ok: false });
      step(flowId, `<span class="hop hop-bad">Network</span><p class="devtrace-error">${esc(error.message)}</p>`);
      throw error;
    }
  }

  return { fetch: tracedFetch, setOpen, toggle: () => setOpen(!panel.classList.contains("is-open")), film };
}
