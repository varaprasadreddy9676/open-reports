// Renders the composition frame by frame and muxes it with build/audio.wav.
//   node render.mjs                 full film  -> build/open-reports-launch.mp4
//   node render.mjs --stills 3,9.5  PNG stills at those seconds -> build/stills/
//   node render.mjs --sheet         critique contact sheet (key moment of every scene) -> build/sheet.png
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { DURATION, FPS, SCENES, t } from "./timeline.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const build = path.join(here, "build");
const { chromium } = createRequire(path.join(here, "../../apps/designer/package.json"))("@playwright/test");
const TYPES = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".png": "image/png", ".ttf": "font/ttf", ".json": "application/json" };

function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(here, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!file.startsWith(here) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function open() {
  const server = await serve();
  const browser = await chromium.launch({ args: ["--force-color-profile=srgb", "--disable-lcd-text", "--font-render-hinting=none"] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/composition/index.html`);
  await page.waitForFunction(() => window.ready !== undefined, null, { timeout: 30_000 });
  await page.evaluate(() => window.ready);
  if (errors.length) throw new Error(`Composition errors:\n${errors.join("\n")}`);
  const frame = async (time) => {
    await page.evaluate((time) => window.renderFrame(time), time);
    return page.screenshot({ type: "png" });
  };
  return { frame, close: async () => { await browser.close(); server.close(); }, errors };
}

async function stills(times) {
  const { frame, close } = await open();
  fs.mkdirSync(path.join(build, "stills"), { recursive: true });
  const files = [];
  for (const time of times) {
    const file = path.join(build, "stills", `t-${time.toFixed(2).padStart(5, "0")}.png`);
    fs.writeFileSync(file, await frame(time));
    files.push(file);
  }
  await close();
  return files;
}

/** The moment each scene is fully built, plus mid-action frames, tiled 4 across for the critique loop. */
async function sheet() {
  const moments = SCENES.flatMap((s) => {
    const end = t(s.to) - 0.25;
    const extra = s.cursor ? [t(s.cursor.click) + 0.1] : s.terminal ? [t(s.terminal.typeFrom) + 0.6] : [];
    return [...extra, end];
  });
  const files = await stills(moments);
  const seq = path.join(build, "sheet-frames");
  fs.rmSync(seq, { recursive: true, force: true });
  fs.mkdirSync(seq);
  files.forEach((file, i) => fs.copyFileSync(file, path.join(seq, `${String(i).padStart(3, "0")}.png`)));
  const rows = Math.ceil(files.length / 4);
  await run("ffmpeg", ["-loglevel", "error", "-y", "-framerate", "1", "-i", path.join(seq, "%03d.png"),
    "-vf", `scale=960:540,tile=4x${rows}:padding=6:color=black`, "-frames:v", "1", path.join(build, "sheet.png")]);
  return path.join(build, "sheet.png");
}

function run(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: [input ? "pipe" : "ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    if (input) input(child.stdin);
  });
}

async function film() {
  const audio = path.join(build, "audio.wav");
  if (!fs.existsSync(audio)) throw new Error("Run node audio.mjs first.");
  const { frame, close } = await open();
  const total = Math.round(DURATION * FPS);
  const out = path.join(build, "open-reports-launch.mp4");
  const started = Date.now();
  await run("ffmpeg", ["-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", "-i", audio,
    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-shortest", out], async (stdin) => {
    for (let i = 0; i < total; i++) {
      const png = await frame(i / FPS);
      if (!stdin.write(png)) await new Promise((r) => stdin.once("drain", r));
      if (i % 150 === 0) process.stdout.write(`frame ${i}/${total}\n`);
    }
    stdin.end();
  });
  await close();
  console.log(`rendered ${total} frames in ${((Date.now() - started) / 1000).toFixed(0)}s -> ${path.relative(process.cwd(), out)}`);
}

const args = process.argv.slice(2);
if (args[0] === "--stills") console.log((await stills(args[1].split(",").map(Number))).join("\n"));
else if (args[0] === "--sheet") console.log(await sheet());
else await film();
