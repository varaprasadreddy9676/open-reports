// Composition: builds every scene once, then renderFrame(t) sets all styles as a pure function of time (RULES.md).
import { ANCHORS, BEAT, DURATION, FPS, REPO, SCENES, t as beatTime } from "../timeline.mjs";

const W = 1920, H = 1080, M = 96;
const SHOT_W = 1440, SHOT_H = 900; // CSS size of the captured screens
const stage = document.getElementById("stage");
// Layout measures text (headline fitting, underline placement), so the faces must be loaded before scenes are built.
await Promise.all(["700 100px Display", "400 100px Display", "italic 400 100px Accent", "400 100px Mono", "700 100px Mono"].map((font) => document.fonts.load(font)));

// ---------------------------------------------------------------- easing and timing
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOutExpo = (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x));
const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
/** Progress 0..1 of an entrance that starts at `beat` and lasts `beats`. */
const enter = (time, beat, beats = 1) => easeOutExpo(clamp((time - beatTime(beat)) / (beats * BEAT)));
const between = (time, from, to) => clamp((time - beatTime(from)) / (beatTime(to) - beatTime(from)));

// ---------------------------------------------------------------- DOM helpers
function el(tag, cls, parent, html) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html !== undefined) node.innerHTML = html;
  parent?.appendChild(node);
  return node;
}
const asset = (name) => `../assets/shots/${name}`;
const output = (name) => `../assets/outputs/${name}`;
function img(src, cls, parent) {
  const node = el("img", cls, parent);
  node.src = src;
  node.decoding = "sync";
  return node;
}
function markSvg(size, bg, fg) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="display:block"><rect width="24" height="24" rx="5" fill="${bg}"/><path d="M7 8h10M7 12h10M7 16h6" stroke="${fg}" stroke-width="2" stroke-linecap="round"/></svg>`;
}
const CURSOR_SVG = `<svg viewBox="0 0 24 24" width="34" height="34"><path d="M4 2.5l15 11.2-6.7 1.1 3.9 7.3-2.6 1.4-3.9-7.4L4 21z" fill="#111827" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
const CHECK_SVG = `<svg viewBox="0 0 24 24" width="30" height="30"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Headline lines with one accent word, sized so the widest line fits `maxWidth`. */
function headline(scene, parent, { top, maxWidth, size = 124, min = 80, color }) {
  const box = el("div", "headline", parent);
  box.style.top = `${top}px`;
  box.style.color = color;
  const lines = scene.lines.map((text) => {
    const line = el("span", "line", box);
    const inner = el("span", "in", line);
    const at = scene.accent && text.endsWith(scene.accent) ? text.length - scene.accent.length : -1;
    if (at >= 0) {
      inner.append(document.createTextNode(text.slice(0, at)));
      const accent = el("span", "accent", inner, scene.accent);
      accent.style.color = scene.accentColor;
      return { line, inner, accent };
    }
    inner.textContent = text;
    return { line, inner };
  });
  let fs = size;
  box.style.fontSize = `${fs}px`;
  while (fs > min && Math.max(...lines.map((l) => l.inner.getBoundingClientRect().width)) > maxWidth) {
    fs -= 2;
    box.style.fontSize = `${fs}px`;
  }
  return { box, lines, fontSize: fs };
}
function animateHeadline(h, time, at) {
  h.lines.forEach((l, i) => {
    const p = enter(time, at + i, 1);
    l.inner.style.transform = `translateY(${(1 - p) * 110}%)`;
    if (l.accent) {
      const a = enter(time, at + i + 0.5, 1);
      l.accent.style.transform = `translateY(${(1 - a) * 40}px)`;
      l.accent.style.opacity = a;
    }
  });
}
function hud(scene, index, parent, color) {
  const bar = el("div", "hud", parent);
  bar.style.color = color;
  const left = el("span", "", bar, `// ${String(index).padStart(2, "0")} &nbsp;${scene.id === "end" ? "" : scene.id}`);
  const right = el("span", "", bar);
  void left;
  return (time) => {
    const frame = Math.round(time * FPS);
    const s = Math.floor(frame / FPS), f = frame % FPS;
    right.textContent = `OPEN REPORTS   00:00:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
  };
}
function kicker(scene, parent, top) {
  const node = el("div", "kicker", parent, scene.kicker);
  node.style.top = `${top}px`;
  node.style.color = scene.ink === "#ffffff" ? "rgba(255,255,255,0.8)" : "#5d6c82";
  return (time) => {
    const p = enter(time, scene.from, 1);
    node.style.opacity = p;
    node.style.transform = `translateY(${(1 - p) * 16}px)`;
  };
}
/** A product screen card with optional after-click swap, cursor, click ring and highlights. */
function card(scene, parent, { x, y, w }) {
  const h = (w * SHOT_H) / SHOT_W, k = w / SHOT_W;
  const node = el("div", "card", parent);
  Object.assign(node.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
  const before = img(asset(scene.shot), "shot", node);
  const after = scene.shotAfter ? img(asset(scene.shotAfter), "shot", node) : null;
  const highlights = (scene.highlights ? ANCHORS[scene.highlights.anchor] : []).map((a) => {
    const box = el("div", "hl", node);
    Object.assign(box.style, { left: `${a.x * k - 4}px`, top: `${a.y * k - 4}px`, width: `${a.w * k + 8}px`, height: `${a.h * k + 8}px`, borderColor: scene.accentColor });
    return box;
  });
  let cursor, ring, target;
  if (scene.cursor) {
    const a = ANCHORS[scene.cursor.target];
    target = { x: (a.x + a.w / 2) * k, y: (a.y + a.h / 2) * k };
    ring = el("div", "ring", node);
    ring.style.borderColor = scene.accentColor;
    cursor = el("div", "cursor", node, CURSOR_SVG);
  }
  return (time) => {
    const p = enter(time, scene.from, 1.5);
    const push = 1 + 0.04 * easeInOutCubic(between(time, scene.from, scene.to));
    node.style.opacity = clamp(p * 1.5);
    node.style.transform = `translateX(${(1 - p) * 220}px) scale(${(0.96 + 0.04 * p) * push})`;
    if (after) after.style.opacity = time >= beatTime(scene.cursor.click) ? 1 : 0;
    void before;
    highlights.forEach((box, i) => {
      const q = enter(time, scene.highlights.at[i], 0.75);
      box.style.opacity = q;
      box.style.transform = `scale(${1.04 - 0.04 * q})`;
    });
    if (cursor) {
      const c = scene.cursor;
      const move = easeInOutCubic(between(time, c.enter, c.arrive));
      const start = { x: target.x + 340, y: target.y + 260 };
      const cx = start.x + (target.x - start.x) * move, cy = start.y + (target.y - start.y) * move;
      const visible = time >= beatTime(c.enter);
      const press = time >= beatTime(c.click) && time < beatTime(c.click) + 0.12 ? 0.86 : 1;
      cursor.style.opacity = visible ? 1 : 0;
      cursor.style.transform = `translate(${cx - 6}px, ${cy - 4}px) scale(${press})`;
      const r = clamp((time - beatTime(c.click)) / (BEAT * 1.2));
      const size = 30 + 90 * easeOutExpo(r);
      ring.style.opacity = r > 0 && r < 1 ? 1 - r : 0;
      Object.assign(ring.style, { width: `${size}px`, height: `${size}px`, left: `${target.x - size / 2}px`, top: `${target.y - size / 2}px` });
    }
  };
}
function chips(scene, parent, top, perBeat) {
  const row = el("div", "chips", parent);
  row.style.top = `${top}px`;
  row.style.maxWidth = "740px";
  const items = scene.chips.items.map((label) => {
    const chip = el("span", "chip", row, label);
    chip.style.borderColor = scene.accentColor;
    chip.style.color = scene.accentColor;
    return chip;
  });
  return (time) => items.forEach((chip, i) => {
    const p = enter(time, scene.chips.at + i * perBeat, 0.6);
    chip.style.opacity = p;
    chip.style.transform = `translateY(${(1 - p) * 18}px) scale(${0.9 + 0.1 * p})`;
  });
}

/** Large readable versions of what the product says, landing on the beat with their highlight. */
function callouts(def, parent) {
  const items = def.callouts.map(([at, page, text, x, y], i) => {
    const box = el("div", "", parent);
    Object.assign(box.style, { position: "absolute", left: `${x ?? 1010 + i * 60}px`, top: `${y ?? 640 + i * 130}px`, display: "flex", alignItems: "center", gap: "18px",
      padding: "22px 28px", background: "#ffffff", borderRadius: "14px", border: `3px solid ${def.accentColor}`, boxShadow: "0 24px 60px rgba(16, 42, 67, 0.22)", zIndex: 6 });
    box.innerHTML = `<span style="font:700 26px/1 Mono;color:#fff;background:${def.accentColor};padding:8px 12px;border-radius:8px">${page}</span><span style="font:700 34px/1.1 Display;color:#1a2b49;white-space:nowrap">${text}</span>`;
    return { box, at };
  });
  return (time) => items.forEach(({ box, at }) => {
    const p = enter(time, at, 0.75);
    box.style.opacity = p;
    box.style.transform = `translateY(${(1 - p) * 30}px) scale(${0.96 + 0.04 * p})`;
  });
}

// ---------------------------------------------------------------- scenes
const updaters = [];
function scene(index, def, build) {
  const root = el("div", "scene", stage);
  root.style.background = def.tint;
  root.style.display = "block"; // measurable while building
  const parts = build(root) ?? [];
  root.style.display = "none";
  const tick = def.id === "end" ? () => {} : hud(def, index, root, def.ink);
  updaters.push({ def, root, update: (time) => { tick(time); parts.forEach((fn) => fn(time)); } });
}

// 0 — hook: words build one per beat over faint paper pages.
scene(0, SCENES[0], (root) => {
  const def = SCENES[0];
  const pages = ["invoice.png", "lab-report.png", "account-statement.png"].map((name, i) => {
    const page = el("div", "page", root);
    Object.assign(page.style, { width: "520px", height: "735px", left: `${1080 + i * 150}px`, top: `${150 + i * 40}px` });
    img(output(name), "", page);
    return page;
  });
  const k = kicker(def, root, 330);
  const box = el("div", "headline", root);
  Object.assign(box.style, { top: "390px", fontSize: "150px", color: def.ink });
  const line1 = el("span", "line", box), line2 = el("span", "line", box);
  const words = def.words.map(([text, , accent], i) => {
    const holder = el("span", "in", i < 2 ? line1 : line2);
    holder.style.marginRight = "0.22em";
    if (accent) {
      const a = el("span", "accent", holder, text);
      a.style.color = def.accentColor;
    } else holder.textContent = text;
    return holder;
  });
  return [k, (time) => {
    def.words.forEach(([, at], i) => {
      const p = enter(time, at, 1);
      words[i].style.transform = `translateY(${(1 - p) * 110}%)`;
    });
    pages.forEach((page, i) => {
      const drift = between(time, 0, 8);
      const rot = [-7, 3, 9][i];
      page.style.opacity = 0.16 + 0.04 * i;
      page.style.transform = `translateY(${-30 * drift * (i + 1) * 0.5}px) rotate(${rot}deg)`;
    });
  }];
});

// 1 — reveal on brand blue; the drop.
scene(1, SCENES[1], (root) => {
  const def = SCENES[1];
  const brand = el("div", "", root);
  Object.assign(brand.style, { position: "absolute", left: `${M}px`, top: "150px", display: "flex", alignItems: "center", gap: "24px", color: "#fff", font: "700 76px/1 Display" });
  brand.innerHTML = `<span class="mark">${markSvg(88, "#ffffff", "#2563eb")}</span><span>Open Reports</span>`;
  const h = headline(def, root, { top: 360, maxWidth: 1040, size: 132, color: "#ffffff" });
  const underline = el("div", "", root);
  underline.innerHTML = `<svg width="520" height="40" viewBox="0 0 520 40"><path d="M6 26 C 120 10, 260 34, 380 18 S 500 14, 514 22" fill="none" stroke="${def.accentColor}" stroke-width="7" stroke-linecap="round"/></svg>`;
  const path = underline.querySelector("path");
  const length = path.getTotalLength();
  path.style.strokeDasharray = `${length}`;
  const accentRect = h.lines[2].accent.getBoundingClientRect();
  Object.assign(underline.style, { position: "absolute", left: `${accentRect.left - 4}px`, top: `${accentRect.bottom - 18}px`, width: `${accentRect.width + 10}px` });
  underline.firstChild.setAttribute("width", `${accentRect.width + 10}`);
  const pages = [["lab-report.png", 1180, 230, -5], ["invoice.png", 1420, 290, 4]].map(([name, x, y, rot]) => {
    const page = el("div", "page", root);
    Object.assign(page.style, { width: "460px", height: "650px", left: `${x}px`, top: `${y}px` });
    img(output(name), "", page);
    return { page, rot };
  });
  return [(time) => {
    const p = enter(time, 8, 1);
    brand.style.opacity = p;
    brand.style.transform = `translateY(${(1 - p) * 30}px) scale(${0.94 + 0.06 * p})`;
    animateHeadline(h, time, def.linesAt);
    path.style.strokeDashoffset = `${length * (1 - easeInOutCubic(between(time, 11.5, 12.5)))}`;
    pages.forEach(({ page, rot }, i) => {
      const q = enter(time, 9.5 + i * 0.5, 1.2);
      page.style.opacity = q;
      page.style.transform = `translate(${(1 - q) * 260}px, ${(1 - q) * 40 - 14 * between(time, 9, 16)}px) rotate(${rot * q}deg)`;
    });
  }, kicker(def, root, 290)];
});

// 2, 3, 4, 6 — feature scenes with a product card.
for (const [index, id] of [[2, "design"], [3, "rules"], [4, "pagination"], [6, "ai"]]) {
  const def = SCENES.find((s) => s.id === id);
  scene(index, def, (root) => {
    const h = headline(def, root, { top: 300, maxWidth: 700, size: 124, color: def.ink });
    const parts = [kicker(def, root, 236), (time) => animateHeadline(h, time, def.linesAt), card(def, root, { x: 860, y: 190, w: 1180 })];
    if (def.chips) parts.push(chips(def, root, 300 + h.lines.length * h.fontSize * 1.02 + 70, 0.5));
    if (def.callouts) parts.push(callouts(def, root));
    return parts;
  });
}

// 5 — outputs: six format chips and a fan of real rendered documents.
scene(5, SCENES[5], (root) => {
  const def = SCENES[5];
  const h = headline(def, root, { top: 300, maxWidth: 720, size: 124, color: def.ink });
  const layout = [["invoice.png", 900, 170, 470, 664, -6], ["lab-report.png", 1180, 220, 470, 664, 2], ["receipt.png", 1520, 150, 280, 595, 7], ["pharmacy-label.png", 1190, 720, 560, 336, -3]];
  const pages = layout.map(([name, x, y, w, hgt, rot]) => {
    const page = el("div", "page", root);
    Object.assign(page.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${hgt}px` });
    img(output(name), "", page);
    return { page, rot };
  });
  return [kicker(def, root, 236), (time) => {
    animateHeadline(h, time, def.linesAt);
    pages.forEach(({ page, rot }, i) => {
      const q = enter(time, def.pages.at + i * 0.5, 1);
      page.style.opacity = q;
      page.style.transform = `translate(${(1 - q) * 300}px, ${(1 - q) * -60 - 10 * between(time, 40, 48)}px) rotate(${rot * (0.4 + 0.6 * q)}deg)`;
    });
  }, chips(def, root, 300 + 2 * h.fontSize * 1.02 + 70, 1)];
});

// 7 — API: a terminal types a render call and the response lands.
scene(7, SCENES[7], (root) => {
  const def = SCENES[7];
  const h = headline(def, root, { top: 300, maxWidth: 700, size: 124, color: def.ink });
  const term = el("div", "terminal", root);
  Object.assign(term.style, { left: "860px", top: "250px", width: "1110px" });
  term.innerHTML = `<div class="dots"><i style="background:#f87171"></i><i style="background:#fbbf24"></i><i style="background:#4ade80"></i></div>`;
  const commandLines = def.terminal.command.map(() => el("div", "", term));
  const caret = el("span", "caret");
  const responses = def.terminal.response.map(([, text], i) => {
    const line = el("div", i === 0 ? "ok" : "dim", term, i === 0 ? `✓ ${text}` : `  ${text}`);
    line.style.marginTop = i === 0 ? "18px" : "0";
    return line;
  });
  const note = el("div", "note", root, def.note.text);
  Object.assign(note.style, { top: `${300 + 2 * h.fontSize * 1.02 + 70}px`, maxWidth: "700px", color: "#5d6c82" });
  const total = def.terminal.command.join("").length;
  return [kicker(def, root, 236), (time) => {
    animateHeadline(h, time, def.linesAt);
    const p = enter(time, def.from, 1.5);
    term.style.opacity = clamp(p * 1.5);
    term.style.transform = `translateX(${(1 - p) * 220}px) scale(${0.96 + 0.04 * p})`;
    const typed = Math.floor(total * between(time, def.terminal.typeFrom, def.terminal.typeTo));
    let left = typed;
    def.terminal.command.forEach((text, i) => {
      const shown = text.slice(0, Math.max(0, left));
      left -= text.length;
      commandLines[i].textContent = shown;
      if ((left < 0 || i === def.terminal.command.length - 1) && !caret.isConnected) commandLines[i].appendChild(caret);
    });
    const active = commandLines.findIndex((_, i) => def.terminal.command.slice(0, i + 1).join("").length > typed);
    const line = commandLines[active === -1 ? commandLines.length - 1 : active];
    if (caret.parentNode !== line) line.appendChild(caret);
    caret.style.opacity = time < beatTime(def.terminal.response[0][0]) ? (Math.floor(time / BEAT) % 2 === 0 || time < beatTime(def.terminal.typeTo) ? 1 : 0) : 0;
    responses.forEach((r, i) => {
      const q = enter(time, def.terminal.response[i][0], 0.6);
      r.style.opacity = q;
      r.style.transform = `translateY(${(1 - q) * 10}px)`;
    });
    const n = enter(time, def.note.at, 1);
    note.style.opacity = n;
    note.style.transform = `translateY(${(1 - n) * 16}px)`;
  }];
});

// 8 — recap: six tiles, a check on each beat.
scene(8, SCENES[8], (root) => {
  const def = SCENES[8];
  const h = headline(def, root, { top: 300, maxWidth: 560, size: 124, color: def.ink });
  const tileW = 360, tileH = 250, gap = 24, x0 = 700, y0 = 240;
  const tiles = def.tiles.items.map(([label, tint, shot], i) => {
    const tile = el("div", "tile", root);
    Object.assign(tile.style, { left: `${x0 + (i % 3) * (tileW + gap)}px`, top: `${y0 + Math.floor(i / 3) * (tileH + gap + 40)}px`, width: `${tileW}px`, height: `${tileH}px`, background: tint });
    if (shot) {
      const picture = img(asset(shot), "", tile);
      Object.assign(picture.style, { left: "22px", top: "22px", width: "384px", height: "240px" });
    } else if (label === "Every output") {
      ["invoice.png", "lab-report.png", "receipt.png"].forEach((name, j) => {
        const picture = img(output(name), "", tile);
        Object.assign(picture.style, { left: `${26 + j * 110}px`, top: `${24 + j * 8}px`, width: "130px", height: "184px", objectFit: "cover", objectPosition: "top" });
      });
    } else {
      const code = el("div", "", tile, `$ curl …/render<br><span style="color:#86efac">✓ 200 application/pdf</span>`);
      Object.assign(code.style, { position: "absolute", left: "22px", top: "22px", right: "22px", padding: "18px 20px", background: "#0f172a", color: "#e2e8f0", borderRadius: "8px", font: "400 20px/1.6 Mono" });
    }
    const name = el("div", "label", tile, label);
    name.style.background = "rgba(255,255,255,0.92)";
    name.style.padding = "10px 14px";
    name.style.borderRadius = "10px";
    const check = el("div", "check", tile, CHECK_SVG);
    check.style.background = "#047857";
    return { tile, check };
  });
  return [kicker(def, root, 236), (time) => {
    animateHeadline(h, time, def.linesAt);
    tiles.forEach(({ tile, check }, i) => {
      const p = enter(time, def.tiles.at + i * 0.25, 1);
      tile.style.opacity = p;
      tile.style.transform = `translateY(${(1 - p) * 40}px)`;
      const c = enter(time, def.tiles.checksAt + i, 0.5);
      check.style.opacity = c;
      check.style.transform = `scale(${0.4 + 0.6 * c})`;
    });
  }];
});

// 9 — end card.
scene(9, SCENES[9], (root) => {
  const def = SCENES[9];
  const wrap = el("div", "", root);
  Object.assign(wrap.style, { position: "absolute", left: "0", right: "0", top: "250px", display: "flex", flexDirection: "column", alignItems: "center", gap: "34px", textAlign: "center" });
  const brand = el("div", "", wrap);
  Object.assign(brand.style, { display: "flex", alignItems: "center", gap: "34px", font: "700 168px/1 Display", letterSpacing: "-0.03em", color: def.ink });
  brand.innerHTML = `<span class="mark">${markSvg(150, "#2563eb", "#ffffff")}</span><span>Open Reports</span>`;
  const tagline = el("div", "", wrap);
  Object.assign(tagline.style, { font: "400 46px/1.25 Display", color: "#5d6c82" });
  tagline.innerHTML = `${def.tagline[0]} ${def.tagline[1].replace(def.accent, `<span class="accent" style="color:${def.accentColor};font-size:1.12em">${def.accent}</span>`)}`;
  const cta = el("div", "", wrap);
  Object.assign(cta.style, { display: "flex", alignItems: "center", gap: "28px", marginTop: "20px" });
  cta.innerHTML = `<span class="cta"><svg width="30" height="30" viewBox="0 0 24 24"><path d="M12 2.6l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.4l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" fill="#fde68a"/></svg>Star on GitHub</span><span style="font:400 30px/1 Mono;color:#1a2b49">${REPO}</span>`;
  const stats = el("div", "", wrap, def.stats);
  Object.assign(stats.style, { font: "400 26px/1 Mono", color: "#5d6c82", marginTop: "36px", letterSpacing: "0.02em" });
  return [(time) => {
    const p = enter(time, def.wordmarkAt, 1.2);
    brand.style.opacity = p;
    brand.style.transform = `scale(${1.08 - 0.08 * p})`;
    for (const [node, at] of [[tagline, def.taglineAt], [cta, def.ctaAt], [stats, def.statsAt]]) {
      const q = enter(time, at, 1);
      node.style.opacity = q;
      node.style.transform = `translateY(${(1 - q) * 24}px)`;
    }
  }];
});

// ---------------------------------------------------------------- frame contract
window.DURATION = DURATION;
window.FPS = FPS;
window.renderFrame = (time) => {
  for (const { def, root, update } of updaters) {
    const active = time >= beatTime(def.from) && time < beatTime(def.to);
    root.style.display = active ? "block" : "none";
    if (active) update(time);
  }
};
window.ready = (async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map((image) => image.decode().catch(() => { throw new Error(`Image failed: ${image.src}`); })));
  return true;
})();
