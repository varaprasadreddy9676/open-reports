import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.js";
import type { FastifyInstance } from "fastify";

const here = path.dirname(fileURLToPath(import.meta.url));
const examplesDir = path.resolve(here, "../../../examples");
const outDir = path.resolve(here, "../../../test-output");
const files = fs.readdirSync(examplesDir).filter((f) => f.endsWith(".report.json"));

let app: FastifyInstance;
beforeAll(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  ({ app } = buildApp({ dbPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ex-")), "db.sqlite") }));
  await app.ready();
});
afterAll(() => app.close());

describe("sample reports render in every format", () => {
  it("has the ten required samples (plus label and lab report)", () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  for (const file of files) {
    const name = file.replace(".report.json", "");
    const report = JSON.parse(fs.readFileSync(path.join(examplesDir, file), "utf-8"));

    it(`${name}: validates cleanly`, async () => {
      const res = await app.inject({ method: "POST", url: "/api/v1/validate", payload: { report } });
      expect(res.json().issues.filter((i: any) => i.severity === "error")).toEqual([]);
    });

    for (const format of ["pdf", "html"] as const) {
      it(`${name}: renders ${format}`, async () => {
        const res = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report, format } });
        expect(res.statusCode, res.payload.slice(0, 400)).toBe(200);
        fs.writeFileSync(path.join(outDir, `${name}.${format}`), res.rawPayload);
        if (format === "pdf") expect(res.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
      });
    }

    const hasTable = JSON.stringify(report).includes('"type":"table"') || JSON.stringify(report).includes('"type": "table"');
    if (hasTable) {
      for (const format of ["xlsx", "csv"] as const) {
        it(`${name}: renders ${format}`, async () => {
          const res = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report, format } });
          expect(res.statusCode, res.payload.slice(0, 400)).toBe(200);
          fs.writeFileSync(path.join(outDir, `${name}.${format}`), res.rawPayload);
        });
      }
    }
  }
});
