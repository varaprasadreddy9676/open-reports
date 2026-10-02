import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import fs from "node:fs";
import { executeDatasets } from "@reporting/core";
import { createDefaultDataSourceRegistry, secretsFromEnv, sqlConnectionIds } from "./datasources.js";
import { discoverFonts } from "@reporting/renderer-pdf";
import { randomUUID } from "node:crypto";
import { getReportJsonSchema, parseReportDefinition } from "@reporting/schema";
import { resolveReport, validateReport } from "@reporting/core";
import { createAuthHook } from "./auth.js";
import { SqliteStorage } from "./storage/sqlite-storage.js";
import { assertStorageProvider, TemplateNotFoundError, VersionImmutableError, VersionNotFoundError, type StorageProvider } from "./storage/types.js";
import { createRuntime, RenderPipelineError, runRender } from "./render-pipeline.js";
import type { PluginRegistry } from "@reporting/plugin-sdk";
import { JobStore } from "./jobs.js";

export interface BuildAppOptions {
  dbPath: string;
  apiKeys?: string[];
  /** Directory of the built designer app; when set it is served at / (same origin as the API). */
  designerDist?: string;
  /** Already-registered plugins (see @reporting/plugin-sdk loadPlugins). */
  plugins?: PluginRegistry;
  /** Directory of example *.report.json files to expose at /api/v1/examples. */
  examplesDir?: string;
}

export function buildApp(options: BuildAppOptions): { app: FastifyInstance; storage: StorageProvider; jobs: JobStore } {
  const app = Fastify({ logger: false, bodyLimit: 10 * 1024 * 1024 });
  const storage: StorageProvider = options.plugins?.storage !== undefined ? assertStorageProvider(options.plugins.storage) : new SqliteStorage(options.dbPath);
  const runtime = createRuntime(options.plugins);
  const jobs = new JobStore(runtime);
  const authHook = createAuthHook(options.apiKeys ?? []);

  void app.register(cors, { origin: true, exposedHeaders: ["x-render-id", "x-render-warnings"] });
  if (options.designerDist && fs.existsSync(options.designerDist)) {
    void app.register(fastifyStatic, { root: options.designerDist, wildcard: false });
  }
  const dataSources = runtime.dataSources;

  app.addHook("onRequest", async (request, reply) => {
    if (request.url === "/health" || request.url === "/openapi.json" || request.url === "/api/v1/schema" || !request.url.startsWith("/api/")) return;
    await authHook(request, reply);
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/openapi.json", async () => buildOpenApiDocument());

  // --- Public schema + capabilities (the designer uses these to warn about fonts, renderers and secrets) ---
  app.get("/api/v1/schema", async () => getReportJsonSchema());

  app.get("/api/v1/capabilities", async () => {
    const fonts = discoverFonts();
    return {
      formats: [
        { id: "pdf", mimeType: "application/pdf", supports: ["*"] },
        { id: "html", mimeType: "text/html", supports: ["*"] },
        { id: "xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", supports: ["table", "text", "field"] },
        { id: "csv", mimeType: "text/csv", supports: ["table"] },
        ...[...(options.plugins?.renderers.values() ?? [])].map((r) => ({ id: r.format, mimeType: r.mimeType, supports: r.supports, plugin: true })),
        { id: "escpos", mimeType: "application/octet-stream", supports: ["text", "richText", "field", "line", "spacer", "barcode", "qrcode", "table", "container", "row", "column", "grid", "repeater", "group", "keepTogether"] },
        { id: "zpl", mimeType: "text/plain", supports: ["text", "richText", "field", "line", "rectangle", "spacer", "barcode", "qrcode", "table", "container", "row", "column", "grid", "repeater", "group", "keepTogether", "pageBreak"] },
      ],
      fonts: Object.keys(fonts.families ?? {}),
      scriptFonts: fonts.scriptFamilies ?? {},
      secrets: Object.keys(secretsFromEnv()),
      sqlConnections: sqlConnectionIds(),
      customComponents: [...(options.plugins?.components.entries() ?? [])].map(([kind, c]) => ({ kind, description: c.description, props: c.props })),
      functions: [...(options.plugins?.functionDocs.entries() ?? [])].map(([name, doc]) => ({ name, doc })),
      dataSources: [...(options.plugins?.dataSources.keys() ?? [])].map((n) => `plugin:${n}`),
    };
  });

  // --- Example reports (a directory of *.report.json, set with EXAMPLES_DIR); lets AI tools and the designer start from known-good documents ---
  const examplesDir = options.examplesDir ?? process.env.EXAMPLES_DIR;
  const readExamples = () => (examplesDir && fs.existsSync(examplesDir) ? fs.readdirSync(examplesDir).filter((f) => f.endsWith(".report.json")).map((f) => f.replace(".report.json", "")) : []);
  app.get("/api/v1/examples", async () =>
    readExamples().map((name) => {
      const doc = JSON.parse(fs.readFileSync(`${examplesDir}/${name}.report.json`, "utf-8"));
      return { name, title: doc.name, description: doc.description };
    })
  );
  app.get("/api/v1/examples/:name", async (request, reply) => {
    const { name } = request.params as { name: string };
    if (!readExamples().includes(name)) return reply.code(404).send({ error: { code: "EXAMPLE_NOT_FOUND", message: `No example named "${name}".` } });
    return JSON.parse(fs.readFileSync(`${examplesDir}/${name}.report.json`, "utf-8"));
  });

  app.get("/api/v1/plugins", async () => ({ plugins: options.plugins?.statuses ?? [] }));

  // --- Reusable blocks (shared "My Components") ---
  app.get("/api/v1/blocks", async () => storage.listBlocks());
  app.put("/api/v1/blocks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name: string; children: unknown };
    if (!body?.name || !Array.isArray(body.children)) return reply.code(400).send({ error: { code: "INVALID_BLOCK", message: "name and children[] are required." } });
    await storage.putBlock(id, body.name, body.children);
    reply.code(204).send();
  });
  app.delete("/api/v1/blocks/:id", async (request, reply) => {
    await storage.deleteBlock((request.params as { id: string }).id);
    reply.code(204).send();
  });

  // --- Validation ---
  app.post("/api/v1/validate", async (request, reply) => {
    const body = request.body as { report: unknown };
    const parsed = parseReportDefinition(body.report);
    if (!parsed.valid) {
      return reply.send({ valid: false, issues: parsed.issues });
    }
    const result = validateReport(parsed.report);
    return reply.send(result);
  });

  // --- Dataset test (designer "test request" / result preview) ---
  app.post("/api/v1/datasets/test", async (request, reply) => {
    const body = request.body as { dataset: any; parameters?: Record<string, unknown>; maxRows?: number };
    if (!body?.dataset?.id || !body.dataset.source) {
      return reply.code(400).send({ error: { code: "INVALID_DATASET", message: "dataset.id and dataset.source are required." } });
    }
    const limit = Math.min(body.maxRows ?? 50, 500);
    const { datasets, issues, durations } = await executeDatasets([body.dataset], dataSources, body.parameters ?? {}, { maxRows: limit, timeoutMs: 15000 });
    const value = datasets[body.dataset.id];
    reply.send({
      ok: issues.length === 0,
      issues,
      durationMs: durations[body.dataset.id],
      rowCount: Array.isArray(value) ? value.length : value == null ? 0 : 1,
      value,
    });
  });

  // --- Analyze: validation + real pagination, without producing a file. Built for the designer and AI tools. ---
  app.post("/api/v1/analyze", async (request, reply) => {
    const body = request.body as { report: unknown; parameters?: Record<string, unknown>; data?: Record<string, unknown>; includeLayout?: boolean };
    const parsed = parseReportDefinition(body?.report);
    if (!parsed.valid) return reply.send({ valid: false, stage: "schema", issues: parsed.issues.map((i) => ({ ...i, severity: "error" as const })) });
    const validation = validateReport(parsed.report);
    const extra = Object.entries(body.data ?? {}).filter(([id]) => !parsed.report.datasets.some((d) => d.id === id)).map(([id, value]) => ({ id, source: "inline" as const, query: { data: value } }));
    const report = extra.length ? { ...parsed.report, datasets: [...parsed.report.datasets, ...extra] } : parsed.report;
    try {
      const pipeline = await resolveReport(report, { registry: runtime.dataSources, parameters: body.parameters ?? {}, tolerant: true, functions: runtime.functions, customComponents: runtime.customComponents });
      const pdf = runtime.renderers.pdf as { paginateOnly?: (i: unknown) => import("@reporting/layout").PaginatedReport };
      const paginated = pdf.paginateOnly?.({ resolved: pipeline.resolved, resolvePageSection: pipeline.resolvePageSection });
      reply.send({
        valid: validation.valid && pipeline.issues.length === 0,
        stage: "analyzed",
        issues: [...validation.issues, ...pipeline.issues],
        warnings: [...pipeline.resolved.warnings, ...(paginated?.warnings ?? [])],
        pageCount: paginated?.pages.length,
        pageSize: paginated?.pageSize,
        decisions: paginated?.decisions ?? [],
        pages: paginated?.pages.map((p) => ({ number: p.number, zones: p.zones, master: p.master })),
        ...(body.includeLayout ? { paginated } : {}),
      });
    } catch (err) {
      reply.code(422).send({ error: { code: "ANALYZE_FAILED", message: err instanceof Error ? err.message : String(err) } });
    }
  });

  // --- Inline render ---
  app.post("/api/v1/render", async (request, reply) => {
    const body = request.body as { report: unknown; format: string; parameters?: Record<string, unknown>; data?: Record<string, unknown> };
    try {
      const { result, renderId } = await runRender({ report: body.report, format: body.format, parameters: body.parameters, data: body.data }, runtime);
      reply
        .header("content-type", result.mimeType)
        .header("x-render-id", renderId)
        .header("x-render-warnings", String(result.warnings.length))
        .send(result.content);
    } catch (err) {
      sendRenderError(reply, err);
    }
  });

  // --- Templates CRUD ---
  app.get("/api/v1/templates", async () => storage.listTemplates());

  app.post("/api/v1/templates", async (request, reply) => {
    const body = request.body as { id?: string; name: string; description?: string; definition: unknown };
    const parsed = parseReportDefinition(body.definition);
    if (!parsed.valid) {
      return reply.code(400).send({ error: { code: "INVALID_REPORT", message: "Template definition failed schema validation.", issues: parsed.issues } });
    }
    const id = body.id ?? randomUUID();
    const existing = await storage.getTemplate(id);
    if (existing) {
      return reply.code(409).send({ error: { code: "TEMPLATE_EXISTS", message: `Template "${id}" already exists.` } });
    }
    const record = await storage.createTemplate({ id, name: body.name, description: body.description, definition: body.definition });
    reply.code(201).send(record);
  });

  app.get("/api/v1/templates/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = await storage.getTemplate(id);
    if (!record) return reply.code(404).send({ error: { code: "TEMPLATE_NOT_FOUND", message: `Template "${id}" not found.` } });
    reply.send(record);
  });

  app.put("/api/v1/templates/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { definition?: unknown; name?: string; description?: string; publish?: boolean };

    try {
      if (body.name !== undefined || body.description !== undefined) {
        await storage.updateTemplateMeta(id, { name: body.name, description: body.description });
      }
      if (body.definition !== undefined) {
        const parsed = parseReportDefinition(body.definition);
        if (!parsed.valid) {
          return reply.code(400).send({ error: { code: "INVALID_REPORT", message: "Template definition failed schema validation.", issues: parsed.issues } });
        }
        const version = await storage.createVersion(id, body.definition);
        if (body.publish) {
          await storage.publishVersion(id, version.version);
        }
      }
      reply.send(await storage.getTemplate(id));
    } catch (err) {
      sendStorageError(reply, err);
    }
  });

  app.delete("/api/v1/templates/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    await storage.deleteTemplate(id);
    reply.code(204).send();
  });

  // --- Versions ---
  app.get("/api/v1/templates/:id/versions", async (request, reply) => {
    const { id } = request.params as { id: string };
    reply.send(await storage.listVersions(id));
  });

  app.get("/api/v1/templates/:id/versions/:version", async (request, reply) => {
    const { id, version } = request.params as { id: string; version: string };
    const record = await storage.getVersion(id, Number(version));
    if (!record) return reply.code(404).send({ error: { code: "VERSION_NOT_FOUND", message: `No version ${version} for template "${id}".` } });
    reply.send(record);
  });

  app.post("/api/v1/templates/:id/versions/:version/publish", async (request, reply) => {
    const { id, version } = request.params as { id: string; version: string };
    try {
      reply.send(await storage.publishVersion(id, Number(version)));
    } catch (err) {
      sendStorageError(reply, err);
    }
  });

  // --- Template render ---
  app.post("/api/v1/templates/:id/render", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { format: string; parameters?: Record<string, unknown>; data?: Record<string, unknown>; version?: number };

    const version = body.version !== undefined ? await storage.getVersion(id, body.version) : await storage.getLatestPublishedVersion(id);
    if (!version) {
      return reply.code(404).send({
        error: { code: "NO_RENDERABLE_VERSION", message: body.version !== undefined ? `Template "${id}" has no version ${body.version}.` : `Template "${id}" has no published version.` },
      });
    }

    try {
      const { result, renderId } = await runRender({ report: version.definition, format: body.format, parameters: body.parameters, data: body.data }, runtime);
      reply.header("content-type", result.mimeType).header("x-render-id", renderId).send(result.content);
    } catch (err) {
      sendRenderError(reply, err);
    }
  });

  // --- Async render jobs ---
  app.post("/api/v1/render/jobs", async (request, reply) => {
    const body = request.body as { report: unknown; format: string; parameters?: Record<string, unknown>; data?: Record<string, unknown> };
    const job = jobs.enqueue({ report: body.report, format: body.format, parameters: body.parameters, data: body.data });
    reply.code(202).send({ jobId: job.id, status: job.status });
  });

  app.get("/api/v1/render/jobs/:jobId", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = jobs.get(jobId);
    if (!job) return reply.code(404).send({ error: { code: "JOB_NOT_FOUND", message: `Job "${jobId}" not found.` } });
    reply.send(job);
  });

  app.get("/api/v1/render/jobs/:jobId/output", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = jobs.get(jobId);
    if (!job) return reply.code(404).send({ error: { code: "JOB_NOT_FOUND", message: `Job "${jobId}" not found.` } });
    if (job.status !== "completed") {
      return reply.code(409).send({ error: { code: "JOB_NOT_COMPLETED", message: `Job "${jobId}" is not completed (status: ${job.status}).` } });
    }
    const output = jobs.getOutput(jobId);
    if (!output) return reply.code(410).send({ error: { code: "JOB_OUTPUT_EXPIRED", message: `Output for job "${jobId}" is no longer available.` } });
    reply.header("content-type", output.mimeType).send(output.content);
  });

  app.delete("/api/v1/render/jobs/:jobId", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const cancelled = jobs.cancel(jobId);
    reply.code(cancelled ? 200 : 409).send({ cancelled });
  });

  app.addHook("onClose", async () => {
    await storage.close?.();
    await options.plugins?.dispose();
    jobs.dispose();
  });

  return { app, storage, jobs };
}

function sendStorageError(reply: import("fastify").FastifyReply, err: unknown): void {
  if (err instanceof TemplateNotFoundError) return void reply.code(404).send({ error: { code: "TEMPLATE_NOT_FOUND", message: err.message } });
  if (err instanceof VersionNotFoundError) return void reply.code(404).send({ error: { code: "VERSION_NOT_FOUND", message: err.message } });
  if (err instanceof VersionImmutableError) return void reply.code(409).send({ error: { code: "VERSION_IMMUTABLE", message: err.message } });
  reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : String(err) } });
}

function sendRenderError(reply: import("fastify").FastifyReply, err: unknown): void {
  if (err instanceof RenderPipelineError) {
    return void reply.code(err.statusCode).send({ error: { code: err.code, message: err.message, details: err.details } });
  }
  reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : String(err) } });
}

function buildOpenApiDocument(): Record<string, unknown> {
  return {
    openapi: "3.0.3",
    info: { title: "Reporting Platform API", version: "0.1.0", description: "Render deterministic PDF/HTML/XLSX/CSV/ZPL documents from a renderer-neutral JSON report definition. Send the API key in the `x-api-key` header." },
    security: [{ apiKey: [] }],
    paths: {
      "/health": { get: { summary: "Liveness probe (no auth)", security: [] } },
      "/api/v1/schema": { get: { summary: "The JSON Schema of a report definition (no auth)", security: [] } },
      "/api/v1/capabilities": { get: { summary: "Output formats and what they support, installed fonts, server secret names, plugin-provided components/functions" } },
      "/api/v1/examples": { get: { summary: "Example reports" } },
      "/api/v1/examples/{name}": { get: { summary: "One example report definition" } },
      "/api/v1/plugins": { get: { summary: "Loaded plugins and their status" } },
      "/api/v1/analyze": { post: { summary: "Validate and paginate a report without rendering: page count, pagination decisions, warnings" } },
      "/api/v1/datasets/test": { post: { summary: "Run one dataset (with parameters) and return a preview" } },
      "/api/v1/blocks": { get: { summary: "List reusable blocks" } },
      "/api/v1/blocks/{id}": { put: { summary: "Create or replace a reusable block" }, delete: { summary: "Delete a reusable block" } },
      "/api/v1/validate": { post: { summary: "Validate a report definition" } },
      "/api/v1/render": { post: { summary: "Render a report inline" } },
      "/api/v1/templates": { get: { summary: "List templates" }, post: { summary: "Create a template" } },
      "/api/v1/templates/{id}": { get: { summary: "Get a template" }, put: { summary: "Update a template (creates a new version)" }, delete: { summary: "Delete a template" } },
      "/api/v1/templates/{id}/versions": { get: { summary: "List template versions" } },
      "/api/v1/templates/{id}/versions/{version}": { get: { summary: "Get a specific template version" } },
      "/api/v1/templates/{id}/versions/{version}/publish": { post: { summary: "Publish a template version" } },
      "/api/v1/templates/{id}/render": { post: { summary: "Render a published (or specific) template version" } },
      "/api/v1/render/jobs": { post: { summary: "Enqueue an async render job" } },
      "/api/v1/render/jobs/{jobId}": { get: { summary: "Get job status" }, delete: { summary: "Cancel a job" } },
      "/api/v1/render/jobs/{jobId}/output": { get: { summary: "Download a completed job's output" } },
    },
    components: { securitySchemes: { apiKey: { type: "apiKey", in: "header", name: "x-api-key" } }, schemas: { ReportDefinition: getReportJsonSchema() } },
  };
}
