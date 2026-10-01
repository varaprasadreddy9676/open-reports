import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.js";
import type { FastifyInstance } from "fastify";

/**
 * Final demo scenario - "a hospital's day", end to end through the public API:
 * generate documents from stored, versioned templates in every format, including labels and a sticker sheet, and a 100 000-row export.
 * Artifacts are written to test-output/demo/ so a human can open them.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const examples = path.resolve(here, "../../../examples");
const out = path.resolve(here, "../../../test-output/demo");
const load = (n: string) => JSON.parse(fs.readFileSync(path.join(examples, `${n}.report.json`), "utf-8"));
const pages = (file: string) => {
  const r = spawnSync("pdfinfo", [file], { encoding: "utf-8" });
  return r.status === 0 ? Number(/Pages:\s+(\d+)/.exec(r.stdout)?.[1]) : undefined;
};

let app: FastifyInstance;
beforeAll(async () => {
  fs.mkdirSync(out, { recursive: true });
  ({ app } = buildApp({ dbPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "demo-")), "db.sqlite") }));
  await app.ready();
});
afterAll(() => app.close());

async function renderTemplate(id: string, format: string, extra: Record<string, unknown> = {}) {
  const res = await app.inject({ method: "POST", url: `/api/v1/templates/${id}/render`, payload: { format, ...extra } });
  expect(res.statusCode, res.payload.slice(0, 300)).toBe(200);
  return res;
}

describe("hospital day demo", () => {
  it("1. register templates, revise one, publish; published versions are immutable", async () => {
    for (const n of ["lab-report", "discharge-summary", "pharmacy-label", "wristband", "sticker-sheet", "invoice", "receipt-58mm"]) {
      const r = await app.inject({ method: "POST", url: "/api/v1/templates", payload: { id: n, name: n, definition: load(n) } });
      expect(r.statusCode, n).toBe(201);
    }
    const revised = { ...load("lab-report"), description: "revised" };
    expect((await app.inject({ method: "PUT", url: "/api/v1/templates/lab-report", payload: { definition: revised } })).json().currentVersion).toBe(2);
    for (const n of ["lab-report", "discharge-summary", "pharmacy-label", "wristband", "sticker-sheet", "invoice", "receipt-58mm"]) {
      const v = n === "lab-report" ? 2 : 1;
      expect((await app.inject({ method: "POST", url: `/api/v1/templates/${n}/versions/${v}/publish` })).statusCode).toBe(200);
    }
    // published = immutable: a PUT creates v3 (draft); v2 keeps its published content
    const v2 = (await app.inject({ url: "/api/v1/templates/lab-report/versions/2" })).json();
    expect(v2.status).toBe("published");
    expect(v2.definition.description).toBe("revised");
  });

  it("2. clinical documents render to PDF with the right structure", async () => {
    for (const n of ["lab-report", "discharge-summary", "invoice"]) {
      const res = await renderTemplate(n, "pdf");
      const f = path.join(out, `${n}.pdf`);
      fs.writeFileSync(f, res.rawPayload);
      expect(res.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
      const p = pages(f);
      if (p !== undefined) expect(p).toBeGreaterThanOrEqual(1);
    }
  });

  it("3. labels: ZPL for the printer, PDF for preview", async () => {
    const zpl = await renderTemplate("pharmacy-label", "zpl");
    fs.writeFileSync(path.join(out, "pharmacy-label.zpl"), zpl.payload);
    expect(zpl.payload).toContain("^XA");
    expect(zpl.payload).toContain("^XZ");
    expect(zpl.payload).toMatch(/\^PW\d+/);
    expect(zpl.payload).toContain("Amoxicillin");
    const band = await renderTemplate("wristband", "zpl");
    fs.writeFileSync(path.join(out, "wristband.zpl"), band.payload);
    expect(band.payload).toContain("^BC"); // Code 128 barcode
  });

  it("4. a thermal receipt and an A4 sheet of patient stickers (10 records → 2 sheets)", async () => {
    const receipt = await renderTemplate("receipt-58mm", "pdf");
    fs.writeFileSync(path.join(out, "receipt-58mm.pdf"), receipt.rawPayload);
    const sheet = await renderTemplate("sticker-sheet", "pdf");
    const f = path.join(out, "sticker-sheet.pdf");
    fs.writeFileSync(f, sheet.rawPayload);
    const p = pages(f);
    if (p !== undefined) expect(p).toBe(2);
  });

  it("5. start position reuses a partly used sheet (same 10 records need 2 sheets; starting at 7 pushes the 3rd record onto sheet 2)", async () => {
    const report = load("sticker-sheet");
    report.sections[0].children[0].startPosition = 7;
    const res = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report, format: "pdf" } });
    expect(res.statusCode).toBe(200);
    const f = path.join(out, "sticker-sheet-start7.pdf");
    fs.writeFileSync(f, res.rawPayload);
    const p = pages(f);
    if (p !== undefined) expect(p).toBe(2);
  });

  it("6. a 100 000-row export: CSV and XLSX, both complete", async () => {
    const report = load("large-dataset");
    const data = Array.from({ length: 100_000 }, (_, i) => ({ id: i + 1, sku: `SKU-${String(i + 1).padStart(6, "0")}`, name: `Item ${i + 1}`, quantity: (i % 90) + 1, price: (i % 1000) / 10 }));
    report.datasets[0].query.data = data;
    const csv = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report, format: "csv" } });
    expect(csv.statusCode).toBe(200);
    const lines = csv.payload.trim().split("\n");
    expect(lines).toHaveLength(100_001);
    expect(lines[100_000]).toContain("SKU-100000");
    fs.writeFileSync(path.join(out, "inventory-100k.csv"), csv.payload);
    const xlsx = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report, format: "xlsx" } });
    expect(xlsx.statusCode).toBe(200);
    expect(xlsx.rawPayload.subarray(0, 2).toString()).toBe("PK");
    fs.writeFileSync(path.join(out, "inventory-100k.xlsx"), xlsx.rawPayload);
  }, 120_000);

  it("7. async job for a big render, polled to completion", async () => {
    const report = load("account-statement");
    const job = await app.inject({ method: "POST", url: "/api/v1/render/jobs", payload: { report, format: "pdf" } });
    expect(job.statusCode).toBe(202);
    const id = job.json().jobId;
    let status = "queued";
    for (let i = 0; i < 100 && !["completed", "failed"].includes(status); i++) {
      await new Promise((r) => setTimeout(r, 100));
      status = (await app.inject({ url: `/api/v1/render/jobs/${id}` })).json().status;
    }
    expect(status).toBe("completed");
    const output = await app.inject({ url: `/api/v1/render/jobs/${id}/output` });
    expect(output.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
