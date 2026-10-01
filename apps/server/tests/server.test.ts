import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildApp } from "../src/app.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
let dbPath: string;

const invoiceReport = {
  schemaVersion: "1.0",
  id: "invoice",
  name: "Invoice",
  parameters: [{ id: "invoiceId", type: "number", required: false }],
  datasets: [{ id: "items", source: "inline", query: { data: [{ description: "Widget", quantity: 2, price: 500 }] } }],
  sections: [
    {
      type: "detail",
      children: [
        {
          type: "table",
          dataset: "items",
          columns: [
            { id: "description", header: "Description", binding: "row.description" },
            { id: "amount", header: "Amount", expression: "row.quantity * row.price", format: "currency" },
          ],
        },
      ],
    },
  ],
};

beforeAll(async () => {
  dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "reporting-server-")), "db.sqlite");
  ({ app } = buildApp({ dbPath, apiKeys: [] }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("GET /health", () => {
  it("responds ok", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });
});

describe("POST /api/v1/validate", () => {
  it("validates a well-formed report", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/validate", payload: { report: invoiceReport } });
    expect(res.statusCode).toBe(200);
    expect(res.json().valid).toBe(true);
  });

  it("reports schema errors for a malformed report", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/validate", payload: { report: { schemaVersion: "1.0" } } });
    expect(res.statusCode).toBe(200);
    expect(res.json().valid).toBe(false);
  });

  it("reports an unknown dataset reference", async () => {
    const bad = { ...invoiceReport, sections: [{ type: "detail", children: [{ type: "table", dataset: "nope", columns: [] }] }] };
    const res = await app.inject({ method: "POST", url: "/api/v1/validate", payload: { report: bad } });
    expect(res.json().valid).toBe(false);
    expect(res.json().issues.some((i: any) => i.code === "UNKNOWN_DATASET")).toBe(true);
  });
});

describe("POST /api/v1/render (inline)", () => {
  it("renders PDF", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report: invoiceReport, format: "pdf" } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    expect(res.headers["x-render-id"]).toBeTruthy();
  });

  it("renders HTML", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report: invoiceReport, format: "html" } });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain("<!doctype html>");
    expect(res.payload).toContain("Widget");
  });

  it("renders XLSX", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report: invoiceReport, format: "xlsx" } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
  });

  it("renders CSV", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report: invoiceReport, format: "csv" } });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain("Widget,1000");
  });

  it("rejects an unsupported format", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report: invoiceReport, format: "docx" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("UNSUPPORTED_FORMAT");
  });

  it("rejects an invalid report with a structured error", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report: { nope: true }, format: "pdf" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_REPORT");
  });

  it("supports inline `data` without pre-declared datasets", async () => {
    const adHoc = {
      schemaVersion: "1.0",
      id: "adhoc",
      name: "Adhoc",
      sections: [{ type: "detail", children: [{ type: "text", binding: "data.greeting.message" }] }],
    };
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/render",
      payload: { report: adHoc, format: "html", data: { greeting: { message: "Hello inline" } } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain("Hello inline");
  });
});

describe("Templates: CRUD, versioning, publish, render", () => {
  it("creates a template (version 1, draft) and can fetch it", async () => {
    const create = await app.inject({ method: "POST", url: "/api/v1/templates", payload: { id: "invoice-tpl", name: "Invoice", definition: invoiceReport } });
    expect(create.statusCode).toBe(201);
    expect(create.json().currentVersion).toBe(1);
    expect(create.json().status).toBe("draft");

    const get = await app.inject({ method: "GET", url: "/api/v1/templates/invoice-tpl" });
    expect(get.statusCode).toBe(200);
    expect(get.json().name).toBe("Invoice");
  });

  it("refuses to create a template with a duplicate id", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/templates", payload: { id: "invoice-tpl", name: "Dup", definition: invoiceReport } });
    expect(res.statusCode).toBe(409);
  });

  it("cannot render a template render before any version is published", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/templates/invoice-tpl/render", payload: { format: "pdf" } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NO_RENDERABLE_VERSION");
  });

  it("publishes version 1 and can then render the template by id", async () => {
    const publish = await app.inject({ method: "POST", url: "/api/v1/templates/invoice-tpl/versions/1/publish" });
    expect(publish.statusCode).toBe(200);
    expect(publish.json().status).toBe("published");

    const render = await app.inject({ method: "POST", url: "/api/v1/templates/invoice-tpl/render", payload: { format: "pdf" } });
    expect(render.statusCode).toBe(200);
    expect(render.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("creates version 2 via PUT without affecting the published version 1", async () => {
    const v2Report = { ...invoiceReport, name: "Invoice v2" };
    const update = await app.inject({ method: "PUT", url: "/api/v1/templates/invoice-tpl", payload: { definition: v2Report } });
    expect(update.statusCode).toBe(200);
    expect(update.json().currentVersion).toBe(2);

    const versions = await app.inject({ method: "GET", url: "/api/v1/templates/invoice-tpl/versions" });
    expect(versions.json()).toHaveLength(2);

    // Rendering with no explicit version still uses the published v1, not the new draft v2.
    const v1 = await app.inject({ method: "GET", url: "/api/v1/templates/invoice-tpl/versions/1" });
    expect(v1.json().status).toBe("published");
    const v2 = await app.inject({ method: "GET", url: "/api/v1/templates/invoice-tpl/versions/2" });
    expect(v2.json().status).toBe("draft");
  });

  it("can render a specific (draft) version explicitly", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/templates/invoice-tpl/render", payload: { format: "html", version: 2 } });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain("Widget");
  });

  it("404s for a template that doesn't exist", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/templates/does-not-exist" });
    expect(res.statusCode).toBe(404);
  });

  it("lists templates", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/templates" });
    expect(res.statusCode).toBe(200);
    expect(res.json().some((t: any) => t.id === "invoice-tpl")).toBe(true);
  });

  it("deletes a template", async () => {
    await app.inject({ method: "POST", url: "/api/v1/templates", payload: { id: "throwaway", name: "T", definition: invoiceReport } });
    const del = await app.inject({ method: "DELETE", url: "/api/v1/templates/throwaway" });
    expect(del.statusCode).toBe(204);
    const get = await app.inject({ method: "GET", url: "/api/v1/templates/throwaway" });
    expect(get.statusCode).toBe(404);
  });
});

describe("Async render jobs", () => {
  it("enqueues a job and it eventually completes with a downloadable output", async () => {
    const enqueue = await app.inject({ method: "POST", url: "/api/v1/render/jobs", payload: { report: invoiceReport, format: "pdf" } });
    expect(enqueue.statusCode).toBe(202);
    const { jobId } = enqueue.json();
    expect(jobId).toBeTruthy();

    let status = "queued";
    for (let i = 0; i < 50 && status !== "completed" && status !== "failed"; i++) {
      await new Promise((r) => setTimeout(r, 20));
      const poll = await app.inject({ method: "GET", url: `/api/v1/render/jobs/${jobId}` });
      status = poll.json().status;
    }
    expect(status).toBe("completed");

    const output = await app.inject({ method: "GET", url: `/api/v1/render/jobs/${jobId}/output` });
    expect(output.statusCode).toBe(200);
    expect(output.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("404s for an unknown job id", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/render/jobs/does-not-exist" });
    expect(res.statusCode).toBe(404);
  });

  it("can cancel a job", async () => {
    const enqueue = await app.inject({ method: "POST", url: "/api/v1/render/jobs", payload: { report: invoiceReport, format: "pdf" } });
    const { jobId } = enqueue.json();
    const cancel = await app.inject({ method: "DELETE", url: `/api/v1/render/jobs/${jobId}` });
    expect([200, 409]).toContain(cancel.statusCode); // may already be done if it ran before we cancelled
  });
});

describe("API key authentication", () => {
  let authedApp: FastifyInstance;
  let authedDbPath: string;

  beforeEach(async () => {
    authedDbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "reporting-server-auth-")), "db.sqlite");
    ({ app: authedApp } = buildApp({ dbPath: authedDbPath, apiKeys: ["secret-key"] }));
    await authedApp.ready();
  });

  it("rejects requests with no API key", async () => {
    const res = await authedApp.inject({ method: "GET", url: "/api/v1/templates" });
    expect(res.statusCode).toBe(401);
    await authedApp.close();
  });

  it("rejects requests with a wrong API key", async () => {
    const res = await authedApp.inject({ method: "GET", url: "/api/v1/templates", headers: { "x-api-key": "wrong" } });
    expect(res.statusCode).toBe(401);
    await authedApp.close();
  });

  it("accepts requests with a valid API key via X-API-Key", async () => {
    const res = await authedApp.inject({ method: "GET", url: "/api/v1/templates", headers: { "x-api-key": "secret-key" } });
    expect(res.statusCode).toBe(200);
    await authedApp.close();
  });

  it("accepts requests with a valid API key via Authorization: Bearer", async () => {
    const res = await authedApp.inject({ method: "GET", url: "/api/v1/templates", headers: { authorization: "Bearer secret-key" } });
    expect(res.statusCode).toBe(200);
    await authedApp.close();
  });

  it("/health is exempt from auth", async () => {
    const res = await authedApp.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    await authedApp.close();
  });
});

describe("POST /api/v1/datasets/test", () => {
  it("executes an inline dataset and returns a preview", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/datasets/test",
      payload: { dataset: { id: "d", source: "inline", query: { data: [{ a: 1 }, { a: 2 }] } } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    expect(res.json().rowCount).toBe(2);
  });

  it("reports a failing dataset (SQL with no connection) without crashing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/datasets/test",
      payload: { dataset: { id: "d", source: "sql", query: { connectionId: "x", sql: "select 1" } } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(false);
  });
});

describe("capabilities, schema, blocks and ZPL", () => {
  it("exposes renderer capabilities and available fonts", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/capabilities" });
    expect(res.statusCode).toBe(200);
    expect(res.json().formats.map((f: any) => f.id)).toEqual(expect.arrayContaining(["pdf", "html", "xlsx", "csv", "zpl"]));
    expect(Array.isArray(res.json().fonts)).toBe(true);
  });

  it("serves the JSON Schema without authentication", async () => {
    const { app: locked } = buildApp({ dbPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "schema-")), "db.sqlite"), apiKeys: ["k"] });
    const res = await locked.inject({ method: "GET", url: "/api/v1/schema" });
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.json())).toContain("schemaVersion");
    await locked.close();
  });

  it("stores reusable blocks", async () => {
    const put = await app.inject({ method: "PUT", url: "/api/v1/blocks/hospital-header", payload: { name: "Hospital header", children: [{ type: "text", value: "ACME" }] } });
    expect(put.statusCode).toBe(204);
    const list = await app.inject({ method: "GET", url: "/api/v1/blocks" });
    expect(list.json().find((b: any) => b.id === "hospital-header").children[0].value).toBe("ACME");
    await app.inject({ method: "DELETE", url: "/api/v1/blocks/hospital-header" });
    expect((await app.inject({ method: "GET", url: "/api/v1/blocks" })).json().some((b: any) => b.id === "hospital-header")).toBe(false);
  });

  it("renders a label as ZPL", async () => {
    const label = {
      schemaVersion: "1.0", id: "l", name: "L", print: { dpi: 203 },
      page: { size: "custom", width: 40, height: 25, unit: "mm", orientation: "landscape", margin: { top: 1, right: 1, bottom: 1, left: 1 } },
      sections: [{ type: "detail", children: [{ type: "text", value: "Hello" }, { type: "barcode", value: "12345" }] }],
    };
    const res = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report: label, format: "zpl" } });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain("^XA");
    expect(res.payload).toContain("^PW320");
  });
});

describe("analyze", () => {
  it("returns page count, decisions and warnings without rendering", async () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({ n: i }));
    const report = {
      schemaVersion: "1.0", id: "a", name: "a",
      datasets: [{ id: "d", source: "inline", query: { data: rows } }],
      sections: [{ type: "detail", children: [{ type: "table", dataset: "d", repeatHeaderOnPageBreak: true, columns: [{ id: "n", header: "N", binding: "row.n" }] }] }],
    };
    const res = await app.inject({ method: "POST", url: "/api/v1/analyze", payload: { report } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toBe(true);
    expect(body.pageCount).toBeGreaterThan(1);
    expect(body.decisions.some((d: any) => d.kind === "table-split")).toBe(true);
  });

  it("reports schema problems with paths instead of failing", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/analyze", payload: { report: { schemaVersion: "1.0", id: "x" } } });
    expect(res.json()).toMatchObject({ valid: false, stage: "schema" });
  });
});

describe("ESC/POS output", () => {
  it("renders a receipt as printer bytes (reset, text, cut)", async () => {
    const report = { schemaVersion: "1.0", id: "e", name: "e", page: { size: "custom", width: 80, height: 200, unit: "mm" }, sections: [{ type: "detail", children: [{ type: "text", value: "HELLO PRINTER" }] }] };
    const res = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report, format: "escpos" } });
    expect(res.statusCode).toBe(200);
    expect([...res.rawPayload.subarray(0, 2)]).toEqual([0x1b, 0x40]);
    expect(res.rawPayload.includes(Buffer.from("HELLO PRINTER"))).toBe(true);
    const caps = (await app.inject({ url: "/api/v1/capabilities" })).json();
    expect(caps.formats.some((f: any) => f.id === "escpos")).toBe(true);
  });
});
