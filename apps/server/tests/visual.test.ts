import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { buildApp } from "../src/app.js";
import type { FastifyInstance } from "fastify";

/**
 * Visual regression: first page of each sample report is rasterised (pdftoppm, 60 dpi) and compared with a committed baseline.
 * Fails when more than 0.6% of pixels differ. Refresh intentionally changed output with:  UPDATE_BASELINES=1 pnpm test visual
 * Skipped automatically where poppler-utils is not installed.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const examplesDir = path.resolve(here, "../../../examples");
const baselineDir = path.join(here, "visual-baselines");
const failDir = path.resolve(here, "../../../test-output/visual-diff");
const hasPoppler = spawnSync("pdftoppm", ["-v"]).status !== null;
const NAMES = ["invoice", "receipt", "account-statement", "lab-report", "specimen-label", "multilingual", "charts", "pharmacy-label", "discharge-summary", "sticker-sheet"];
const THRESHOLD = 0.006;

let app: FastifyInstance;
beforeAll(async () => {
  ({ app } = buildApp({ dbPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vr-")), "db.sqlite") }));
  await app.ready();
});
afterAll(() => app.close());

function rasterise(pdf: Buffer): PNG {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vrp-"));
  fs.writeFileSync(path.join(dir, "in.pdf"), pdf);
  execFileSync("pdftoppm", ["-r", "60", "-png", "-f", "1", "-l", "1", path.join(dir, "in.pdf"), path.join(dir, "out")]);
  const file = fs.readdirSync(dir).find((f) => f.startsWith("out") && f.endsWith(".png"))!;
  return PNG.sync.read(fs.readFileSync(path.join(dir, file)));
}

function diffRatio(a: PNG, b: PNG): { ratio: number; diff?: PNG } {
  if (a.width !== b.width || a.height !== b.height) return { ratio: 1 };
  const diff = new PNG({ width: a.width, height: a.height });
  let bad = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.abs(a.data[i]! - b.data[i]!) + Math.abs(a.data[i + 1]! - b.data[i + 1]!) + Math.abs(a.data[i + 2]! - b.data[i + 2]!);
    const differs = d > 60;
    if (differs) bad++;
    diff.data[i] = differs ? 255 : b.data[i]!;
    diff.data[i + 1] = differs ? 0 : b.data[i + 1]!;
    diff.data[i + 2] = differs ? 0 : b.data[i + 2]!;
    diff.data[i + 3] = 255;
  }
  return { ratio: bad / (a.width * a.height), diff };
}

describe.skipIf(!hasPoppler)("visual regression", () => {
  for (const name of NAMES) {
    it(`${name}: first page matches the baseline`, async () => {
      const report = JSON.parse(fs.readFileSync(path.join(examplesDir, `${name}.report.json`), "utf-8"));
      const res = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report, format: "pdf" } });
      expect(res.statusCode).toBe(200);
      const png = rasterise(res.rawPayload);
      const baseline = path.join(baselineDir, `${name}.png`);
      if (process.env.UPDATE_BASELINES || !fs.existsSync(baseline)) {
        fs.mkdirSync(baselineDir, { recursive: true });
        fs.writeFileSync(baseline, PNG.sync.write(png));
        return;
      }
      const { ratio, diff } = diffRatio(png, PNG.sync.read(fs.readFileSync(baseline)));
      if (ratio > THRESHOLD) {
        fs.mkdirSync(failDir, { recursive: true });
        fs.writeFileSync(path.join(failDir, `${name}.actual.png`), PNG.sync.write(png));
        if (diff) fs.writeFileSync(path.join(failDir, `${name}.diff.png`), PNG.sync.write(diff));
      }
      expect(ratio, `${(ratio * 100).toFixed(2)}% of pixels differ - see test-output/visual-diff/${name}.diff.png`).toBeLessThanOrEqual(THRESHOLD);
    });
  }
});
