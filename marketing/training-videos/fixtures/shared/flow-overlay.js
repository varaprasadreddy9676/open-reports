// Full-screen request-flow explainer for the film. It only animates hops the developer view has observed;
// hops are queued so each stays on screen long enough to read, even when the real request is faster.
const MIN_HOP_MS = 900;
const HOLD_AFTER_MS = 1800;

const esc = (value) => String(value).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

export function createFlowOverlay({ app, server, engine }) {
  const root = document.createElement("div");
  root.className = "flow-overlay";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `<div class="flow-card">
      <p class="flow-title"></p>
      <div class="flow-lane">
        <div class="flow-node" data-node="browser"><span class="flow-icon">◧</span><strong>Browser</strong><small>${esc(app)}</small></div>
        <div class="flow-edge" data-edge="browser-server"><i></i><span></span></div>
        <div class="flow-node" data-node="server"><span class="flow-icon">▤</span><strong>${esc(server)}</strong><small>loads report + data</small></div>
        <div class="flow-edge" data-edge="server-engine"><i></i><span></span></div>
        <div class="flow-node" data-node="engine"><span class="flow-icon">◆</span><strong>${esc(engine)}</strong><small>renders the PDF</small></div>
      </div>
      <p class="flow-result"></p>
    </div>`;
  document.body.append(root);
  const queue = [];
  let running = false;
  let hideTimer;

  const edgeFor = (from, to) => root.querySelector(`[data-edge="${[from, to].includes("engine") ? "server-engine" : "browser-server"}"]`);

  async function play({ from, to, label, done, ok }) {
    clearTimeout(hideTimer);
    root.classList.add("is-visible");
    root.querySelectorAll(".flow-node").forEach((node) => node.classList.toggle("is-active", node.dataset.node === to || node.dataset.node === from));
    const edge = edgeFor(from, to);
    edge.querySelector("span").textContent = label;
    // Forward is left-to-right: browser → server → engine. Replies travel back.
    edge.dataset.direction = from === "browser" || (from === "server" && to === "engine") ? "forward" : "back";
    edge.classList.remove("is-moving");
    void edge.offsetWidth; // restart the packet animation
    edge.classList.add("is-moving");
    await new Promise((resolve) => setTimeout(resolve, MIN_HOP_MS));
    if (done) {
      const result = root.querySelector(".flow-result");
      result.textContent = ok ? "PDF delivered to the browser" : "Request failed: see the developer view";
      result.dataset.ok = String(Boolean(ok));
      hideTimer = setTimeout(() => root.classList.remove("is-visible"), HOLD_AFTER_MS);
    }
  }

  async function drain() {
    if (running) return;
    running = true;
    while (queue.length) await play(queue.shift());
    running = false;
  }

  return {
    start(title, from, to, label) {
      root.querySelector(".flow-title").textContent = title;
      const result = root.querySelector(".flow-result");
      result.textContent = "";
      delete result.dataset.ok;
      root.querySelectorAll(".flow-edge span").forEach((span) => { span.textContent = ""; });
      queue.push({ from, to, label });
      void drain();
    },
    hop(from, to, label, options = {}) {
      queue.push({ from, to, label, ...options });
      void drain();
    },
  };
}
