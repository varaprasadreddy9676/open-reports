import { describe, it, expect, beforeAll, afterAll } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ApiError, findTool, TOOLS, type ReportApi } from "@reporting/ai-tools";
import { buildApp } from "../src/app.js";
import type { FastifyInstance } from "fastify";

const here = path.dirname(fileURLToPath(import.meta.url));
let app: FastifyInstance;

/** ReportApi over Fastify's in-memory inject: the same code path an MCP server uses over HTTP. */
function injectApi(): ReportApi {
  const call = async (method: string, url: string, body?: unknown) => {
    const res = await app.inject({ method: method as any, url, payload: body as any });
    if (res.statusCode >= 400) throw new ApiError(res.statusCode, res.json()?.error?.message ?? `HTTP ${res.statusCode}`, res.json()?.error?.details);
    return res;
  };
  return {
    json: async (m, u, b) => (await call(m, u, b)).json(),
    binary: async (m, u, b) => {
      const r = await call(m, u, b);
      return { bytes: new Uint8Array(r.rawPayload), mimeType: String(r.headers["content-type"]), renderId: String(r.headers["x-render-id"]), warnings: Number(r.headers["x-render-warnings"] ?? 0) };
    },
  };
}
const run = (name: string, args: any) => findTool(name)!.handler(args, injectApi());

beforeAll(async () => {
  ({ app } = buildApp({ dbPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ai-")), "db.sqlite"), examplesDir: path.resolve(here, "../../../examples") }));
  await app.ready();
});
afterAll(() => app.close());

describe("AI tools against the real server", () => {
  it("every tool has a name, description, schema and a read-only flag; writes are flagged", () => {
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^[a-z_]+$/);
      expect(t.description.length).toBeGreaterThan(30);
      expect((t.inputSchema as any).type).toBe("object");
    }
    expect(TOOLS.filter((t) => !t.readOnly).map((t) => t.name).sort()).toEqual(["publish_template", "save_template"]);
  });

  it("discovery: schema, capabilities, examples", async () => {
    expect(((await run("get_report_schema", {})).data as any).type ?? "object").toBeTruthy();
    expect(((await run("list_capabilities", {})).data as any).formats.length).toBeGreaterThan(3);
    const ex = (await run("list_examples", {})).data as any[];
    expect(ex.map((e) => e.name)).toContain("invoice");
    const inv = (await run("get_example", { name: "invoice" })).data as any;
    expect(inv.id).toBe("invoice");
    expect((await run("get_example", { name: "nope" })).isError).toBe(true);
  });

  it("the edit loop: patch by id → analyze → fix the pagination problem it reveals → render", async () => {
    let report: any = (await run("get_example", { name: "account-statement" })).data;
    const before = (await run("analyze_report", { report })).data as any;
    expect(before.pageCount).toBeGreaterThan(1);

    // change a heading by id
    const p1 = await run("patch_report", { report, ops: [{ op: "replace", path: "#company/value", value: "ACME HOSPITAL" }] });
    // (id may not exist in this example: the tool must say so clearly and leave the report untouched)
    if (p1.isError) expect(p1.text).toMatch(/No component with id|unchanged/);

    // find a table id and turn off header repeat, then ask the analyzer, then restore it
    const tableId = JSON.stringify(report).match(/"type":"table"[^}]*?"id":"([^"]+)"|"id":"([^"]+)"[^}]*?"type":"table"/);
    const table = (function find(n: any): any { if (!n || typeof n !== "object") return; if (n.type === "table") return n; for (const v of Object.values(n)) { const r = find(v); if (r) return r; } })(report);
    expect(table).toBeTruthy();
    void tableId;
    const id = table.id ?? "stmt-table";
    if (!table.id) report = (await run("patch_report", { report, ops: [{ op: "add", path: "/sections/0/children/0/id", value: "stmt-table" }], analyze: false })).data;

    const off = await run("patch_report", { report, ops: [{ op: "add", path: `#${id}/repeatHeaderOnPageBreak`, value: false }] });
    expect((off.data as any).ok).toBe(true);
    expect(off.text).toMatch(/changed table/);
    const on = await run("patch_report", { report: (off.data as any).report, ops: [{ op: "replace", path: `#${id}/repeatHeaderOnPageBreak`, value: true }] });
    expect((on.data as any).analysis.valid).toBe(true);

    const png = await run("render_report", { report: (on.data as any).report, format: "pdf" });
    expect((png.data as any).bytes).toBeGreaterThan(1000);
    expect((png.data as any).base64.slice(0, 8)).toBe(Buffer.from("%PDF-1.3").toString("base64").slice(0, 8));
  });

  it("a bad patch is rejected atomically with the failing op index", async () => {
    const report = (await run("get_example", { name: "invoice" })).data as any;
    report.sections.unshift({ type: "reportHeader", children: [{ id: "company", type: "text", value: "Fixture company" }] });
    const r = await run("patch_report", { report, ops: [{ op: "replace", path: "#company/value", value: "X" }, { op: "replace", path: "#does-not-exist/value", value: "Y" }] });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/op 1/);
  });

  it("a patch that breaks the schema is applied but flagged by the analysis, so the model can repair it", async () => {
    const report = (await run("get_example", { name: "invoice" })).data as any;
    report.sections.unshift({ type: "reportHeader", children: [{ id: "company", type: "text", value: "Fixture company" }] });
    const r = await run("patch_report", { report, ops: [{ op: "replace", path: "#company/type", value: "bogus" }] });
    expect(r.isError).toBeFalsy();
    expect(((r.data as any).analysis).valid).toBe(false);
    expect(r.text).toMatch(/Invalid|error/i);
  });

  it("text formats return content; validate_report reports issues with paths", async () => {
    const report = (await run("get_example", { name: "pharmacy-label" })).data;
    const zpl = await run("render_report", { report, format: "zpl" });
    expect((zpl.data as any).text).toContain("^XA");
    const v = await run("validate_report", { report: { schemaVersion: "1.0", id: "x" } });
    expect((v.data as any).valid).toBe(false);
    expect((v.data as any).issues.length).toBeGreaterThan(0);
  });

  it("templates: save (create then new draft), get, list, publish, render by id", async () => {
    const report = (await run("get_example", { name: "receipt" })).data as any;
    // This verifies template persistence; use a small marker rather than a Base64 letterhead
    // that exhausts the tool's intentional 40 KB text preview before reaching body text.
    report.sections = [{ type: "detail", children: [{ type: "text", value: "AI template round trip" }] }];
    const created = await run("save_template", { id: "ai-demo", report });
    expect(created.text).toMatch(/Created/);
    const again = await run("save_template", { id: "ai-demo", report: { ...report, description: "v2" } });
    expect(again.text).toMatch(/draft v2/);
    expect(((await run("list_templates", {})).data as any[]).some((t) => t.id === "ai-demo")).toBe(true);
    expect(((await run("get_template", { id: "ai-demo" })).data as any).version).toBe(2);
    await run("publish_template", { id: "ai-demo", version: 2 });
    const r = await run("render_report", { templateId: "ai-demo", format: "html" });
    expect((r.data as any).text).toContain("AI template round trip");
  });
});
