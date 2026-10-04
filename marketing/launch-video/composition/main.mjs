// v2 composition: every scene is built once; renderFrame(t) is async (clip frames decode) and otherwise a pure
// function of time (RULES.md). Scene data comes from timeline.mjs.
import { BEAT, DURATION, FPS, REPO, SCENES, t as beatTime } from "../timeline.mjs";

const M = 96;
const C = { navy: "#0b1220", ink: "#1a2b49", blue: "#2563eb", sky: "#60a5fa", gold: "#fde68a", red: "#ef4444", canvas: "#eef2f6", muted: "#5d6c82" };
const stage = document.getElementById("stage");
await Promise.all(["700 100px Display", "400 100px Display", "italic 400 100px Accent", "400 100px Mono", "700 100px Mono"].map((f) => document.fonts.load(f)));

// ---------------------------------------------------------------- time helpers
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const expo = (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x));
const cubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const back = (x) => { const c = 1.6; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; }; // gentle overshoot for slams
const enter = (time, beat, beats = 1, ease = expo) => ease(clamp((time - beatTime(beat)) / (beats * BEAT)));
const between = (time, from, to) => clamp((time - beatTime(from)) / (beatTime(to) - beatTime(from)));

// ---------------------------------------------------------------- DOM helpers
function el(tag, cls, parent, html) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html !== undefined) node.innerHTML = html;
  parent?.appendChild(node);
  return node;
}
const css = (node, style) => (Object.assign(node.style, style), node);
const output = (name) => `../assets/outputs/${name}`;
const mark = (size, bg, fg) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="display:block"><rect width="24" height="24" rx="5" fill="${bg}"/><path d="M7 8h10M7 12h10M7 16h6" stroke="${fg}" stroke-width="2" stroke-linecap="round"/></svg>`;
function image(src, parent, style = {}) {
  const node = el("img", "", parent);
  node.src = src;
  return css(node, style);
}
/** A masked line that rises in; returns its update function. */
function riseLine(parent, html, at, style = {}) {
  const mask = css(el("span", "mask", parent), style);
  const inner = el("span", "", mask, html);
  return (time) => { inner.style.transform = `translateY(${(1 - enter(time, at, 1)) * 112}%)`; };
}
const accent = (text, color) => `<span class="accent" style="color:${color}">${text}</span>`;

// ---------------------------------------------------------------- clips
const clips = {};
for (const name of [...new Set(SCENES.flatMap((s) => [s.clip, ...(s.cuts ?? []).map((c) => c[1])]).filter(Boolean))]) {
  const manifest = await (await fetch(`../assets/clips/${name}/manifest.json`)).json();
  const files = [];
  for (const [file, count] of manifest.frames) for (let i = 0; i < count; i++) files.push(`../assets/clips/${name}/${file}`);
  clips[name] = { manifest, files };
}
const clipFile = (name, index) => { const files = clips[name].files; return files[Math.max(0, Math.min(files.length - 1, index))]; };
async function show(img, src) {
  if (img.getAttribute("src") === src) return;
  img.setAttribute("src", src);
  await img.decode();
}

// ---------------------------------------------------------------- scene registry
const scenes = [];
function scene(def, background, build) {
  const root = el("div", "scene", stage);
  root.style.background = background;
  root.style.display = "block";
  const parts = build(root, def) ?? [];
  root.style.display = "none";
  scenes.push({ def, root, update: async (time) => { for (const part of parts) await part(time); } });
}
const byId = (id) => SCENES.find((s) => s.id === id);

// ---------------------------------------------------------------- Act 1: words
scene(byId("words"), C.navy, (root, def) => {
  const bgs = [C.navy, C.blue, "#ffffff", C.navy, C.blue];
  const inks = ["#ffffff", "#ffffff", C.ink, "#ffffff", "#ffffff"];
  const words = def.words.map(([text, at, doc], i) => {
    const layer = css(el("div", "abs", root), { inset: "0", background: bgs[i] });
    const label = doc === "pharmacy-label.png", receipt = doc === "receipt.png";
    const page = css(el("div", "page", layer), { width: label ? "640px" : receipt ? "440px" : "520px", height: label ? "384px" : receipt ? "935px" : "735px", right: "130px", top: label ? "348px" : receipt ? "72px" : "172px" });
    image(output(doc), page);
    const word = css(el("div", "abs display", layer, text), { left: `${M}px`, top: "400px", fontSize: "210px", color: inks[i] });
    return { layer, page, word, at, rot: [-7, 5, -4, 6, -3][i] };
  });
  const finale = css(el("div", "abs", root), { inset: "0", background: C.navy });
  const lines = css(el("div", "abs display", finale), { left: `${M}px`, top: "250px", fontSize: "176px", color: "#fff" });
  const parts = def.lines.map(([text, at, style]) => riseLine(lines, style ? accent(text, C.gold) : text, at));
  return [(time) => {
    words.forEach(({ layer, page, word, at, rot }, i) => {
      const next = words[i + 1]?.at ?? def.lines[0][1];
      const active = time >= beatTime(at) && time < beatTime(next);
      layer.style.display = active ? "block" : "none";
      if (!active) return;
      const p = enter(time, at, 0.6, back);
      word.style.transformOrigin = "0 50%";
      word.style.transform = `scale(${1.25 - 0.25 * p})`;
      const q = enter(time, at, 0.5);
      page.style.transform = `translate(${(1 - q) * 160}px, ${(1 - q) * -40}px) rotate(${rot * q}deg) scale(${1.15 - 0.15 * q})`;
    });
    finale.style.display = time >= beatTime(def.lines[0][1]) ? "block" : "none";
    parts.forEach((part) => part(time));
  }];
});

// ---------------------------------------------------------------- Act 1: pain
scene(byId("pain"), C.navy, (root, def) => {
  const head = css(el("div", "abs display", root), { left: `${M}px`, top: "120px", fontSize: "96px", color: "#fff" });
  const headParts = def.headline.map(([text, at, style]) => riseLine(head, style ? accent(text, C.gold) : text, at));
  const cards = def.cards.map(([text, at], i) => {
    const card = css(el("div", "card", root, text), { left: `${M + (i % 2) * 880}px`, top: `${470 + Math.floor(i / 2) * 230}px`, width: "840px" });
    const strike = css(el("div", "strike", card), { width: "calc(100% - 60px)" });
    return { card, strike, at };
  });
  const turn = css(el("div", "abs display", root), { left: `${M}px`, top: "430px", fontSize: "150px", color: "#fff", transformOrigin: "0 50%" });
  turn.innerHTML = `There's a ${accent("better way.", C.gold)}`;
  return [(time) => {
    headParts.forEach((p) => p(time));
    const out = enter(time, def.turn[1] - 0.5, 0.5);
    head.style.opacity = 1 - out;
    cards.forEach(({ card, strike, at }) => {
      const p = enter(time, at, 0.5, back);
      card.style.opacity = clamp(p * 2) * (1 - out);
      card.style.transform = `scale(${1.18 - 0.18 * p}) translateY(${out * 60}px)`;
      const s = enter(time, at + 0.5, 0.5);
      strike.style.transform = `translateY(-50%) scaleX(${s})`;
      card.style.color = s > 0.5 ? "rgba(255,255,255,0.45)" : "#fff";
    });
    const q = enter(time, def.turn[1], 0.8, back);
    const fade = enter(time, 15.5, 0.5);
    turn.style.transform = `scale(${1.1 - 0.1 * q})`;
    turn.style.filter = `blur(${fade * 6}px)`;
    turn.style.opacity = clamp(q * 2) * (1 - fade);
  }];
});

// ---------------------------------------------------------------- Act 2: reveal
scene(byId("reveal"), C.navy, (root, def) => {
  const iris = css(el("div", "abs", root), { inset: "0", background: C.blue });
  const brand = css(el("div", "abs", root), { left: "0", right: "0", top: "300px", display: "flex", justifyContent: "center", alignItems: "center", gap: "40px", color: "#fff", font: "700 190px/1 Display", letterSpacing: "-0.035em" });
  brand.innerHTML = `<span>${mark(176, "#ffffff", C.blue)}</span><span>Open Reports</span>`;
  const tag = css(el("div", "abs", root), { left: "0", right: "0", top: "560px", textAlign: "center", font: "400 60px/1.25 Display", color: "rgba(255,255,255,0.92)" });
  const line1 = el("div", "", tag, def.tagline[0]);
  const line2 = el("div", "", tag, def.tagline[1].replace(def.accent, accent(def.accent, C.gold)));
  const chips = css(el("div", "abs", root), { left: "0", right: "0", top: "820px", display: "flex", justifyContent: "center", gap: "22px" });
  const pills = def.chips.map((text) => css(el("span", "pill", chips, text), { border: "2px solid rgba(255,255,255,0.7)", color: "#fff" }));
  return [(time) => {
    iris.style.clipPath = `circle(${enter(time, 16, 0.6) * 1200}px at 50% 50%)`;
    const p = enter(time, def.wordmarkAt, 1, back);
    brand.style.opacity = clamp(p * 2);
    brand.style.transform = `scale(${0.82 + 0.18 * p})`;
    brand.style.top = `${300 - 40 * cubic(between(time, 17.5, 19))}px`;
    [line1, line2].forEach((line, i) => {
      const q = enter(time, def.taglineAt[i], 1);
      line.style.opacity = q;
      line.style.transform = `translateY(${(1 - q) * 30}px)`;
    });
    pills.forEach((pill, i) => {
      const q = enter(time, def.chipsAt + i * 0.5, 0.6, back);
      pill.style.opacity = clamp(q * 2);
      pill.style.transform = `scale(${0.8 + 0.2 * q})`;
    });
  }];
});

// ---------------------------------------------------------------- Act 3: live scenes
function title(root, def, color, numberColor, accentColor) {
  const box = css(el("div", "abs", root), { left: `${M}px`, top: "56px", display: "flex", alignItems: "baseline", gap: "28px" });
  const number = css(el("div", "mono", box, def.number), { font: "700 30px/1 Mono", color: numberColor });
  const text = css(el("div", "display", box), { fontSize: "108px", color });
  const line = riseLine(text, `${def.title[0]} ${accent(def.title[1], accentColor)}`, def.from);
  return (time) => { line(time); number.style.opacity = enter(time, def.from, 0.5); };
}
function browser(root, { x, y, w }) {
  const k = w / 1440, vh = 900 * k;
  const frame = css(el("div", "browser", root), { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${vh + 40}px` });
  el("div", "chrome", frame, `<i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><span class="url">open-reports · designer</span>`);
  const viewport = css(el("div", "viewport", frame), { width: `${w}px`, height: `${vh}px` });
  const img = css(el("img", "", viewport), { width: `${w}px`, height: `${vh}px` });
  return { frame, img, k, vw: w, vh };
}
function camera(def, time) {
  const keys = def.camera;
  if (time <= beatTime(keys[0][0])) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    if (time <= beatTime(keys[i][0])) {
      const [b0, z0, x0, y0] = keys[i - 1], [b1, z1, x1, y1] = keys[i];
      const p = cubic(between(time, b0, b1));
      return [0, z0 + (z1 - z0) * p, x0 + (x1 - x0) * p, y0 + (y1 - y0) * p];
    }
  }
  return keys[keys.length - 1];
}
for (const def of SCENES.filter((s) => s.kind === "live")) {
  scene(def, C.canvas, (root) => {
    const parts = [title(root, def, C.ink, C.blue, C.blue)];
    const b = browser(root, { x: 484, y: 196, w: 1340 }); // 1340 x 878 incl. chrome: the whole window stays on screen
    const captionBox = css(el("div", "abs", root), { left: `${M}px`, top: "330px", width: "350px", display: "flex", flexDirection: "column", gap: "26px" });
    const captions = (def.captions ?? []).map((text) => css(el("div", "", captionBox, `<span style="color:${C.blue}">→</span> ${text}`), { font: "400 30px/1.3 Mono", color: C.ink }));
    parts.push((time) => captions.forEach((node, i) => {
      const q = enter(time, def.from + 2 + i, 0.8);
      node.style.opacity = q;
      node.style.transform = `translateX(${(1 - q) * -30}px)`;
    }));
    parts.push(async (time) => {
      const p = enter(time, def.from, 1.2);
      b.frame.style.transform = `translateY(${(1 - p) * 120}px) scale(${0.96 + 0.04 * p})`;
      b.frame.style.opacity = clamp(p * 1.6);
      const [, zoom, cx, cy] = camera(def, time);
      const tx = clamp(b.vw / 2 - cx * b.k * zoom, b.vw - b.vw * zoom, 0);
      const ty = clamp(b.vh / 2 - cy * b.k * zoom, b.vh - b.vh * zoom, 0);
      b.img.style.transform = `translate(${tx}px, ${ty}px) scale(${zoom})`;
      await show(b.img, clipFile(def.clip, Math.floor((time - beatTime(def.from)) * FPS * def.speed)));
    });
    if (def.stamps) {
      const stamp = css(el("div", "abs display", root), { left: `${M}px`, bottom: "70px", fontSize: "150px", color: "#fff", background: C.blue, padding: "18px 40px 26px", borderRadius: "24px", boxShadow: "0 30px 80px rgba(37,99,235,0.4)", transformOrigin: "0 100%" });
      parts.push((time) => {
        const i = clamp(Math.floor((time - beatTime(def.stampsAt)) / BEAT), 0, def.stamps.length - 1);
        stamp.textContent = def.stamps[i];
        const p = enter(time, def.stampsAt + i, 0.45, back);
        stamp.style.transform = `scale(${1.2 - 0.2 * p}) rotate(${-3 + 3 * p}deg)`;
      });
    }
    return parts;
  });
}

// ---------------------------------------------------------------- Act 3: API terminal
scene(byId("api"), C.navy, (root, def) => {
  const parts = [title(root, def, "#ffffff", C.gold, C.gold)];
  const term = css(el("div", "term", root), { left: `${M}px`, top: "300px", width: "1260px" });
  el("div", "", term, `<span style="color:#94a3b8">$</span> <span class="cmd"></span><span class="caret" style="display:inline-block;width:16px;height:34px;background:#e2e8f0;vertical-align:-6px;margin-left:3px"></span>`);
  const cmd = term.querySelector(".cmd"), caret = term.querySelector(".caret");
  const responses = def.response.map(([, text], i) => css(el("div", "", term, i === 0 ? `<span style="color:#4ade80">✓ ${text}</span>` : `<span style="color:#94a3b8">  ${text}</span>`), { marginTop: i === 0 ? "22px" : "0" }));
  const page = css(el("div", "page", root), { left: "1290px", top: "200px", width: "500px", height: "707px" });
  image(output("invoice.png"), page);
  return [...parts, (time) => {
    const p = enter(time, def.from, 1.2);
    term.style.transform = `translateY(${(1 - p) * 80}px)`;
    term.style.opacity = clamp(p * 1.6);
    cmd.textContent = def.command.slice(0, Math.floor(def.command.length * between(time, def.typeFrom, def.typeTo)));
    caret.style.opacity = time < beatTime(def.response[0][0]) ? 1 : 0;
    responses.forEach((r, i) => { const q = enter(time, def.response[i][0], 0.5); r.style.opacity = q; r.style.transform = `translateY(${(1 - q) * 12}px)`; });
    const f = enter(time, def.pageAt, 1.1);
    page.style.opacity = clamp(f * 2);
    page.style.transform = `translate(${(1 - f) * -520}px, ${(1 - f) * 260}px) rotate(${6 * f - 10 * (1 - f)}deg) scale(${0.4 + 0.6 * f})`;
  }];
});

// ---------------------------------------------------------------- Act 3: JasperReports migration
scene(byId("migrate"), "#f3f0ff", (root, def) => {
  const parts = [title(root, def, C.ink, "#6d28d9", "#6d28d9")];
  const list = css(el("div", "abs", root), { left: `${M}px`, top: "290px", width: "900px", display: "flex", flexDirection: "column", gap: "14px" });
  const rows = def.files.map((file) => {
    const row = css(el("div", "", list), { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", borderRadius: "14px", padding: "20px 28px", font: "400 32px/1 Mono", color: C.ink, boxShadow: "0 10px 30px rgba(26,43,73,0.08)" });
    el("span", "", row, file);
    const status = css(el("span", "", row, "converting…"), { font: "700 28px/1 Mono", color: C.muted });
    return { row, status };
  });
  const docs = ["invoice.png", "account-statement.png", "lab-report.png", "receipt.png"].map((name, i) => {
    const page = css(el("div", "page", root), { left: `${1100 + i * 150}px`, top: `${250 + i * 50}px`, width: "420px", height: name === "receipt.png" ? "890px" : "594px" });
    image(output(name), page);
    return page;
  });
  return [...parts, (time) => {
    rows.forEach(({ row, status }, i) => {
      const appear = enter(time, def.from + 0.5 + i * 0.25, 0.6);
      row.style.opacity = appear;
      row.style.transform = `translateX(${(1 - appear) * -60}px)`;
      const done = time >= beatTime(def.filesAt + i * 0.5);
      status.textContent = done ? "✓ editable draft" : "converting…";
      status.style.color = done ? "#15803d" : C.muted;
    });
    docs.forEach((page, i) => {
      const q = enter(time, def.filesAt + i * 0.75, 0.8, back);
      page.style.opacity = clamp(q * 2);
      page.style.transform = `translateY(${(1 - q) * 120}px) rotate(${(-6 + i * 4) * q}deg)`;
    });
  }];
});

// ---------------------------------------------------------------- Act 4: montage
scene(byId("montage"), C.navy, (root, def) => {
  const img = css(el("img", "", root), { position: "absolute", left: "0", top: "0", width: "1920px", height: "1200px", objectFit: "cover", objectPosition: "top", transformOrigin: "50% 30%" });
  const own = css(el("div", "abs", root), { inset: "0", background: C.blue });
  const word = css(el("div", "abs display", root), { left: `${M}px`, bottom: "90px", fontSize: "200px", color: "#fff", background: C.navy, padding: "10px 46px 34px", borderRadius: "26px", transformOrigin: "0 100%" });
  return [async (time) => {
    const i = clamp(Math.floor((time - beatTime(def.from)) / BEAT), 0, def.cuts.length - 1);
    const [text, clip, fraction] = def.cuts[i];
    own.style.display = clip ? "none" : "block";
    if (clip) {
      const files = clips[clip].files;
      await show(img, files[Math.round(fraction * (files.length - 1))]);
      img.style.transform = `scale(${1.06 + 0.06 * between(time, def.from + i, def.from + i + 1)})`;
    }
    word.textContent = text;
    word.style.background = clip ? C.navy : "transparent";
    word.style.transform = `scale(${1.25 - 0.25 * enter(time, def.from + i, 0.4, back)})`;
  }];
});

// ---------------------------------------------------------------- Act 4: stats
scene(byId("stats"), C.navy, (root, def) => {
  const cols = def.stats.map(([at, value, label], i) => {
    const col = css(el("div", "abs", root), { left: `${M + i * 590}px`, top: "300px", width: "560px", color: "#fff" });
    const num = css(el("div", "display", col, "0"), { fontSize: "300px", color: i === 2 ? C.gold : "#fff" });
    css(el("div", "", col, label), { font: "400 48px/1.2 Display", color: "rgba(255,255,255,0.75)", marginTop: "10px" });
    return { col, num, at, value: Number(value) };
  });
  return [(time) => cols.forEach(({ col, num, at, value }) => {
    const p = enter(time, at, 0.6, back);
    col.style.opacity = clamp(p * 2);
    col.style.transform = `translateY(${(1 - p) * 60}px)`;
    num.textContent = String(Math.round(value * expo(clamp((time - beatTime(at)) / (BEAT * 1.5)))));
  })];
});

// ---------------------------------------------------------------- end card
scene(byId("end"), "#ffffff", (root, def) => {
  const wrap = css(el("div", "abs", root), { left: "0", right: "0", top: "230px", display: "flex", flexDirection: "column", alignItems: "center", gap: "40px" });
  const brand = css(el("div", "", wrap), { display: "flex", alignItems: "center", gap: "36px", font: "700 170px/1 Display", letterSpacing: "-0.035em", color: C.ink });
  brand.innerHTML = `<span>${mark(156, C.blue, "#fff")}</span><span>Open Reports</span>`;
  const tagline = css(el("div", "", wrap, def.tagline.replace(def.accent, accent(def.accent, C.blue))), { font: "400 50px/1.2 Display", color: C.muted });
  const cta = css(el("div", "", wrap), { display: "flex", alignItems: "center", gap: "30px", marginTop: "16px" });
  cta.innerHTML = `<span style="display:inline-flex;align-items:center;gap:14px;background:${C.blue};color:#fff;border-radius:999px;padding:24px 44px;font:700 36px/1 Display"><svg width="34" height="34" viewBox="0 0 24 24"><path d="M12 2.6l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.4l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" fill="${C.gold}"/></svg>Star on GitHub</span><span style="font:400 32px/1 Mono;color:${C.ink}">${REPO}</span>`;
  const stats = css(el("div", "", wrap, def.stats), { font: "400 27px/1 Mono", color: C.muted, marginTop: "34px" });
  return [(time) => {
    const p = enter(time, def.wordmarkAt, 1, back);
    brand.style.opacity = clamp(p * 2);
    brand.style.transform = `scale(${1.12 - 0.12 * p})`;
    for (const [node, at] of [[tagline, def.taglineAt], [cta, def.ctaAt], [stats, def.statsAt]]) {
      const q = enter(time, at, 1);
      node.style.opacity = q;
      node.style.transform = `translateY(${(1 - q) * 26}px)`;
    }
  }];
});

// ---------------------------------------------------------------- frame contract
window.DURATION = DURATION;
window.FPS = FPS;
window.renderFrame = async (time) => {
  for (const { def, root, update } of scenes) {
    const active = time >= beatTime(def.from) && time < beatTime(def.to);
    root.style.display = active ? "block" : "none";
    if (active) await update(time);
  }
};
window.ready = (async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].filter((i) => i.getAttribute("src")).map((i) => i.decode()));
  return true;
})();
