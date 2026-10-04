// The executable director's brief: tempo, scenes, copy and every sound cue. The composition and audio.mjs both
// read this file, so picture and sound cannot drift apart. Times are in beats (120 BPM: 1 beat = 0.5 s).

export const FPS = 30;
export const BPM = 120;
export const BEAT = 60 / BPM;
export const BARS = 21;
export const DURATION = BARS * 4 * BEAT; // 42 s
export const t = (beat) => beat * BEAT;

export const REPO = "github.com/varaprasadreddy9676/open-reports";

// Screenshot geometry (CSS px of the 1440 x 900 capture) for cursor targets and highlights.
export const ANCHORS = {
  designerTable: { x: 406, y: 283, w: 640, h: 138 },
  aiAccept: { x: 415, y: 745, w: 65, h: 30 },
  rulesRows: [{ x: 72, y: 316, w: 995, h: 37 }, { x: 72, y: 391, w: 995, h: 38 }],
  paginationRows: [{ x: 0, y: 808, w: 1440, h: 28 }, { x: 0, y: 838, w: 1440, h: 28 }],
};

/**
 * Scenes. `from`/`to` are beats. `lines` land one per beat starting at `linesAt`; an `accent` word inside a line is
 * set in the serif italic and lands half a beat after its line.
 */
export const SCENES = [
  { id: "hook", from: 0, to: 8, tint: "#ffffff", ink: "#1a2b49", accentColor: "#2563eb", kicker: "// 00 — a familiar problem",
    words: [["Still", 0], ["fighting", 1], ["your", 2], ["report engine?", 3, true]] },
  { id: "reveal", from: 8, to: 16, tint: "#2563eb", ink: "#ffffff", accentColor: "#fde68a", kicker: "// 01 — meet",
    lines: ["Design documents", "in your browser.", "Render them anywhere."], accent: "anywhere.", linesAt: 9 },
  { id: "design", from: 16, to: 24, tint: "#f1ecff", ink: "#1a2b49", accentColor: "#6d28d9", kicker: "// 02 — visual designer · bands · groups",
    lines: ["Design it", "visually."], accent: "visually.", linesAt: 17, shot: "designer-before.png", shotAfter: "designer-after.png",
    cursor: { enter: 18, arrive: 20.5, click: 21, target: "designerTable" } },
  { id: "rules", from: 24, to: 32, tint: "#fdeef1", ink: "#1a2b49", accentColor: "#be123c", kicker: "// 03 — row rules · cell rules · hidden columns",
    lines: ["Highlight", "what matters."], accent: "matters.", linesAt: 25, shot: "rules.png",
    highlights: { anchor: "rulesRows", at: [27, 27.5] }, chips: { at: 29, items: ["Row rules", "Cell rules", "Hidden columns"] } },
  { id: "pagination", from: 32, to: 40, tint: "#e9f1ff", ink: "#1a2b49", accentColor: "#1d4ed8", kicker: "// 04 — pagination you can explain",
    lines: ["Page breaks,", "explained."], accent: "explained.", linesAt: 33, shot: "pagination.png",
    highlights: { anchor: "paginationRows", at: [35, 36] }, chips: { at: 37, items: ["Repeating headers", "Keep together", "Page X of Y"] },
    callouts: [
      [35, "p.2", "row 51 needs 13.2pt, only 9pt left"],
      [36, "p.3", "row 104 needs 13.2pt, only 4pt left"],
    ] },
  { id: "outputs", from: 40, to: 48, tint: "#e8f6ef", ink: "#1a2b49", accentColor: "#047857", kicker: "// 05 — one definition, six formats",
    lines: ["One template.", "Every output."], accent: "output.", linesAt: 41,
    chips: { at: 42, items: ["PDF", "HTML", "Excel", "CSV", "ZPL labels", "ESC/POS"] },
    pages: { at: 41, items: ["invoice.png", "lab-report.png", "receipt.png", "pharmacy-label.png"] } },
  { id: "ai", from: 48, to: 56, tint: "#fdf6e6", ink: "#1a2b49", accentColor: "#b45309", kicker: "// 06 — your own key · reviewed diffs",
    lines: ["AI drafts", "the edit.", "You approve."], accent: "approve.", linesAt: 49, shot: "ai.png", shotAfter: "ai-accepted.png",
    cursor: { enter: 50.5, arrive: 52.5, click: 53, target: "aiAccept" },
    callouts: [
      [50, "AI", "Company name: larger, bold, blue", 1130, 300],
      [53.5, "✓", "Applied as one undoable step", 1130, 430],
    ] },
  { id: "api", from: 56, to: 64, tint: "#ecf5f8", ink: "#1a2b49", accentColor: "#0e7490", kicker: "// 07 — REST API · JSON · .jrxml import",
    lines: ["Render from", "any app."], accent: "app.", linesAt: 57,
    terminal: {
      typeFrom: 58, typeTo: 60,
      command: ["$ curl -X POST $API/v1/templates/invoice/render \\", "    -d '{\"format\":\"pdf\",\"data\":{...}}' -o invoice.pdf"],
      response: [[60.5, "HTTP/1.1 200 OK   application/pdf"], [61, "also: html  xlsx  csv  zpl  escpos"]],
    },
    note: { at: 62, text: "Moving from JasperReports? Import .jrxml folders as editable drafts." } },
  { id: "recap", from: 64, to: 72, tint: "#ffffff", ink: "#1a2b49", accentColor: "#2563eb", kicker: "// 08 — all of it, open source",
    lines: ["Everything", "you need."], accent: "need.", linesAt: 64.5,
    tiles: { at: 65, checksAt: 66, items: [
      ["Visual designer", "#f1ecff", "designer-after.png"], ["Conditions", "#fdeef1", "rules.png"], ["Pagination", "#e9f1ff", "pagination.png"],
      ["Every output", "#e8f6ef", null], ["Safe AI", "#fdf6e6", "ai.png"], ["API", "#ecf5f8", null],
    ] } },
  { id: "end", from: 72, to: 84, tint: "#ffffff", ink: "#1a2b49", accentColor: "#2563eb", kicker: "",
    wordmarkAt: 72, taglineAt: 74, ctaAt: 75, statsAt: 76,
    tagline: ["Design documents in your browser.", "Render them anywhere."], accent: "anywhere.",
    stats: "MIT licence  ·  self-hosted  ·  PDF  ·  Excel  ·  ZPL  ·  ESC/POS" },
];

/** Every sound, derived from the scenes so a visual change moves its sound with it. */
export function cues() {
  const list = [];
  const add = (beat, type, gain = 1) => list.push({ beat, time: t(beat), type, gain });
  for (const scene of SCENES) {
    if (scene.from > 0 && scene.id !== "end") add(scene.from - 0.5, "whoosh");
    scene.words?.forEach(([, at]) => add(at, "type", 0.9));
    scene.lines?.forEach((_, i) => add(scene.linesAt + i, "type", 0.7));
    if (scene.cursor) add(scene.cursor.click, "click");
    scene.highlights?.at.forEach((at) => add(at, "pop", 0.7));
    scene.callouts?.forEach(([at]) => { if (!scene.highlights?.at.includes(at)) add(at, "pop", 0.6); });
    scene.chips?.items.forEach((_, i) => add(scene.chips.at + i * (scene.id === "outputs" ? 1 : 0.5), "pop", 0.8));
    scene.pages?.items.forEach((_, i) => add(scene.pages.at + i * 0.5, "tick", 0.6));
    if (scene.terminal) {
      for (let b = scene.terminal.typeFrom; b < scene.terminal.typeTo; b += 0.25) add(b, "tick", 0.35);
      scene.terminal.response.forEach(([at]) => add(at, "pop", 0.7));
    }
    if (scene.note) add(scene.note.at, "pop", 0.5);
    scene.tiles?.items.forEach((_, i) => add(scene.tiles.checksAt + i, "check", 0.85));
  }
  add(8, "impact", 0.8);
  add(68, "riser");
  add(72, "impact");
  return list.sort((a, b) => a.time - b.time);
}

/** Music arrangement per bar: which parts play. */
export function arrangement(bar) {
  if (bar < 2) return { pad: 1.3, hats: 0.55, kick: 0, bass: 0, clap: 0, filter: 0.45 };
  if (bar >= 18) return { pad: 1, hats: bar < 20 ? 0.6 : 0, kick: bar < 20 ? 1 : 0, bass: bar < 20 ? 0.9 : 0, clap: bar < 20 ? 0.6 : 0, filter: 1 };
  if (bar >= 16) return { pad: 0.9, hats: 0.8, kick: 1, bass: 1, clap: 0.7, filter: 1 };
  return { pad: 0.85, hats: 0.7, kick: 1, bass: 1, clap: bar % 4 >= 2 ? 0.5 : 0, filter: 0.85 };
}
