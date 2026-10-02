import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import http from "node:http";
import { PNG } from "pngjs";
import { buildApp } from "../src/app.js";
import { readImageSource } from "../src/linked-images.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "report-images-"));
const imagePath = path.join(dir, "logo.png");
const { app } = buildApp({ dbPath: path.join(dir, "db.sqlite"), apiKeys: ["image-test"], imageAllowedHosts: ["127.0.0.1"] });
const auth = { "x-api-key": "image-test" };
const report = (src: string) => ({
  schemaVersion: "1.0", id: "linked-image", name: "Linked image",
  sections: [{ type: "pageHeader", children: [{ type: "image", id: "logo", src, width: "20mm", height: "20mm" }] }, { type: "detail", children: [{ type: "text", value: "Hello" }] }],
});

function png(color: [number, number, number]): Buffer {
  const image = new PNG({ width: 2, height: 2 });
  for (let i = 0; i < image.data.length; i += 4) image.data.set([...color, 255], i);
  return PNG.sync.write(image);
}

beforeAll(async () => { await app.ready(); });
afterAll(async () => { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); });

describe("linked image sources", () => {
  it("keeps a saved file path and reads replacement bytes on the next render", async () => {
    const first = png([255, 0, 0]);
    const second = png([0, 0, 255]);
    fs.writeFileSync(imagePath, first);
    const created = await app.inject({ method: "POST", url: "/api/v1/templates", headers: auth, payload: { id: "logo-template", name: "Logo", definition: report(imagePath) } });
    expect(created.statusCode).toBe(201);
    const render = () => app.inject({ method: "POST", url: "/api/v1/templates/logo-template/render", headers: auth, payload: { format: "html", version: 1 } });
    const before = await render();
    expect(before.statusCode).toBe(200);
    expect(before.payload).toContain(first.toString("base64"));
    fs.writeFileSync(imagePath, second);
    const after = await render();
    expect(after.statusCode).toBe(200);
    expect(after.payload).toContain(second.toString("base64"));
    expect(after.payload).not.toContain(first.toString("base64"));
    expect(await readImageSource(pathToFileURL(imagePath).toString())).toContain(second.toString("base64"));
    const saved = await app.inject({ url: "/api/v1/templates/logo-template/versions/1", headers: auth });
    expect(saved.json().definition.sections[0].children[0].src).toBe(imagePath);
    const pdf = await app.inject({ method: "POST", url: "/api/v1/templates/logo-template/render", headers: auth, payload: { format: "pdf", version: 1 } });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    const analysis = await app.inject({ method: "POST", url: "/api/v1/analyze", headers: auth, payload: { report: report(imagePath), includeLayout: true } });
    expect(analysis.statusCode).toBe(200);
    expect(analysis.json().valid).toBe(true);
  });

  it("resolves a server-accessible URL, and blocks local URLs without an explicit allowed host", async () => {
    let bytes = png([1, 2, 3]);
    const server = http.createServer((_req, res) => { res.writeHead(200, { "content-type": "image/png" }); res.end(bytes); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No address");
      const src = `http://127.0.0.1:${address.port}/logo.png`;
      await expect(readImageSource(src)).rejects.toMatchObject({ code: "IMAGE_URL_BLOCKED" });
      const preview = await app.inject({ url: `/api/v1/resources/image?src=${encodeURIComponent(src)}`, headers: auth });
      expect(preview.statusCode).toBe(200);
      expect(preview.json().dataUrl).toContain(bytes.toString("base64"));
      const rendered = await app.inject({ method: "POST", url: "/api/v1/render", headers: auth, payload: { report: report(src), format: "html" } });
      expect(rendered.statusCode).toBe(200);
      expect(rendered.payload).toContain(bytes.toString("base64"));
      bytes = png([3, 2, 1]);
      const updated = await app.inject({ method: "POST", url: "/api/v1/render", headers: auth, payload: { report: report(src), format: "html" } });
      expect(updated.statusCode).toBe(200);
      expect(updated.payload).toContain(bytes.toString("base64"));
      expect(updated.payload).not.toBe(rendered.payload);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("requires authentication and reports an unavailable file clearly", async () => {
    expect((await app.inject({ url: `/api/v1/resources/image?src=${encodeURIComponent(imagePath)}` })).statusCode).toBe(401);
    const missing = await app.inject({ method: "POST", url: "/api/v1/render", headers: auth, payload: { report: report(path.join(dir, "missing.png")), format: "html" } });
    expect(missing.statusCode).toBe(422);
    expect(missing.json().error.code).toBe("IMAGE_FILE_UNAVAILABLE");
  });
});
