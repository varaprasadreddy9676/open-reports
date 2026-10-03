import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "report-font-preview-"));
const fixture = fileURLToPath(new URL("../../../packages/renderer-pdf/tests/fixtures/fonts/NotoSansTelugu-Regular.ttf", import.meta.url));
fs.copyFileSync(fixture, path.join(dir, "NotoSansTelugu-Regular.ttf"));
const priorFontsDir = process.env.FONTS_DIR;
process.env.FONTS_DIR = dir;
const { app } = buildApp({ dbPath: path.join(dir, "db.sqlite"), apiKeys: ["font-test"] });

beforeAll(async () => { await app.ready(); });
afterAll(async () => {
  await app.close();
  if (priorFontsDir === undefined) delete process.env.FONTS_DIR;
  else process.env.FONTS_DIR = priorFontsDir;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("PDF font preview", () => {
  it("lists and serves exactly the discovered face with authentication", async () => {
    const auth = { "x-api-key": "font-test" };
    const caps = await app.inject({ url: "/api/v1/capabilities", headers: auth });
    expect(caps.json().fontFaces["Noto Sans Telugu"]).toContain("regular");
    const url = "/api/v1/resources/font?family=Noto%20Sans%20Telugu&variant=regular";
    expect((await app.inject({ url })).statusCode).toBe(401);
    const font = await app.inject({ url, headers: auth });
    expect(font.statusCode).toBe(200);
    expect(font.headers["content-type"]).toContain("font/ttf");
    expect(font.rawPayload.equals(fs.readFileSync(fixture))).toBe(true);
    const unknown = await app.inject({ url: "/api/v1/resources/font?family=..%2F..%2Fsecret&variant=regular", headers: auth });
    expect(unknown.statusCode).toBe(404);
  });
});
