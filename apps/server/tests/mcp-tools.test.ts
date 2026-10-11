import { describe, it, expect, beforeAll, afterAll } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { buildApp } from "../src/app.js";
import type { FastifyInstance } from "fastify";

/**
 * The tools added so an AI client can do everything the designer does, exercised through a real MCP client.
 * Every test runs against the downloadable single-file server (dist/open-reports-mcp.mjs), the file users get.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const bundle = path.resolve(here, "../../../packages/mcp-server/dist/open-reports-mcp.mjs");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-tools-"));
let app: FastifyInstance;
let url: string;

async function connect(args: string[] = []) {
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [bundle, ...args], cwd: work, env: { ...process.env as Record<string, string>, REPORTS_API_URL: url, REPORTS_API_KEY: "mcp-key" }, stderr: "pipe" }));
  return client;
}
const textOf = (r: any) => (r.content as { text: string }[]).map((c) => c.text).join("\n");
const dataOf = (r: any) => JSON.parse((r.content as { text: string }[])[1]!.text);
const call = async (c: Client, name: string, args: Record<string, unknown>) => {
  const result = await c.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`${name} failed: ${textOf(result)}`);
  return result;
};

const JRXML = `<?xml version="1.0" encoding="UTF-8"?>
<jasperReport xmlns="http://jasperreports.sourceforge.net/jasperreports" name="receipt" pageWidth="595" pageHeight="842" columnWidth="555" leftMargin="20" rightMargin="20" topMargin="20" bottomMargin="20">
  <field name="customer" class="java.lang.String"/>
  <title><band height="40"><staticText><reportElement x="0" y="0" width="300" height="24"/><text><![CDATA[PAYMENT RECEIPT]]></text></staticText></band></title>
  <detail><band height="20"><textField><reportElement x="0" y="0" width="300" height="20"/><textFieldExpression><![CDATA[$F{customer}]]></textFieldExpression></textField></band></detail>
</jasperReport>`;

beforeAll(async () => {
  expect(fs.existsSync(bundle), "build packages/mcp-server first (pnpm --filter @reporting/mcp-server build)").toBe(true);
  ({ app } = buildApp({ dbPath: path.join(work, "db.sqlite"), apiKeys: ["mcp-key"], examplesDir: path.resolve(here, "../../../examples") }));
  await app.listen({ port: 0, host: "127.0.0.1" });
  url = `http://127.0.0.1:${(app.server.address() as any).port}`;
});
afterAll(() => app.close());

describe("downloadable MCP server", () => {
  it("is served for download and its tools are described for the settings panel", async () => {
    const file = await fetch(`${url}/mcp/open-reports-mcp.mjs`);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-disposition")).toContain("open-reports-mcp.mjs");
    expect((await file.text()).startsWith("#!/usr/bin/env node")).toBe(true);
    const info = await (await fetch(`${url}/api/v1/mcp`, { headers: { "x-api-key": "mcp-key" } })).json();
    expect(info.available).toBe(true);
    expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
    const names = info.tools.map((t: any) => t.name);
    expect(names).toEqual(expect.arrayContaining(["preview_report", "test_dataset", "render_to_file", "import_jrxml_folder", "delete_template"]));
    expect(info.tools.find((t: any) => t.name === "delete_template").destructive).toBe(true);
    expect(info.tools.find((t: any) => t.name === "render_to_file").local).toBe(true);
  });

  it("lists every tool the info route describes, with destructive hints", async () => {
    const c = await connect();
    const tools = (await c.listTools()).tools;
    const info = await (await fetch(`${url}/api/v1/mcp`, { headers: { "x-api-key": "mcp-key" } })).json();
    expect(tools.map((t) => t.name).sort()).toEqual(info.tools.map((t: any) => t.name).sort());
    expect(tools.find((t) => t.name === "delete_block")!.annotations?.destructiveHint).toBe(true);
    expect(tools.find((t) => t.name === "preview_report")!.annotations?.readOnlyHint).toBe(true);
    await c.close();
  }, 30_000);

  it("previews pages as text, renders every format and tests a dataset", async () => {
    const c = await connect();
    const invoice = dataOf(await call(c, "get_example", { name: "invoice" }));
    // Remote logos are blocked by default, so preview without them.
    const offline = JSON.parse(JSON.stringify(invoice).replace(/"src":"https:[^"]+"/g, '"src":""'));
    const preview = textOf(await call(c, "preview_report", { report: offline }));
    expect(preview).toMatch(/--- Page 1 of \d+ ---/);
    expect(preview).toContain("Alex Morgan");
    for (const format of ["docx", "escpos"]) {
      const rendered = dataOf(await call(c, "render_report", { report: offline, format }));
      expect(rendered.bytes).toBeGreaterThan(100);
    }
    const dataset = dataOf(await call(c, "test_dataset", { dataset: { id: "rows", source: "inline", query: { data: [{ a: 1 }, { a: 2 }] } } }));
    expect(dataset.rowCount).toBe(2);
    await c.close();
  }, 60_000);

  it("runs a background render job and returns its output", async () => {
    const c = await connect();
    const report = dataOf(await call(c, "get_example", { name: "conditional" }));
    const job = dataOf(await call(c, "start_render_job", { report, format: "csv" }));
    let result: any;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      result = await call(c, "get_render_job", { jobId: job.jobId });
      if (textOf(result).includes("completed")) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    expect(textOf(result)).toContain("completed");
    expect(dataOf(result).output.text.length).toBeGreaterThan(0);
    await c.close();
  }, 60_000);

  it("manages template versions, blocks and printer profiles like the designer", async () => {
    const c = await connect();
    const report = dataOf(await call(c, "get_example", { name: "conditional" }));
    await call(c, "save_template", { id: "mcp-tools-demo", report });
    await call(c, "save_template", { id: "mcp-tools-demo", report });
    expect(dataOf(await call(c, "list_template_versions", { id: "mcp-tools-demo" }))).toHaveLength(2);
    await call(c, "delete_template", { id: "mcp-tools-demo" });
    expect(dataOf(await call(c, "list_templates", {})).map((t: any) => t.id)).not.toContain("mcp-tools-demo");

    await call(c, "save_block", { id: "brand-strip", name: "Brand strip", children: [{ type: "text", value: "Northstar" }] });
    expect(dataOf(await call(c, "list_blocks", {})).map((b: any) => b.id)).toContain("brand-strip");
    expect(dataOf(await call(c, "get_block", { id: "brand-strip" })).block.children[0].value).toBe("Northstar");
    await call(c, "delete_block", { id: "brand-strip" });

    await call(c, "save_printer_profile", { id: "zebra-50x30", name: "Zebra 50 × 30", print: { dpi: 203 }, page: { size: "custom", width: 50, height: 30, unit: "mm" } });
    expect(dataOf(await call(c, "list_printer_profiles", {})).map((p: any) => p.id)).toContain("zebra-50x30");
    await call(c, "delete_printer_profile", { id: "zebra-50x30" });
    expect(textOf(await call(c, "list_plugins", {}))).toMatch(/plugin/);
    await c.close();
  }, 60_000);

  it("opens and saves report files, renders to a file and imports JRXML on this computer", async () => {
    const c = await connect();
    const report = dataOf(await call(c, "get_example", { name: "conditional" }));
    await call(c, "save_report_file", { path: "reports/conditional.report.json", report });
    expect(dataOf(await call(c, "open_report_file", { path: path.join(work, "reports/conditional.report.json") })).id).toBe(report.id);
    const saved = dataOf(await call(c, "render_to_file", { report, format: "pdf", path: "out/" }));
    expect(fs.readFileSync(saved.path).subarray(0, 4).toString()).toBe("%PDF");

    const imported = dataOf(await call(c, "import_jrxml", { source: JRXML }));
    expect(JSON.stringify(imported.report)).toContain("PAYMENT RECEIPT");
    fs.mkdirSync(path.join(work, "jasper"), { recursive: true });
    fs.writeFileSync(path.join(work, "jasper/receipt.jrxml"), JRXML);
    const folder = dataOf(await call(c, "import_jrxml_folder", { dir: "jasper", outputDir: "converted" }));
    expect(fs.existsSync(folder.files[0].file)).toBe(true);
    await c.close();
  }, 60_000);

  it("--read-only hides every tool that writes, saves or deletes", async () => {
    const c = await connect(["--read-only"]);
    const names = (await c.listTools()).tools.map((t) => t.name);
    for (const write of ["save_template", "publish_template", "delete_template", "save_block", "delete_block", "save_printer_profile", "delete_printer_profile", "save_report_file", "render_to_file", "import_jrxml_folder"]) expect(names).not.toContain(write);
    expect(names).toEqual(expect.arrayContaining(["preview_report", "open_report_file", "import_jrxml", "render_report"]));
    await c.close();
  }, 30_000);

  it("--help and --version explain themselves without starting the protocol", async () => {
    const { spawnSync } = await import("node:child_process");
    const help = spawnSync(process.execPath, [bundle, "--help"], { encoding: "utf8" });
    expect(help.status).toBe(0);
    expect(help.stdout).toBe("");
    expect(help.stderr).toContain("--read-only");
    expect(spawnSync(process.execPath, [bundle, "--version"], { encoding: "utf8" }).stderr.trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect(spawnSync(process.execPath, [bundle, "--url", "ftp://nope"], { encoding: "utf8" }).status).toBe(2);
  });
});

describe("remote MCP over HTTP (POST /mcp)", () => {
  const remote = async (path = "/mcp", key: string | undefined = "mcp-key") => {
    const client = new Client({ name: "remote-test", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${url}${path}`), { requestInit: { headers: key ? { "x-api-key": key } : {} } }));
    return client;
  };

  it("requires the API key like the REST API", async () => {
    const res = await fetch(`${url}/mcp`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
    expect(res.status).toBe(401);
    await expect(remote("/mcp", "wrong-key")).rejects.toThrow();
  });

  it("offers the server tools (not the local file tools) and runs them with the caller's key", async () => {
    const c = await remote();
    const names = (await c.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["preview_report", "test_dataset", "save_template", "delete_block"]));
    expect(names).not.toContain("render_to_file");
    const report = dataOf(await call(c, "get_example", { name: "conditional" }));
    expect(textOf(await call(c, "preview_report", { report }))).toMatch(/--- Page 1 of \d+ ---/);
    await call(c, "save_template", { id: "remote-mcp-demo", report });
    expect(dataOf(await call(c, "list_templates", {})).map((t: any) => t.id)).toContain("remote-mcp-demo");
    await call(c, "delete_template", { id: "remote-mcp-demo" });
    await c.close();
  }, 30_000);

  it("?read-only hides every write tool", async () => {
    const c = await remote("/mcp?read-only");
    const names = (await c.listTools()).tools.map((t) => t.name);
    expect(names).toContain("render_report");
    for (const write of ["save_template", "publish_template", "delete_template", "save_block", "delete_printer_profile"]) expect(names).not.toContain(write);
    await c.close();
  });
});
