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
  it("renders a supplied JRXML-derived child and refuses a missing one", async () => {
    const parent = { schemaVersion: "1.0", id: "parent", name: "Parent", sections: [
      { type: "reportHeader", children: [{ type: "subreport", reportId: "lines", dataset: "params.lineItems", parameters: { label: { expression: "params.label" } } }] },
    ] };
    const child = { schemaVersion: "1.0", id: "lines", name: "Lines",
      parameters: [{ id: "label", type: "string", required: true }],
      datasets: [{ id: "main", source: "inline", query: [] }],
      sections: [{ type: "detail", dataset: "main", children: [{ type: "text", expression: "params.label + row.name" }] }],
    };
    const parameters = { label: "Item: ", lineItems: [{ name: "A" }, { name: "B" }] };
    const missing = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report: parent, format: "html", parameters } });
    expect(missing.statusCode).toBe(422);
    expect(missing.json().error.details.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "SUBREPORT_NOT_RENDERED" })]));
    const rendered = await app.inject({ method: "POST", url: "/api/v1/render", payload: {
      report: parent, format: "html", parameters, subreports: { lines: { report: child } },
    } });
    expect(rendered.statusCode).toBe(200);
    expect(rendered.payload).toContain("Item: A");
    expect(rendered.payload).toContain("Item: B");
    const jrxml = `<jasperReport name="Lines" pageWidth="300" pageHeight="300"><parameter name="label" class="java.lang.String"/><field name="name" class="java.lang.String"/><detail><band height="18"><textField><reportElement x="0" y="0" width="200" height="18"/><textFieldExpression><![CDATA[$P{label} + $F{name}]]></textFieldExpression></textField></band></detail></jasperReport>`;
    const fromSource = await app.inject({ method: "POST", url: "/api/v1/render", payload: {
      report: parent, format: "html", parameters, subreports: { lines: { jrxml } },
    } });
    expect(fromSource.statusCode).toBe(200);
    expect(fromSource.payload).toContain("Item: A");
    expect(fromSource.payload).toContain("Item: B");
  });

  it("renders PDF", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report: invoiceReport, format: "pdf" } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    expect(res.headers["x-render-id"]).toBeTruthy();
  });

  it("rejects silent content loss by default and allows an explicit legacy opt-out", async () => {
    const overflowing = { schemaVersion: "1.0", id: "fixed-overflow", name: "Fixed overflow", sections: [
      { type: "detail", children: [{ type: "text", id: "small-box", value: Array.from({ length: 20 }, (_, index) => `Line ${index}`).join("\n"), width: 140, height: 20 }] },
    ] };
    const blocked = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report: overflowing, format: "pdf" } });
    expect(blocked.statusCode).toBe(422);
    expect(blocked.json().error.code).toBe("REPORT_RENDER_FAILED");
    expect(blocked.json().error.details.warnings).toContainEqual(expect.objectContaining({ code: "TEXT_EXCEEDS_HEIGHT", path: "small-box" }));
    const analyzed = await app.inject({ method: "POST", url: "/api/v1/analyze", payload: { report: overflowing } });
    expect(analyzed.json().valid).toBe(false);
    const allowed = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report: overflowing, format: "pdf", strict: false } });
    expect(allowed.statusCode).toBe(200);
    expect(Number(allowed.headers["x-render-warnings"])).toBeGreaterThan(0);
    const clipped = { ...overflowing, sections: [{ type: "detail", children: [{ ...overflowing.sections[0]!.children[0]!, style: { overflow: "clip" } }] }] };
    const intentional = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report: clipped, format: "pdf" } });
    expect(intentional.statusCode).toBe(200);
  });

  it("rejects a row item past the printable edge and reports the item through analyze", async () => {
    const report = { schemaVersion: "1.0", id: "wide-row", name: "Wide row", sections: [
      { type: "detail", children: [{ type: "container", id: "line", layout: "row", gap: 10, children: [
        { type: "text", id: "first", value: "First", width: 400 },
        { type: "text", id: "second", value: "Second", width: 400 },
      ] }] },
    ] };
    const blocked = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report, format: "pdf" } });
    expect(blocked.statusCode).toBe(422);
    expect(blocked.json().error.details.warnings).toContainEqual(expect.objectContaining({ code: "CONTENT_EXCEEDS_PRINTABLE_WIDTH", path: "second" }));
    const blockedHtml = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report, format: "html" } });
    expect(blockedHtml.statusCode).toBe(422);
    const wrapped = { ...report, sections: [{ type: "detail", children: [{ ...report.sections[0]!.children[0]!, wrap: true }] }] };
    const wrappedPdf = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report: wrapped, format: "pdf" } });
    expect(wrappedPdf.statusCode).toBe(200);
    const wrappedHtml = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report: wrapped, format: "html" } });
    expect(wrappedHtml.statusCode).toBe(200);
    expect(wrappedHtml.payload).toContain("Second");
    const shrunk = { ...report, sections: [{ type: "detail", children: [{ ...report.sections[0]!.children[0]!, children: report.sections[0]!.children[0]!.children.map((child) => ({ ...child, shrink: 1 })) }] }] };
    const shrunkPdf = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report: shrunk, format: "pdf" } });
    expect(shrunkPdf.statusCode).toBe(200);
    const analyzed = await app.inject({ method: "POST", url: "/api/v1/analyze", payload: { report } });
    expect(analyzed.json().valid).toBe(false);
    expect(analyzed.json().warnings).toContainEqual(expect.objectContaining({ code: "CONTENT_EXCEEDS_PRINTABLE_WIDTH", path: "second" }));
    const allowed = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report, format: "pdf", strict: false } });
    expect(allowed.statusCode).toBe(200);
    expect(Number(allowed.headers["x-render-warnings"])).toBeGreaterThan(0);
  });

  it("analyzes and strictly renders a tall side-by-side text row across pages", async () => {
    const values = Array.from({ length: 55 }, (_, i) => `ROWLINE${String(i + 1).padStart(3, "0")}`).join("\n");
    const report = { schemaVersion: "1.0", id: "long-columns", name: "Long columns",
      page: { size: "custom", unit: "pt", width: 320, height: 320, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
      sections: [{ type: "detail", id: "columns", layout: "row", gap: 12, children: [
        { type: "text", id: "left", value: values, width: 145 },
        { type: "text", id: "right", value: "Patient notes", width: 145 },
      ] }],
    };
    const analyzed = await app.inject({ method: "POST", url: "/api/v1/analyze", payload: { report } });
    expect(analyzed.statusCode).toBe(200);
    expect(analyzed.json().valid).toBe(true);
    expect(analyzed.json().pageCount).toBeGreaterThan(1);
    expect(analyzed.json().decisions).toContainEqual(expect.objectContaining({ kind: "row-split", sectionId: "columns" }));
    const rendered = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report, format: "pdf" } });
    expect(rendered.statusCode).toBe(200);
    expect(rendered.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("still rejects a tall row containing fixed-height content", async () => {
    const report = { schemaVersion: "1.0", id: "fixed-row", name: "Fixed row",
      page: { size: "custom", unit: "pt", width: 320, height: 320, margin: { top: 0, right: 0, bottom: 0, left: 0 } },
      sections: [{ type: "detail", id: "details", layout: "row", children: [
        { type: "text", id: "fixed", value: "Fixed content", width: 145, height: 400 },
      ] }],
    };
    const rendered = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report, format: "pdf" } });
    expect(rendered.statusCode).toBe(422);
    expect(rendered.json().error.details.warnings).toContainEqual(expect.objectContaining({ code: "CONTENT_OVERFLOWS_PAGE" }));
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
    const res = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report: invoiceReport, format: "pptx" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("UNSUPPORTED_FORMAT");
  });

  it("renders an editable Word document", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report: invoiceReport, format: "docx" } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("wordprocessingml");
    expect(res.rawPayload.subarray(0, 2).toString()).toBe("PK");
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
    const publish = await app.inject({ method: "POST", url: "/api/v1/templates/invoice-tpl/versions/1/publish", payload: { notes: "Reviewed the invoice layout and values" } });
    expect(publish.statusCode).toBe(200);
    expect(publish.json().status).toBe("published");
    expect(publish.json().notes).toBe("Reviewed the invoice layout and values");

    const render = await app.inject({ method: "POST", url: "/api/v1/templates/invoice-tpl/render", payload: { format: "pdf" } });
    expect(render.statusCode).toBe(200);
    expect(render.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("blocks critical validation errors even when the publish API is called directly", async () => {
    const bad = { ...invoiceReport, id: "invalid-publish", sections: [{ type: "detail", children: [{ id: "bad-table", type: "table", dataset: "missing", columns: [{ id: "name", header: "Name", binding: "row.name" }] }] }] };
    const create = await app.inject({ method: "POST", url: "/api/v1/templates", payload: { id: "invalid-publish", name: "Invalid", definition: bad } });
    expect(create.statusCode).toBe(201);
    const publish = await app.inject({ method: "POST", url: "/api/v1/templates/invalid-publish/versions/1/publish", payload: { notes: "Should not publish" } });
    expect(publish.statusCode).toBe(422);
    expect(publish.json().error.code).toBe("PUBLISH_VALIDATION_FAILED");
    const version = await app.inject({ method: "GET", url: "/api/v1/templates/invalid-publish/versions/1" });
    expect(version.json().status).toBe("draft");
    const put = await app.inject({ method: "PUT", url: "/api/v1/templates/invalid-publish", payload: { definition: bad, publish: true } });
    expect(put.statusCode).toBe(422);
  });

  it("keeps a published version and its notes immutable", async () => {
    const again = await app.inject({ method: "POST", url: "/api/v1/templates/invoice-tpl/versions/1/publish", payload: { notes: "Changed after publication" } });
    expect(again.statusCode).toBe(200);
    expect(again.json().notes).toBe("Reviewed the invoice layout and values");
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

  it("can return the same font-measured page layout used for PDF rendering", async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ name: i % 3 === 0 ? `Investigation ${i} ${"Long clinical description. ".repeat(8)} తెలుగు` : `Investigation ${i}` }));
    const report = {
      schemaVersion: "1.0", id: "pdf-layout", name: "PDF layout",
      datasets: [{ id: "items", source: "inline", query: { data: rows } }],
      sections: [{ type: "detail", children: [{ id: "items-table", type: "table", dataset: "items", repeatHeaderOnPageBreak: true, columns: [{ id: "name", header: "Name", binding: "row.name" }] }] }],
    };
    const analyzed = await app.inject({ method: "POST", url: "/api/v1/analyze", payload: { report, includeLayout: true } });
    expect(analyzed.statusCode).toBe(200);
    const body = analyzed.json();
    expect(body.paginated.pages).toHaveLength(body.pageCount);
    expect(body.paginated.decisions).toEqual(body.decisions);
    expect(body.paginated.pages.some((page: any) => page.content.some((node: any) => node.rowRange))).toBe(true);
    const rendered = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report, format: "pdf" } });
    expect(rendered.statusCode).toBe(200);
    expect((rendered.rawPayload.toString("latin1").match(/\/Type \/Page(?![s\w])/g) ?? [])).toHaveLength(body.pageCount);
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

describe("data override", () => {
  it("caller data replaces a same-id dataset, so one template renders any record", async () => {
    const report = {
      schemaVersion: "1.0", id: "ov", name: "ov",
      datasets: [{ id: "p", source: "inline", query: { data: { name: "Default" } } }],
      sections: [{ type: "detail", children: [{ type: "text", binding: "data.p.name" }] }],
    };
    await app.inject({ method: "POST", url: "/api/v1/templates", payload: { id: "ov-tpl", name: "ov", definition: report } });
    await app.inject({ method: "POST", url: "/api/v1/templates/ov-tpl/versions/1/publish" });
    const a = await app.inject({ method: "POST", url: "/api/v1/templates/ov-tpl/render", payload: { format: "html" } });
    expect(a.payload).toContain("Default");
    const b = await app.inject({ method: "POST", url: "/api/v1/templates/ov-tpl/render", payload: { format: "html", data: { p: { name: "Asha" } } } });
    expect(b.payload).toContain("Asha");
    expect(b.payload).not.toContain("Default");
  });
});

describe('host-owned report bundles', () => {
  it('renders a bundled client header without template storage and permits a request override', async () => {
    const child={schemaVersion:'1.0',id:'client-header',name:'Client header',datasets:[],sections:[{type:'detail',children:[{type:'text',value:'Bundled client branding'}]}]};
    const parent={schemaVersion:'1.0',id:'host-owned-bundle',name:'Host invoice',datasets:[],subreports:{'client-header':child},sections:[{type:'pageHeader',children:[{type:'subreport',reportId:'client-header'}]},{type:'detail',children:[{type:'text',value:'Invoice body'}]}]};
    const bundled=await app.inject({method:'POST',url:'/api/v1/render',payload:{report:parent,format:'html'}});
    expect(bundled.statusCode).toBe(200);
    expect(bundled.payload).toContain('Bundled client branding');
    const override=await app.inject({method:'POST',url:'/api/v1/render',payload:{report:parent,format:'html',subreports:{'client-header':{report:{...child,sections:[{type:'detail',children:[{type:'text',value:'Customer-specific override'}]}]}}}}});
    expect(override.statusCode).toBe(200);
    expect(override.payload).toContain('Customer-specific override');
    expect(override.payload).not.toContain('Bundled client branding');
    expect((await app.inject({method:'GET',url:'/api/v1/templates/host-owned-bundle'})).statusCode).toBe(404);
  });
});
