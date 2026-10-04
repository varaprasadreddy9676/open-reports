// v2 — the executable director's brief (BRIEF.md). Picture (composition/main.mjs) and sound (audio.mjs) both read it.
// 120 BPM, 32 bars = 64 s. Positions are in beats (1 beat = 0.5 s = 15 frames).

export const FPS = 30;
export const BPM = 120;
export const BEAT = 60 / BPM;
export const BARS = 32;
export const DURATION = BARS * 4 * BEAT;
export const t = (beat) => beat * BEAT;
export const REPO = "github.com/varaprasadreddy9676/open-reports";

/**
 * Live scenes play a captured clip (assets/clips/<clip>) inside a browser frame. `speed` maps scene time to clip time;
 * `camera` keyframes are [beat, zoom, x, y] where x/y is the clip point (CSS px of the 1440 x 900 capture) kept centred.
 */
export const SCENES = [
  // ---- Act 1: hook
  { id: "words", from: 0, to: 8, kind: "words",
    words: [["Invoices.", 0, "invoice.png"], ["Statements.", 1, "account-statement.png"], ["Lab reports.", 2, "lab-report.png"], ["Receipts.", 3, "receipt.png"], ["Labels.", 4, "pharmacy-label.png"]],
    lines: [["Every business", 5], ["runs on", 6], ["documents.", 7, "accent"]] },
  { id: "pain", from: 8, to: 16, kind: "pain",
    headline: [["Building them still", 8], ["feels like 2005.", 8.5, "accent"]],
    cards: [["Desktop-only designers", 10], ["Page breaks nobody can explain", 11], ["Per-seat licences", 12], ["A different tool per format", 13]],
    turn: ["There's a better way.", 14.5] },
  // ---- Act 2: reveal (drop)
  { id: "reveal", from: 16, to: 24, kind: "reveal", wordmarkAt: 16, taglineAt: [18, 19], chipsAt: 21,
    tagline: ["Design documents in your browser.", "Render them anywhere."], accent: "anywhere.", chips: ["Open source", "Self-hosted", "MIT licence"] },
  // ---- Act 3: the product, live
  { id: "data", from: 24, captions: ["paste a sample response", "fields are typed", "a table is built for you"], to: 36, kind: "live", clip: "data", speed: 1.75, number: "01", title: ["Start from your", "data."],
    camera: [[24, 1.55, 520, 330], [30, 1.55, 520, 330], [32.5, 1.3, 760, 330]] },
  { id: "drag", from: 36, captions: ["drop a list", "table, repeater or cards", "columns from the data"], to: 44, kind: "live", clip: "drag", speed: 1.2, number: "02", title: ["Drag. Drop.", "Done."],
    camera: [[36, 1.35, 520, 420], [39, 1.35, 640, 420], [41, 1.12, 760, 400]] },
  { id: "pages", from: 44, captions: ["real font metrics", "headers that repeat", "every break explained"], to: 56, kind: "live", clip: "pages", speed: 1, number: "03", title: ["Pages that", "behave."],
    camera: [[44, 1, 720, 450], [50, 1.08, 760, 470], [52.5, 1.45, 480, 820]] },
  { id: "rules", from: 56, captions: ["plain expressions", "row and cell rules", "a live sample shows matches"], to: 68, kind: "live", clip: "rules", speed: 1.35, number: "04", title: ["Highlight what", "matters."],
    camera: [[56, 1.25, 1150, 330], [58.5, 1.7, 1260, 260], [62, 1.35, 600, 320], [68, 1.45, 600, 320]] },
  { id: "formats", from: 68, captions: ["same bindings", "same pagination", "six renderers"], to: 76, kind: "live", clip: "formats", speed: 1, number: "05", title: ["One template.", "Every format."],
    camera: [[68, 1, 720, 450], [76, 1.06, 720, 450]], stamps: ["PDF", "HTML", "Excel", "CSV", "ZPL", "ESC/POS"], stampsAt: 68 },
  { id: "ai", from: 76, captions: ["bring your own key", "you review the change", "one undo step"], to: 88, kind: "live", clip: "ai", speed: 1, number: "06", title: ["AI that asks", "first."],
    camera: [[76, 1.6, 420, 770], [81, 1.6, 420, 770], [83, 1.25, 600, 560], [86, 1.15, 700, 450]] },
  { id: "api", from: 88, to: 96, kind: "terminal", number: "07", title: ["Ship it from", "any app."],
    command: "curl -X POST $API/v1/templates/invoice/render -d @order.json -o invoice.pdf", typeFrom: 89, typeTo: 91.5,
    response: [[92, "200 OK  ·  application/pdf"], [92.5, "also html · xlsx · csv · zpl · escpos"]], pageAt: 93 },
  { id: "migrate", from: 96, to: 104, kind: "migrate", number: "08", title: ["Bring your", "JasperReports."],
    files: ["invoice.jrxml", "statement.jrxml", "lab-result.jrxml", "discharge.jrxml", "receipt.jrxml", "label.jrxml"], filesAt: 97.5 },
  // ---- Act 4: payoff
  { id: "montage", from: 104, to: 112, kind: "montage",
    cuts: [["Design.", "data", 0.95], ["Bind.", "drag", 0.97], ["Paginate.", "pages", 0.72], ["Highlight.", "rules", 0.98], ["Export.", "formats", 0.08], ["Print.", "formats", 0.75], ["Automate.", "ai", 0.98], ["Own it.", null, 0]] },
  { id: "stats", from: 112, to: 120, kind: "stats",
    stats: [[112, "6", "output formats"], [114, "24", "ready-made starters"], [116, "0", "per-seat fees"]] },
  { id: "end", from: 120, to: 128, kind: "end", wordmarkAt: 120, taglineAt: 121, ctaAt: 122, statsAt: 123,
    tagline: "Design documents in your browser. Render them anywhere.", accent: "anywhere.",
    stats: "MIT  ·  self-hosted  ·  PDF  ·  HTML  ·  Excel  ·  CSV  ·  ZPL  ·  ESC/POS" },
];

/** Clip events (clicks, keystrokes) mapped into film time with each live scene's speed. */
export function clipEvents(manifests) {
  const out = [];
  for (const scene of SCENES) {
    if (scene.kind !== "live") continue;
    const manifest = manifests[scene.clip];
    if (!manifest?.events) continue;
    const start = t(scene.from), end = t(scene.to);
    let lastKey = -1;
    for (const event of manifest.events) {
      const time = start + event.frame / manifest.fps / scene.speed;
      if (time >= end - 0.05) continue;
      // Keystrokes are captured one per frame; space their sounds like fast human typing (~14 per second).
      if (event.type === "key") { if (time - lastKey < 0.07) continue; lastKey = time; }
      out.push({ time, type: event.type === "click" ? "click" : "key", gain: event.type === "click" ? 1 : 0.5 });
    }
  }
  return out;
}

/** Sound cues that come from the picture structure. */
export function cues() {
  const list = [];
  const add = (beat, type, gain = 1) => list.push({ beat, time: t(beat), type, gain });
  const scene = (id) => SCENES.find((s) => s.id === id);
  scene("words").words.forEach(([, at]) => add(at, "slam", 0.9));
  scene("words").lines.forEach(([, at]) => add(at, "type", 0.8));
  add(7.5, "whoosh", 0.9);
  scene("pain").cards.forEach(([, at]) => { add(at, "stamp", 0.9); add(at + 0.5, "scratch", 0.7); });
  add(12, "riser");
  add(16, "impact", 1.2);
  scene("reveal").taglineAt.forEach((at) => add(at, "type", 0.7));
  scene("reveal").chips.forEach((_, i) => add(scene("reveal").chipsAt + i * 0.5, "pop", 0.7));
  for (const s of SCENES.filter((s) => ["live", "terminal", "migrate"].includes(s.kind))) {
    add(s.from - 0.5, "whoosh", 0.75);
    add(s.from, "type", 0.55);
  }
  scene("formats").stamps.forEach((_, i) => add(scene("formats").stampsAt + i, "stamp", 0.75));
  const api = scene("api");
  for (let b = api.typeFrom; b < api.typeTo; b += 0.125) add(b, "key", 0.4);
  api.response.forEach(([at]) => add(at, "pop", 0.75));
  add(api.pageAt, "whoosh", 0.6);
  const migrate = scene("migrate");
  migrate.files.forEach((_, i) => add(migrate.filesAt + i * 0.5, "check", 0.7));
  add(100, "riser");
  scene("montage").cuts.forEach((_, i) => add(104 + i, "slam", 0.85));
  scene("stats").stats.forEach(([at]) => add(at, "impact", 0.7));
  add(116, "riser");
  add(120, "impact", 1.2);
  return list.sort((a, b) => a.time - b.time);
}

/** Music arrangement per bar. */
export function arrangement(bar) {
  if (bar < 2) return { kick: 0, stabs: 1, hats: 0.4, bass: 0, clap: 0, pad: 0.5, lead: 0, minor: false, filter: 0.6 };
  if (bar < 4) return { kick: 0.6, stabs: 0, hats: 0.6, bass: 0.5, clap: 0, pad: 0.9, lead: 0, minor: true, filter: 0.5, gapLastBeat: bar === 3 };
  if (bar < 6) return { kick: 1, stabs: 0, hats: 0.8, bass: 1, clap: 0.8, pad: 1, lead: 0.6, minor: false, filter: 1 };
  if (bar < 26) return { kick: 1, stabs: 0, hats: 0.8, bass: 1, clap: 0.7, pad: 0.8, lead: bar % 8 < 6 ? 0.75 : 0.45, minor: false, filter: 0.9, fill: bar % 4 === 3 };
  if (bar < 28) return { kick: 1, stabs: 0, hats: 1, bass: 1, clap: 1, pad: 0.9, lead: 1, minor: false, filter: 1, snare16: bar === 27 };
  if (bar < 30) return { kick: 1, stabs: 0, hats: 0.7, bass: 0.9, clap: 0.6, pad: 1, lead: 0.5, minor: false, filter: 1 };
  return { kick: bar === 30 ? 1 : 0, stabs: 0, hats: bar === 30 ? 0.5 : 0, bass: 0, clap: 0, pad: 1, lead: 0, minor: false, filter: 1 };
}
