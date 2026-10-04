// v2 soundtrack: synthesises music and sound effects from timeline.mjs (and the clip manifests' click/keystroke
// events) into build/audio.wav. No samples, no network; seeded noise makes it deterministic.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BEAT, BARS, DURATION, SCENES, arrangement, clipEvents, cues } from "./timeline.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const RATE = 48000;
const N = Math.round(DURATION * RATE);
const music = [new Float32Array(N), new Float32Array(N)]; // ducked by the kick
const drums = [new Float32Array(N), new Float32Array(N)];
const fx = [new Float32Array(N), new Float32Array(N)];

// ---------------------------------------------------------------- helpers
function mulberry32(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
const rand = mulberry32(64);
const noise = () => rand() * 2 - 1;
class Biquad {
  constructor(type, freq, q = 0.707) { this.type = type; this.q = q; this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set(freq); }
  set(freq) {
    const w = (2 * Math.PI * Math.min(freq, RATE * 0.45)) / RATE, cos = Math.cos(w), alpha = Math.sin(w) / (2 * this.q);
    let b0, b1, b2;
    if (this.type === "lp") { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; } else if (this.type === "hp") { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; } else { b0 = alpha; b1 = 0; b2 = -alpha; }
    const a0 = 1 + alpha;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = (-2 * cos) / a0; this.a2 = (1 - alpha) / a0;
  }
  run(x) { const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
}
const at = (s) => Math.round(s * RATE);
function mix(bus, start, length, fn, gain = 1, pan = 0) {
  const s = at(start), lg = gain * Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2, rg = gain * Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
  for (let i = 0, n = at(length); i < n; i++) {
    const k = s + i;
    if (k < 0 || k >= N) continue;
    const v = fn(i / RATE);
    bus[0][k] += v * lg; bus[1][k] += v * rg;
  }
}
const midi = (m) => 440 * 2 ** ((m - 69) / 12);
const kicks = [];

// ---------------------------------------------------------------- drums
function kick(time, gain) {
  kicks.push(time);
  let phase = 0;
  mix(drums, time, 0.5, (s) => { phase += (2 * Math.PI * (48 + 120 * Math.exp(-s * 30))) / RATE; return (Math.sin(phase) * Math.exp(-s * 6.5) + (s < 0.003 ? noise() * 0.3 : 0)) * gain; }, 1);
}
function hat(time, gain, open = false) {
  const hp = new Biquad("hp", 8000, 0.8);
  mix(drums, time, open ? 0.25 : 0.05, (s) => hp.run(noise()) * Math.exp(-s * (open ? 16 : 85)) * gain, 0.2, 0.2);
}
function clap(time, gain) {
  const bp = new Biquad("bp", 1400, 1.1);
  mix(drums, time, 0.32, (s) => bp.run(noise()) * ([0, 0.01, 0.021].reduce((e, o) => e + (s >= o ? Math.exp(-(s - o) * 150) : 0), 0) * 0.7 + Math.exp(-s * 14) * 0.5) * gain, 0.6, -0.1);
}
function snare(time, gain) {
  const bp = new Biquad("bp", 2200, 0.9);
  let phase = 0;
  mix(drums, time, 0.18, (s) => { phase += (2 * Math.PI * 190) / RATE; return (bp.run(noise()) * 0.8 + Math.sin(phase) * 0.4) * Math.exp(-s * 22) * gain; }, 0.45, 0.05);
}

// ---------------------------------------------------------------- harmony
const MAJOR = { chords: [[53, 57, 60, 64], [50, 57, 60, 65], [46, 53, 57, 62], [48, 55, 60, 62]], roots: [41, 38, 46, 36] }; // Fmaj7 Dm7 B♭maj7 Csus2
const MINOR = { chords: [[50, 57, 62, 65], [46, 53, 58, 62], [43, 50, 55, 58], [45, 52, 57, 61]], roots: [38, 46, 43, 45] }; // Dm B♭ Gm A
function pad(bar, part) {
  const key = part.minor ? MINOR : MAJOR, chord = key.chords[bar % 4], start = bar * 4 * BEAT, length = 4 * BEAT + 0.5;
  const lp = new Biquad("lp", 700 + 2800 * part.filter, 0.7);
  const phases = chord.flatMap(() => [rand() * 6, rand() * 6]);
  mix(music, start, length, (s) => {
    let v = 0;
    chord.forEach((note, i) => [-0.08, 0.08].forEach((d, k) => { const p = (phases[i * 2 + k] += (2 * Math.PI * midi(note + 12 + d)) / RATE); v += ((p / Math.PI) % 2) - 1; }));
    return lp.run(v) * Math.min(1, s / 0.25) * Math.min(1, (length - s) / 0.5) * part.pad * 0.03;
  }, 1);
}
function bass(bar, part) {
  const key = part.minor ? MINOR : MAJOR, root = key.roots[bar % 4];
  for (let step = 1; step < 8; step += 2) {
    if (part.gapLastBeat && step >= 6) continue;
    let phase = 0;
    const lp = new Biquad("lp", 380, 1.1);
    mix(music, bar * 4 * BEAT + step * (BEAT / 2), BEAT / 2, (s) => { phase += (2 * Math.PI * midi(root)) / RATE; return lp.run(Math.sin(phase) + 0.45 * (((phase / Math.PI) % 2) - 1)) * Math.min(1, s / 0.004) * Math.exp(-s * 4) * part.bass; }, 0.5);
  }
}
// The hook: an eighth-note pluck figure over the chord, repeating every bar. Indices into [chord tones + octave].
const MOTIF = [[0, 3], [0.5, 2], [1, 4], [1.75, 3], [2, 2], [2.5, 4], [3, 5], [3.5, 3]];
function lead(bar, part) {
  const key = part.minor ? MINOR : MAJOR, chord = key.chords[bar % 4];
  const tones = [...chord.map((n) => n + 12), ...chord.map((n) => n + 24)];
  for (const [beat, index] of MOTIF) {
    const note = tones[index] ?? tones[tones.length - 1];
    let phase = 0;
    const lp = new Biquad("lp", 3200, 1.2);
    mix(music, (bar * 4 + beat) * BEAT, 0.35, (s) => { phase += (2 * Math.PI * midi(note)) / RATE; const tri = 2 * Math.abs(((phase / Math.PI) % 2) - 1) - 1; return lp.run(tri + 0.3 * Math.sin(2 * phase)) * Math.exp(-s * 11) * part.lead; }, 0.2, beat % 1 ? 0.25 : -0.25);
  }
}
function stabs(bar, part) {
  const chord = MAJOR.chords[0];
  for (const beat of [0, 1, 2, 3, 4]) {
    if (bar * 4 + beat > 4 || bar > 1) continue; // one stab per hook word (beats 0–4)
    const lp = new Biquad("lp", 2500, 0.9);
    const phases = chord.map(() => 0);
    mix(music, (bar * 4 + beat) * BEAT, 0.3, (s) => { let v = 0; chord.forEach((n, i) => { phases[i] += (2 * Math.PI * midi(n + 12 + beat)) / RATE; v += ((phases[i] / Math.PI) % 2) - 1; }); return lp.run(v) * Math.exp(-s * 9) * 0.12 * part.stabs; }, 1);
  }
}

// ---------------------------------------------------------------- sound effects
const SFX = {
  whoosh(time, g) { const bp = new Biquad("bp", 400, 1.3), L = 0.5; mix(fx, time - 0.1, L, (s) => { const p = s / L; bp.set(300 + 3800 * p * p); return bp.run(noise()) * Math.sin(Math.PI * p) ** 1.4 * g * 1.5; }, 0.5, 0.2); },
  click(time, g) { mix(fx, time, 0.05, (s) => (Math.sin(2 * Math.PI * 2400 * s) * Math.exp(-s * 170) + noise() * Math.exp(-s * 420) * 0.5) * g, 0.42, -0.15); },
  key(time, g) { const bp = new Biquad("bp", 3000 + rand() * 1500, 2.5); mix(fx, time, 0.04, (s) => bp.run(noise()) * Math.exp(-s * 230) * g, 0.6, rand() * 0.4 - 0.2); },
  pop(time, g) { let p = 0; mix(fx, time, 0.12, (s) => { p += (2 * Math.PI * (620 + 540 * Math.min(1, s / 0.03))) / RATE; return Math.sin(p) * Math.exp(-s * 36) * g; }, 0.32, 0.1); },
  check(time, g) { SFX.pop(time, g); let p = 0; mix(fx, time + 0.05, 0.18, (s) => { p += (2 * Math.PI * 1760) / RATE; return Math.sin(p) * Math.exp(-s * 22) * g; }, 0.15, -0.1); },
  type(time, g) { const hp = new Biquad("hp", 2400, 0.7); mix(fx, time, 0.05, (s) => hp.run(noise()) * Math.exp(-s * 120) * g, 0.3, 0); },
  slam(time, g) {
    let p = 0; const lp = new Biquad("lp", 1800, 0.8);
    mix(fx, time, 0.5, (s) => { p += (2 * Math.PI * (70 + 160 * Math.exp(-s * 40))) / RATE; return (Math.sin(p) * Math.exp(-s * 9) + lp.run(noise()) * Math.exp(-s * 25) * 0.6) * g; }, 0.75, 0);
  },
  stamp(time, g) { SFX.slam(time, g * 0.7); const bp = new Biquad("bp", 900, 1.5); mix(fx, time, 0.12, (s) => bp.run(noise()) * Math.exp(-s * 45) * g, 0.5, 0.1); },
  scratch(time, g) { const bp = new Biquad("bp", 1500, 3), L = 0.28; mix(fx, time, L, (s) => { bp.set(1200 + 2600 * (s / L)); return bp.run(noise()) * Math.sin(Math.PI * s / L) * g; }, 0.5, -0.2); },
  riser(time) { const L = 4 * BEAT, bp = new Biquad("bp", 300, 2); let p = 0; mix(fx, time, L, (s) => { const q = s / L; bp.set(300 + 6000 * q * q); p += (2 * Math.PI * (200 + 800 * q * q)) / RATE; return (bp.run(noise()) * 0.9 + Math.sin(p) * 0.12) * q * q; }, 0.45, 0); },
  impact(time, g) {
    kick(time, 1.2 * g);
    const lp = new Biquad("lp", 6000, 0.5);
    mix(fx, time, 2.4, (s) => lp.run(noise()) * Math.exp(-s * 2.2) * 0.4 * g, 0.6, 0);
    let p = 0; mix(fx, time, 1.6, (s) => { p += (2 * Math.PI * 49) / RATE; return Math.sin(p) * Math.exp(-s * 1.8) * 0.7 * g; }, 0.7, 0);
  },
};

// ---------------------------------------------------------------- arrangement
for (let bar = 0; bar < BARS; bar++) {
  const part = arrangement(bar);
  if (part.pad) pad(bar, part);
  if (part.bass) bass(bar, part);
  if (part.lead) lead(bar, part);
  if (part.stabs) stabs(bar, part);
  for (let beat = 0; beat < 4; beat++) {
    const time = (bar * 4 + beat) * BEAT;
    if (part.gapLastBeat && beat === 3) continue; // breath before the drop
    if (part.kick) kick(time, part.kick);
    if (part.hats) { hat(time + BEAT / 2, part.hats, beat === 3); if (bar >= 4) { hat(time + BEAT / 4, part.hats * 0.4); hat(time + (3 * BEAT) / 4, part.hats * 0.4); } }
    if (part.clap && (beat === 1 || beat === 3)) clap(time, part.clap);
    if (part.fill && beat === 3) for (let k = 0; k < 4; k++) snare(time + k * (BEAT / 4), 0.35 + k * 0.15);
    if (part.snare16) for (let k = 0; k < 4; k++) snare(time + k * (BEAT / 4), 0.25 + 0.1 * beat + k * 0.05);
  }
}
const manifests = Object.fromEntries([...new Set(SCENES.filter((s) => s.clip).map((s) => s.clip))].map((name) => [name, JSON.parse(fs.readFileSync(path.join(here, "assets/clips", name, "manifest.json"), "utf8"))]));
const all = [...cues(), ...clipEvents(manifests)];
for (const cue of all) (SFX[cue.type] ?? (() => { throw new Error(`No sound for cue ${cue.type}`); }))(cue.time, cue.gain);

// ---------------------------------------------------------------- master: sidechain the music under the kick, glue, limit
const duck = new Float32Array(N).fill(1);
for (const time of kicks) for (let i = 0, s = at(time); i < at(0.35) && s + i < N; i++) duck[s + i] = Math.min(duck[s + i], 1 - 0.6 * Math.exp(-(i / RATE) / 0.11));
const L = new Float32Array(N), R = new Float32Array(N);
for (let i = 0; i < N; i++) {
  L[i] = music[0][i] * duck[i] + drums[0][i] + fx[0][i] * 0.9;
  R[i] = music[1][i] * duck[i] + drums[1][i] + fx[1][i] * 0.9;
}
let env = 0;
for (let i = 0; i < N; i++) {
  const level = Math.max(Math.abs(L[i]), Math.abs(R[i]));
  env = level > env ? level : env * 0.9995 + level * 0.0005;
  const gain = env > 0.7 ? 0.7 / env + (1 - 0.7 / env) * 0.4 : 1;
  L[i] = Math.tanh(L[i] * gain * 1.15); R[i] = Math.tanh(R[i] * gain * 1.15);
}
const fade = at(0.8);
for (let i = 0; i < fade; i++) { const g = i / fade; L[N - 1 - i] *= g; R[N - 1 - i] *= g; }
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const norm = 10 ** (-2.5 / 20) / peak; // headroom so the AAC encode stays under -1 dBFS
const out = path.join(here, "build", "audio.wav");
fs.mkdirSync(path.dirname(out), { recursive: true });
const data = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) { data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * norm)) * 32767), i * 4); data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * norm)) * 32767), i * 4 + 2); }
const header = Buffer.alloc(44);
header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8); header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(data.length, 40);
fs.writeFileSync(out, Buffer.concat([header, data]));
console.log(`audio: ${DURATION}s, ${all.length} cues (${all.length - cues().length} from clip clicks and keystrokes) -> build/audio.wav`);
