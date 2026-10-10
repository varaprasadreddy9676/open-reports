// In-page overlay for the flagship film, injected into every top-level page before its own scripts run.
// It draws a cursor, click pulses, a focus ring, chapter cards, captions-free callouts, a terminal card and
// full-screen title/recap/end cards. It never changes the application underneath.
const CSS = `
#film-cursor{position:fixed;left:-40px;top:-40px;z-index:2147483646;pointer-events:none;filter:drop-shadow(0 3px 4px rgb(0 0 0/.35));transition:left .12s ease,top .12s ease}
#film-pulse{position:fixed;z-index:2147483645;width:26px;height:26px;margin:-13px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 3px #5b8cff;pointer-events:none;opacity:0}
#film-pulse.go{animation:film-pulse .5s ease-out}
#film-focus{position:fixed;z-index:2147483644;pointer-events:none;border:2px solid #5b8cff;border-radius:9px;box-shadow:0 0 0 6px rgb(91 140 255/.22);opacity:0;transition:all .25s ease,opacity .3s}
#film-focus.on{opacity:1}
#film-chapter{position:fixed;z-index:2147483640;left:48px;bottom:56px;display:flex;align-items:center;gap:22px;padding:22px 34px 22px 24px;border-radius:20px;background:rgb(5 7 13/.92);color:#eef2ff;font:600 15px/1.3 Inter,system-ui,sans-serif;box-shadow:0 30px 80px rgb(0 0 0/.45);backdrop-filter:blur(12px);opacity:0;transform:translateY(24px);transition:opacity .45s ease,transform .6s cubic-bezier(.16,1,.3,1)}
#film-chapter.on{opacity:1;transform:none}
#film-chapter b{display:grid;place-items:center;width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,#5b8cff,#9b7bff);font-size:28px}
#film-chapter strong{display:block;font-size:30px;letter-spacing:-.02em}
#film-chapter small{display:block;margin-top:4px;color:#9aa6c3;font-size:16px;font-weight:500}
#film-callout{position:fixed;z-index:2147483641;left:50%;bottom:42px;max-width:1300px;padding:14px 24px;border-radius:14px;background:#0b1020;color:#eef2ff;font:600 21px/1.35 Inter,system-ui,sans-serif;box-shadow:0 20px 50px rgb(0 0 0/.35);transform:translate(-50%,20px);opacity:0;transition:opacity .35s,transform .45s cubic-bezier(.16,1,.3,1)}
#film-callout.on{opacity:1;transform:translate(-50%,0)}
#film-callout code{color:#c8f56a;font:600 19px ui-monospace,SFMono-Regular,Menlo,monospace}
#film-callout[data-kind=path]{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:19px}
#film-terminal{position:fixed;z-index:2147483642;right:56px;bottom:120px;width:900px;border-radius:16px;overflow:hidden;background:#05070d;color:#d7e0f5;box-shadow:0 30px 90px rgb(0 0 0/.5);font:16px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;opacity:0;transform:translateY(20px);transition:opacity .35s,transform .45s cubic-bezier(.16,1,.3,1)}
#film-terminal.on{opacity:1;transform:none}
#film-terminal header{display:flex;gap:7px;padding:12px 16px;background:#141a2b}
#film-terminal header i{width:12px;height:12px;border-radius:50%;background:#3a4258}
#film-terminal header span{margin-left:10px;color:#9aa6c3;font:600 13px Inter,system-ui,sans-serif}
#film-terminal pre{margin:0;padding:18px 22px;white-space:pre-wrap;word-break:break-all}
#film-terminal .cmd::before{content:"$ ";color:#c8f56a}
#film-terminal .out{color:#9aa6c3}
#film-card{position:fixed;inset:0;z-index:2147483643;display:grid;place-items:center;overflow:hidden;background:#05070d;color:#eef2ff;font-family:Inter,system-ui,sans-serif;opacity:0;transition:opacity .6s ease}
#film-card.on{opacity:1}
#film-card::before,#film-card::after{content:"";position:absolute;width:70vmax;height:70vmax;border-radius:50%;filter:blur(110px);opacity:.55;mix-blend-mode:screen}
#film-card::before{top:-38vmax;left:-14vmax;background:radial-gradient(circle,#2f5bff,transparent 65%);animation:film-drift 16s ease-in-out infinite alternate}
#film-card::after{bottom:-40vmax;right:-16vmax;background:radial-gradient(circle,#8a4dff,transparent 65%);animation:film-drift 19s ease-in-out infinite alternate-reverse}
#film-card .inner{position:relative;z-index:1;width:min(1500px,86vw)}
#film-card .kicker{display:inline-flex;gap:10px;align-items:center;margin-bottom:30px;padding:9px 16px;border:1px solid rgb(255 255 255/.14);border-radius:999px;color:#9aa6c3;font:600 17px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.06em}
#film-card .kicker i{width:9px;height:9px;border-radius:50%;background:#c8f56a;box-shadow:0 0 14px #c8f56a}
#film-card h1{margin:0;font-size:116px;line-height:.95;letter-spacing:-.06em;font-weight:680}
#film-card h1 em{font-style:normal;color:transparent;background:linear-gradient(100deg,#8fb0ff,#b79bff 35%,#c8f56a 60%,#8fb0ff) 0 0/220% 100%;-webkit-background-clip:text;background-clip:text;animation:film-sheen 6s linear infinite}
#film-card p{max-width:1100px;margin:34px 0 0;color:#9aa6c3;font-size:30px;line-height:1.45}
#film-card .lines{display:grid;gap:18px;margin-top:44px}
#film-card .lines div{display:flex;gap:22px;align-items:baseline;padding:20px 26px;border:1px solid rgb(255 255 255/.1);border-radius:18px;background:rgb(255 255 255/.03);font-size:27px;opacity:0;transform:translateY(16px);animation:film-in .6s cubic-bezier(.16,1,.3,1) forwards}
#film-card .lines b{color:#c8f56a;font:700 22px ui-monospace,SFMono-Regular,Menlo,monospace;min-width:38px}
#film-card .lines small{color:#9aa6c3;font-size:22px}
#film-card .links{display:flex;gap:18px;margin-top:46px;flex-wrap:wrap}
#film-card .links span{padding:14px 22px;border-radius:14px;background:rgb(255 255 255/.06);border:1px solid rgb(255 255 255/.12);font:600 24px ui-monospace,SFMono-Regular,Menlo,monospace;color:#dbe4ff}
#film-card .reveal{opacity:0;transform:translateY(24px);animation:film-in .9s cubic-bezier(.16,1,.3,1) forwards}
@keyframes film-pulse{0%{transform:scale(.4);opacity:.9}100%{transform:scale(2.6);opacity:0}}
@keyframes film-in{to{opacity:1;transform:none}}
@keyframes film-sheen{to{background-position:-220% 0}}
@keyframes film-drift{to{transform:translate(12vmax,8vmax) scale(1.12)}}
`;

function install(css) {
  if (window.top !== window || window.__film) return;
  const ready = () => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
    const make = (id, html = "") => { const el = document.createElement("div"); el.id = id; el.innerHTML = html; document.body.append(el); return el; };
    const cursor = make("film-cursor", '<svg width="34" height="40" viewBox="0 0 30 36"><path d="M3 2 4 28l7-7 6 12 5-3-6-11 10-1Z" fill="#fff" stroke="#0b1020" stroke-width="2" stroke-linejoin="round"/></svg>');
    const pulse = make("film-pulse");
    const focus = make("film-focus");
    let focusTimer;
    let calloutTimer;
    document.addEventListener("mousemove", (event) => { cursor.style.left = `${event.clientX - 3}px`; cursor.style.top = `${event.clientY - 2}px`; }, true);
    const esc = (value) => String(value).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
    window.__film = {
      focus(x, y, w, h) {
        Object.assign(focus.style, { left: `${x - 6}px`, top: `${y - 6}px`, width: `${w + 12}px`, height: `${h + 12}px` });
        focus.classList.add("on");
        clearTimeout(focusTimer);
        focusTimer = setTimeout(() => focus.classList.remove("on"), 1600);
      },
      pulse(x, y) {
        Object.assign(pulse.style, { left: `${x}px`, top: `${y}px` });
        pulse.classList.remove("go"); void pulse.offsetWidth; pulse.classList.add("go");
      },
      chapter(number, title, subtitle) {
        document.getElementById("film-chapter")?.remove();
        const el = make("film-chapter", `<b>${esc(number)}</b><div><strong>${esc(title)}</strong>${subtitle ? `<small>${esc(subtitle)}</small>` : ""}</div>`);
        requestAnimationFrame(() => el.classList.add("on"));
        setTimeout(() => { el.classList.remove("on"); setTimeout(() => el.remove(), 600); }, 3400);
      },
      callout(text, kind) {
        let el = document.getElementById("film-callout");
        clearTimeout(calloutTimer);
        if (!text) { el?.classList.remove("on"); return; }
        if (!el) el = make("film-callout");
        el.dataset.kind = kind;
        el.innerHTML = text;
        requestAnimationFrame(() => el.classList.add("on"));
        calloutTimer = setTimeout(() => el.classList.remove("on"), 9000);
      },
      terminal(command, output) {
        let el = document.getElementById("film-terminal");
        if (command === null) { el?.classList.remove("on"); return; }
        if (!el) el = make("film-terminal");
        el.innerHTML = `<header><i></i><i></i><i></i><span>Terminal · CareDesk server</span></header><pre><div class="cmd">${esc(command)}</div>${output ? `<div class="out">${esc(output)}</div>` : ""}</pre>`;
        requestAnimationFrame(() => el.classList.add("on"));
      },
      card(kind, data) {
        document.getElementById("film-card")?.remove();
        if (!kind) return;
        const el = make("film-card");
        const kicker = data.kicker ? `<div class="kicker reveal"><i></i>${esc(data.kicker)}</div>` : "";
        const lines = (data.lines ?? []).map((line, index) => `<div style="animation-delay:${0.35 + index * 0.28}s"><b>${esc(line[0])}</b><span>${esc(line[1])}<br><small>${esc(line[2] ?? "")}</small></span></div>`).join("");
        const links = (data.links ?? []).map((link) => `<span>${esc(link)}</span>`).join("");
        el.innerHTML = `<div class="inner">${kicker}<h1 class="reveal" style="animation-delay:.1s">${data.title}</h1>${data.text ? `<p class="reveal" style="animation-delay:.3s">${esc(data.text)}</p>` : ""}${lines ? `<div class="lines">${lines}</div>` : ""}${links ? `<div class="links reveal" style="animation-delay:.6s">${links}</div>` : ""}</div>`;
        requestAnimationFrame(() => el.classList.add("on"));
      },
    };
  };
  if (document.body) ready(); else document.addEventListener("DOMContentLoaded", ready, { once: true });
}

export const OVERLAY_SCRIPT = `(${install.toString()})(${JSON.stringify(CSS)});`;
