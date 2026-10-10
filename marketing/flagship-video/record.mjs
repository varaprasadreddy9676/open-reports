// Records the flagship film: "From a blank page to Print".
//   node marketing/flagship-video/record.mjs              full film (needs the film stack, see README.md)
//   FILM_DRY=1 node ... record.mjs 03 04                  rehearse chapters quickly: no voice, no recording
import { createRequire } from "node:module";
import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFilm } from "./film.mjs";
import { CHAPTERS } from "./chapters/index.mjs";
import { STACK } from "./stack.mjs";
import { LIBRARY_DIR, libraryFile } from "./chapters/04-subreport.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const { chromium } = createRequire(path.join(root, "apps/designer/package.json"))("@playwright/test");
const dry = process.env.FILM_DRY === "1";
const wanted = process.argv.slice(2);
const selected = wanted.length ? CHAPTERS.filter((chapter) => wanted.some((w) => chapter.id.startsWith(w))) : CHAPTERS;
if (!selected.length) throw new Error(`No chapter matches ${wanted.join(", ")}. Chapters: ${CHAPTERS.map((c) => c.id).join(", ")}`);

for (const [name, url] of Object.entries(STACK.health)) {
  const response = await fetch(url).catch(() => null);
  if (!response?.ok) throw new Error(`${name} is not running at ${url}. Start the film stack first (see README.md).`);
}
await rm(STACK.downloads, { recursive: true, force: true });
await mkdir(STACK.downloads, { recursive: true });
await mkdir(STACK.work, { recursive: true });
await fetch(`${STACK.caredesk}/app-api/training/reset`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "finished" }) });

const browser = await chromium.launch();
const started = Date.now();
try {
  const film = await createFilm({ browser, id: STACK.filmId, work: STACK.work, out: STACK.out, dry });
  // The hospital's shared report library: the letterhead file the film picks in chapter 4.
  await mkdir(LIBRARY_DIR, { recursive: true });
  await copyFile(path.join(root, "marketing/training-videos/fixtures/caredesk/reports/northstar-header.report.json"), libraryFile(LIBRARY_DIR));
  const state = { libraryPath: libraryFile(LIBRARY_DIR) };
  for (const chapter of selected) {
    const t = Date.now();
    console.log(`▶ ${chapter.id}`);
    try {
      await chapter.run(film, state);
    } finally {
      if (dry) await film.page.screenshot({ path: path.join(STACK.work, `dry-${chapter.id}.png`) }).catch(() => undefined);
    }
    console.log(`  ✓ ${chapter.id} in ${((Date.now() - t) / 1000).toFixed(0)} s`);
  }
  const result = await film.finish();
  console.log(`Done: ${(result.seconds / 60).toFixed(1)} min of film in ${((Date.now() - started) / 60000).toFixed(1)} min`);
} finally {
  await browser.close();
}
