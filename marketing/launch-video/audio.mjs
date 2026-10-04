// Synthesises the soundtrack (music + sound effects) from timeline.mjs and writes build/audio.wav.
// Everything is generated: no samples, no network, deterministic (seeded noise).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BEAT, BARS, DURATION, arrangement, cues } from "./timeline.mjs";

const RATE = 48000;
const N = Math.round(DURATION * RATE);
const L = new Float32Array(N);
const R = new Float32Array(N);

// ---------------------------------------------------------------- helpers
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261004);
const noise = () => rand() * 2 - 1;

/** RBJ biquad. */
class Biquad {
  constructor(type, freq, q = 0.707) { this.type = type; this.q = q; this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set(freq); }
  set(freq) {
    const w = (2 * Math.PI * Math.min(freq, RATE * 0.45)) / RATE, cos = Math.cos(w), alpha = Math.sin(w) / (2 * this.q);
    let b0, b1, b2;
    if (this.type === "lp") { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; }
    else if (this.type === "hp") { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; }
    else { b0 = alpha; b1 = 0; b2 = -alpha; } // band-pass (0 dB peak)
    const a0 = 1 + alpha;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = (-2 * cos) / a0; this.a2 = (1 - alpha) / a0;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

const at = (seconds) => Math.round(seconds * RATE);
function mix(start, length, fn, gain = 1, pan = 0) {
  const s = at(start), lg = gain * Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2, rg = gain * Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
  for (let i = 0; i < at(length); i++) {
    const n = s + i;
    if (n < 0 || n >= N) continue;
    const v = fn(i / RATE, i);
    L[n] += v * lg; R[n] += v * rg;
  }
}
const midi = (m) => 440 * 2 ** ((m - 69) / 12);

// ---------------------------------------------------------------- instruments
function kick(time, gain) {
  let phase = 0;
  mix(time, 0.45, (s) => {
    const f = 45 + 110 * Math.exp(-s * 32);
    phase += (2 * Math.PI * f) / RATE;
    return (Math.sin(phase) * Math.exp(-s * 7) + (s < 0.004 ? noise() * 0.25 * (1 - s / 0.004) : 0)) * gain;
  }, 0.95);
}
function hat(time, gain, open = false) {
  const hp = new Biquad("hp", 7500, 0.8);
  mix(time, open ? 0.22 : 0.06, (s) => hp.run(noise()) * Math.exp(-s * (open ? 18 : 70)) * gain, 0.22, 0.15);
}
function clap(time, gain) {
  const bp = new Biquad("bp", 1500, 1.2);
  mix(time, 0.3, (s) => {
    const bursts = [0, 0.011, 0.022].reduce((e, o) => e + (s >= o ? Math.exp(-(s - o) * 140) : 0), 0);
    return bp.run(noise()) * (bursts * 0.6 + Math.exp(-s * 16) * 0.5) * gain;
  }, 0.55, -0.1);
}
// F major palette: Fmaj9 → Am7 → Dm9 → B♭maj7(#11), one chord per bar.
const CHORDS = [[53, 57, 60, 64, 67], [57, 60, 64, 67, 71], [50, 57, 60, 64, 65], [46, 53, 57, 62, 64]];
const ROOTS = [41, 45, 38, 46];
function pad(bar, gain, filter) {
  const chord = CHORDS[bar % 4], start = bar * 4 * BEAT, length = 4 * BEAT + 0.6;
  const lp = new Biquad("lp", 900 + 2600 * filter, 0.6), lp2 = new Biquad("lp", 900 + 2600 * filter, 0.6);
  const phases = chord.flatMap(() => [rand() * 6, rand() * 6]);
  mix(start, length, (s) => {
    const env = Math.min(1, s / 0.35) * Math.min(1, (length - s) / 0.6);
    let v = 0;
    chord.forEach((note, i) => {
      for (const [k, detune] of [[0, -0.07], [1, 0.07]]) {
        const p = (phases[i * 2 + k] += (2 * Math.PI * midi(note + detune)) / RATE);
        v += Math.sin(p) + 0.35 * Math.sin(2 * p) + 0.15 * Math.sin(3 * p);
      }
    });
    return lp2.run(lp.run(v)) * env * gain * 0.022;
  }, 1, 0);
}
function bass(bar, gain) {
  const root = ROOTS[bar % 4];
  for (let step = 0; step < 8; step++) {
    if (step % 2 === 0) continue; // off-beat eighths: classic pumping house bass
    const time = bar * 4 * BEAT + step * (BEAT / 2);
    let phase = 0;
    const lp = new Biquad("lp", 420, 0.9);
    mix(time, BEAT / 2, (s) => {
      phase += (2 * Math.PI * midi(root)) / RATE;
      const saw = ((phase / Math.PI) % 2) - 1;
      return lp.run(Math.sin(phase) * 0.8 + saw * 0.3) * Math.min(1, s / 0.004) * Math.exp(-s * 5) * gain;
    }, 0.42);
  }
}

// ---------------------------------------------------------------- sound effects
const SFX = {
  whoosh(time, gain) {
    const bp = new Biquad("bp", 400, 1.4), length = 0.55;
    mix(time - 0.05, length, (s) => {
      const p = s / length;
      bp.set(300 + 3200 * p * p);
      return bp.run(noise()) * Math.sin(Math.PI * p) ** 1.5 * gain * 1.4;
    }, 0.5, 0.2);
  },
  click(time, gain) {
    mix(time, 0.05, (s) => (Math.sin(2 * Math.PI * 2600 * s) * Math.exp(-s * 160) + noise() * Math.exp(-s * 400) * 0.4) * gain, 0.4, -0.2);
  },
  pop(time, gain) {
    let phase = 0;
    mix(time, 0.12, (s) => {
      phase += (2 * Math.PI * (620 + 520 * Math.min(1, s / 0.03))) / RATE;
      return Math.sin(phase) * Math.exp(-s * 38) * gain;
    }, 0.32, 0.1);
  },
  check(time, gain) {
    SFX.pop(time, gain);
    let phase = 0;
    mix(time + 0.06, 0.18, (s) => { phase += (2 * Math.PI * 1567) / RATE; return Math.sin(phase) * Math.exp(-s * 22) * gain; }, 0.16, -0.1);
  },
  type(time, gain) {
    const hp = new Biquad("hp", 2400, 0.7);
    mix(time, 0.05, (s) => hp.run(noise()) * Math.exp(-s * 120) * gain, 0.28, 0);
  },
  tick(time, gain) {
    const bp = new Biquad("bp", 3800, 2);
    mix(time, 0.03, (s) => bp.run(noise()) * Math.exp(-s * 200) * gain, 0.5, 0.05);
  },
  riser(time) {
    const length = 4 * BEAT, bp = new Biquad("bp", 300, 2);
    let phase = 0;
    mix(time, length, (s) => {
      const p = s / length;
      bp.set(300 + 5000 * p * p);
      phase += (2 * Math.PI * (220 + 660 * p * p)) / RATE;
      return (bp.run(noise()) * 0.8 + Math.sin(phase) * 0.12) * p * p;
    }, 0.42, 0);
  },
  impact(time, gain) {
    kick(time, 1.2 * gain);
    const lp = new Biquad("lp", 5000, 0.5);
    mix(time, 2.2, (s) => lp.run(noise()) * Math.exp(-s * 2.4) * 0.35 * gain, 0.6, 0);
    let phase = 0;
    mix(time, 1.6, (s) => { phase += (2 * Math.PI * 55) / RATE; return Math.sin(phase) * Math.exp(-s * 2) * 0.6 * gain; }, 0.7, 0);
  },
};

// ---------------------------------------------------------------- arrangement
for (let bar = 0; bar < BARS; bar++) {
  const part = arrangement(bar);
  if (part.pad) pad(bar, part.pad, part.filter);
  if (part.bass) bass(bar, part.bass);
  for (let beat = 0; beat < 4; beat++) {
    const time = (bar * 4 + beat) * BEAT;
    if (part.kick) kick(time, part.kick);
    if (part.hats) { hat(time + BEAT / 2, part.hats, beat === 3); if (bar >= 2) hat(time + BEAT * 0.75, part.hats * 0.45); }
    if (part.clap && (beat === 1 || beat === 3)) clap(time, part.clap);
  }
}
for (const cue of cues()) (SFX[cue.type] ?? (() => { throw new Error(`No sound for cue ${cue.type}`); }))(cue.time, cue.gain);

// Sidechain-style duck of everything except the kick region already mixed is skipped for simplicity; instead a gentle
// glue compressor, soft clip and a short fade out finish the master.
let env = 0;
for (let i = 0; i < N; i++) {
  const level = Math.max(Math.abs(L[i]), Math.abs(R[i]));
  env = level > env ? level : env * 0.9995 + level * 0.0005;
  const gain = env > 0.6 ? 0.6 / env + (1 - 0.6 / env) * 0.4 : 1;
  L[i] = Math.tanh(L[i] * gain * 1.1);
  R[i] = Math.tanh(R[i] * gain * 1.1);
}
const fade = at(0.6);
for (let i = 0; i < fade; i++) { const g = i / fade; L[N - 1 - i] *= g; R[N - 1 - i] *= g; }
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const norm = 10 ** (-1 / 20) / peak;

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "build", "audio.wav");
fs.mkdirSync(path.dirname(out), { recursive: true });
const data = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * norm)) * 32767), i * 4);
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * norm)) * 32767), i * 4 + 2);
}
const header = Buffer.alloc(44);
header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8); header.write("fmt ", 12);
header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(data.length, 40);
fs.writeFileSync(out, Buffer.concat([header, data]));
console.log(`audio: ${DURATION}s, ${cues().length} cues, peak normalised to -1 dBFS -> ${path.relative(process.cwd(), out)}`);
