import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildApp } from "../src/app.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "report-contract-"));
const { app } = buildApp({ dbPath: path.join(dir, "db.sqlite"), apiKeys: ["contract"] });
const auth = { "x-api-key": "contract" };
const rows = Array.from({ length: 2000 }, (_, index) => ({ id: index, amount: index === 1999 ? "not a number" : index }));
const report = (onMismatch?: "error") => ({
  schemaVersion: "1.0", id: "contract", name: "Contract",
  datasets: [{ id: "orders", source: "inline", query: { data: rows }, schema: { kind: "array", fields: [{ path: "id", kind: "number" }, { path: "amount", kind: "number" }], ...(onMismatch ? { onMismatch } : {}) } }],
  sections: [{ type: "detail", children: [{ type: "text", value: "Totals" }] }],
});

beforeAll(async () => { await app.ready(); });
afterAll(async () => { await app.close(); fs.rmSync(dir, { recursive: true, force: true }); });

describe("declared dataset contracts through the render API", () => {
  it("renders with a warning that names the row found anywhere in the full response", async () => {
    const response = await app.inject({ method: "POST", url: "/api/v1/render", headers: auth, payload: { report: report(), format: "html" } });
    expect(response.statusCode).toBe(200);
    expect(Number(response.headers["x-render-warnings"])).toBeGreaterThanOrEqual(1);
    const analysis = await app.inject({ method: "POST", url: "/api/v1/analyze", headers: auth, payload: { report: report() } });
    const warning = analysis.json().warnings.find((w: { code: string }) => w.code === "DATASET_SHAPE_MISMATCH");
    expect(warning.message).toContain("amount: expected number, got string at row 2000");
    expect(warning.message).toContain("checked 2000 of 2000 rows");
  });

  it("refuses to render when the contract is strict", async () => {
    const response = await app.inject({ method: "POST", url: "/api/v1/render", headers: auth, payload: { report: report("error"), format: "pdf" } });
    expect(response.statusCode).toBe(422);
    expect(response.payload).toContain("DATASET_SHAPE_MISMATCH");
    expect(response.payload).toContain("row 2000");
  });
});
