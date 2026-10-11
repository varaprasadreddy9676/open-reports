// Recording toolkit for the flagship film: overlays, narration, captions, chapters and the final encode.
// Everything on screen is the real product and real HTTP traffic; overlays only add titles, a cursor and labels.
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { OVERLAY_SCRIPT } from "./overlay.mjs";

const run = promisify(execFile);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const VOICE = process.env.FILM_VOICE || "Samantha";
const RATE = process.env.FILM_RATE || "172";

/** Splits narration into caption chunks of at most ~90 characters, broken at sentence or clause ends. */
export function captionChunks(text, max = 90) {
  const words = text.split(/\s+/);
  const chunks = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max && current) { chunks.push(current); current = word; }
    else current = next;
    if (/[.!?]$/.test(word) && current.length > max * 0.55) { chunks.push(current); current = ""; }
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function createFilm({ browser, id, work, out, size = { width: 1920, height: 1080 }, dry = false }) {
  await mkdir(work, { recursive: true });
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, colorScheme: "light", acceptDownloads: true, ...(dry ? {} : { recordVideo: { dir: work, size } }) });
  await context.addInitScript(OVERLAY_SCRIPT);
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (error) => console.log("PAGE ERROR", error.message));
  const start = Date.now();
  const at = () => (Date.now() - start) / 1000;
  const audio = [];
  const cues = [];
  const chapters = [];
  let segment = 0;

  async function speech(text) {
    if (dry) return { file: null, seconds: Math.min(1.2, text.length / 60) };
    const file = path.join(work, `${id}-${String(segment++).padStart(3, "0")}.aiff`);
    await run("say", ["-v", VOICE, "-r", RATE, "-o", file, text]);
    const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
    return { file, seconds: Number(stdout.trim()) };
  }

  const tools = (method, ...args) => page.evaluate(({ method, args }) => window.__film?.[method]?.(...args), { method, args }).catch(() => undefined);

  const film = {
    page,
    dry,
    sleep: (ms) => sleep(dry ? Math.min(ms, 150) : ms),

    /** Narrate `text`. If `during` is given, the actions run while the voice plays; the film waits for both. */
    async say(text, during) {
      const { file, seconds } = await speech(text);
      const begin = at();
      if (file) audio.push({ file, at: begin });
      const chunks = captionChunks(text);
      const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      let cursor = begin;
      for (const chunk of chunks) {
        const length = (chunk.length / total) * seconds;
        cues.push({ start: cursor, end: cursor + length, text: chunk });
        cursor += length;
      }
      const voice = sleep(seconds * 1000 + (dry ? 0 : 350));
      if (during) await Promise.all([voice, during()]); else await voice;
    },

    async goto(url) {
      await page.goto(url);
      await page.waitForLoadState("networkidle").catch(() => undefined);
    },

    async aim(locator) {
      const box = await locator.boundingBox({ timeout: 5000 }).catch(() => null);
      if (!box) return null;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y, { steps: dry ? 1 : 18 });
      await tools("focus", box.x, box.y, box.width, box.height);
      await film.sleep(260);
      return { x, y };
    },

    async click(locator, options = {}) {
      await locator.waitFor({ state: "visible" });
      await locator.scrollIntoViewIfNeeded().catch(() => undefined);
      const point = await film.aim(locator);
      if (point) await tools("pulse", point.x, point.y);
      await locator.click(options);
      await film.sleep(options.pause ?? 650);
    },

    /** Types visibly for short text; pastes long text (JSON) at once, as a person would. */
    async fill(locator, text, { pause = 400 } = {}) {
      await film.click(locator, { pause: 120 });
      if (text.length <= 48 && !dry) {
        await locator.fill("");
        await locator.pressSequentially(text, { delay: 32 });
      } else {
        await locator.fill(text);
      }
      await film.sleep(pause);
    },

    async select(locator, value) {
      await film.aim(locator);
      await locator.selectOption(value);
      await film.sleep(550);
    },

    async chapter(number, title, subtitle = "") {
      chapters.push({ title, at: at() });
      await tools("chapter", number, title, subtitle);
      await film.sleep(3000);
    },

    /** A chapter mark without an on-screen card (the opening and the recap use full-screen cards instead). */
    mark: (title) => { chapters.push({ title, at: at() }); },

    callout: (text, kind = "info") => tools("callout", text, kind),
    terminal: (command, output) => tools("terminal", command, output),
    clearTerminal: () => tools("terminal", null),

    async card(kind, data, ms) {
      await tools("card", kind, data);
      await film.sleep(ms);
    },
    hideCard: () => tools("card", null),

    /** Saves the recording, captions, chapters and transcript, then encodes the MP4 with narration. */
    async finish() {
      const video = page.video();
      await context.close();
      if (dry) return { seconds: at() };
      const raw = path.join(work, `${id}.webm`);
      await video.saveAs(raw);
      await mkdir(out, { recursive: true });
      const stamp = (seconds) => {
        const ms = Math.max(0, Math.round(seconds * 1000));
        const pad = (n, w = 2) => String(n).padStart(w, "0");
        return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
      };
      await writeFile(path.join(out, `${id}.vtt`), `WEBVTT\n\n${cues.map((cue) => `${stamp(cue.start)} --> ${stamp(cue.end)}\n${cue.text}`).join("\n\n")}\n`);
      const minutes = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
      await writeFile(path.join(out, `${id}.chapters.md`), `# Chapters\n\n${chapters.map((chapter) => `- ${minutes(chapter.at)} ${chapter.title}`).join("\n")}\n`);
      await writeFile(path.join(out, `${id}.transcript.txt`), `${[...new Set(cues.map((cue) => cue.text))].join(" ").replace(/([.!?]) /g, "$1\n")}\n`);
      await encode(raw, audio, path.join(out, `${id}.mp4`), work);
      return { seconds: at(), chapters };
    },
  };
  return film;
}

/** Mixes each narration clip at its timestamp over the recording and writes a web-ready H.264/AAC MP4. */
async function encode(raw, audio, target, work) {
  const voice = path.join(work, "narration.wav");
  const filter = audio.map((clip, index) => `[${index}:a]adelay=${Math.round(clip.at * 1000)}:all=1[v${index}]`).join(";")
    + `;${audio.map((_, index) => `[v${index}]`).join("")}amix=inputs=${audio.length}:duration=longest:normalize=0,alimiter=limit=0.93[out]`;
  await run("ffmpeg", ["-y", ...audio.flatMap((clip) => ["-i", clip.file]), "-filter_complex", filter, "-map", "[out]", "-ar", "48000", voice], { maxBuffer: 1 << 24 });
  // apad extends the narration with silence so the picture, not the last sentence, sets the length.
  await run("ffmpeg", ["-y", "-i", raw, "-i", voice, "-map", "0:v", "-map", "1:a", "-af", "apad", "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-tune", "stillimage", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-shortest", target], { maxBuffer: 1 << 24 });
}
