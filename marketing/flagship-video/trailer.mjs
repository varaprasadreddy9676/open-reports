// Cuts the ~90-second trailer from the recorded flagship film, at sentence boundaries taken from its captions.
// Run after record.mjs:  node marketing/flagship-video/trailer.mjs
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { STACK } from "./stack.mjs";

const run = promisify(execFile);
const source = path.join(STACK.out, `${STACK.filmId}.mp4`);
const target = path.join(STACK.out, `${STACK.filmId}-trailer.mp4`);
const work = path.join(STACK.work, "trailer");

/**
 * Each segment runs from the caption that starts with `from` to the end of the caption that ends with `to`.
 * `to: "before:<text>"` ends just before the caption starting with that text; `to: "end"` runs to the film's end.
 */
const SEGMENTS = [
  { from: "A billing clerk clicks Print.", to: "before:Every report in Open Reports has three ingredients." },
  { from: "Preview runs the real renderer.", to: "CareDesk will get." },
  { from: "Preview again. The full letterhead", to: "page of a long bill." },
  { from: "Now click Download PDF", to: "exactly what it contains." },
  { from: "The report file is identical.", to: "its own logo." },
  { from: "The printed invoice now says amount payable.", to: "copy of the report." },
  { from: "It comes with search, print, and downloads.", to: "Find one transaction." },
  { from: "Open Reports is free and open source.", to: "end" },
];

const seconds = (stamp) => { const [h, m, s] = stamp.split(":"); return Number(h) * 3600 + Number(m) * 60 + Number(s); };

async function cues() {
  const text = await readFile(path.join(STACK.out, `${STACK.filmId}.vtt`), "utf8");
  return text.split("\n\n").slice(1).map((block) => {
    const [times, ...lines] = block.trim().split("\n");
    const [start, end] = times.split(" --> ");
    return { start: seconds(start), end: seconds(end), text: lines.join(" ") };
  });
}

const list = await cues();
const duration = Number((await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", source])).stdout);
await mkdir(work, { recursive: true });
const parts = [];
const captions = [];
let offset = 0;
for (const [index, segment] of SEGMENTS.entries()) {
  const first = list.findIndex((cue) => cue.text.startsWith(segment.from));
  if (first < 0) throw new Error(`No caption starts with "${segment.from}"`);
  let end;
  if (segment.to === "end") end = duration;
  else if (segment.to.startsWith("before:")) {
    const next = list.findIndex((cue) => cue.text.startsWith(segment.to.slice(7)));
    if (next < 0) throw new Error(`No caption starts with "${segment.to.slice(7)}"`);
    end = list[next].start - 1.2; // stop before the next card fades in
  } else {
    const last = list.findIndex((cue, i) => i >= first && cue.text.endsWith(segment.to));
    if (last < 0) throw new Error(`No caption ends with "${segment.to}"`);
    end = list[last].end + 0.5;
  }
  const start = Math.max(0, list[first].start - 0.4);
  const length = Math.min(end, duration) - start;
  const file = path.join(work, `part-${index}.mp4`);
  const fade = `fade=t=in:st=0:d=0.3,fade=t=out:st=${(length - 0.3).toFixed(2)}:d=0.3`;
  const afade = `afade=t=in:st=0:d=0.2,afade=t=out:st=${(length - 0.3).toFixed(2)}:d=0.3`;
  await run("ffmpeg", ["-y", "-ss", start.toFixed(2), "-t", length.toFixed(2), "-i", source, "-vf", fade, "-af", afade,
    "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", file]);
  parts.push(file);
  for (const cue of list) if (cue.start >= start && cue.end <= start + length + 0.01) captions.push({ start: cue.start - start + offset, end: cue.end - start + offset, text: cue.text });
  offset += length;
}
const concat = path.join(work, "parts.txt");
await writeFile(concat, parts.map((file) => `file '${file}'`).join("\n"));
await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concat, "-c", "copy", "-movflags", "+faststart", target]);
const stamp = (n) => new Date(Math.max(0, n) * 1000).toISOString().slice(11, 23);
await writeFile(target.replace(/\.mp4$/, ".vtt"), `WEBVTT\n\n${captions.map((cue) => `${stamp(cue.start)} --> ${stamp(cue.end)}\n${cue.text}`).join("\n\n")}\n`);
console.log(`Trailer: ${offset.toFixed(1)} s from ${SEGMENTS.length} segments → ${target}`);
