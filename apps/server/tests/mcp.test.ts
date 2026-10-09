import { describe, it, expect, beforeAll, afterAll } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { buildApp } from "../src/app.js";
import type { FastifyInstance } from "fastify";

/** A real MCP client talking over stdio to the real MCP server process, which talks HTTP to a real API server (with auth on). */
const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.resolve(here, "../../../packages/mcp-server/dist/cli.js");
let app: FastifyInstance;
let url: string;

async function connect(extraArgs: string[] = [], key = "mcp-key") {
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: [cli, ...extraArgs], env: { ...process.env as Record<string, string>, REPORTS_API_URL: url, REPORTS_API_KEY: key }, stderr: "pipe" });
  await client.connect(transport);
  return client;
}
const textOf = (r: any) => (r.content as { text: string }[]).map((c) => c.text).join("\n");

beforeAll(async () => {
  ({ app } = buildApp({ dbPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mcp-")), "db.sqlite"), apiKeys: ["mcp-key"], examplesDir: path.resolve(here, "../../../examples") }));
  await app.listen({ port: 0, host: "127.0.0.1" });
  url = `http://127.0.0.1:${(app.server.address() as any).port}`;
});
afterAll(() => app.close());

describe("MCP server", () => {
  it("lists tools with JSON schemas and read-only hints", async () => {
    const c = await connect();
    const { tools } = await c.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["patch_report", "analyze_report", "render_report", "list_examples", "save_template"]));
    expect(tools.find((t) => t.name === "patch_report")!.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === "save_template")!.annotations?.readOnlyHint).toBe(false);
    await c.close();
  }, 30_000);

  it("an agent can read a report's bands and edit one by reference - through MCP", async () => {
    const c = await connect();
    const ex = JSON.parse(textOf(await c.callTool({ name: "get_example", arguments: { name: "lab-report" } })).split("\n")[1]!);
    const outline = textOf(await c.callTool({ name: "describe_report", arguments: { report: ex } }));
    expect(outline).toMatch(/^@pageHeader \[pageHeader\]/m);
    expect(outline).toMatch(/^@detail/m);
    const patched = await c.callTool({ name: "patch_report", arguments: { report: ex, ops: [
      { op: "add", path: "/sections/-", value: { type: "reportFooter", printAtBottom: true, children: [{ type: "text", value: "Signed by the agent" }] } },
    ] } });
    expect(patched.isError).toBeFalsy();
    expect(textOf(patched)).toContain("added band @reportFooter");
    const report = JSON.parse(textOf(patched).split("\n")[1]!).report;
    const moved = await c.callTool({ name: "patch_report", arguments: { report, ops: [{ op: "replace", path: "@reportFooter/children/0/value", value: "Signed" }], analyze: false } });
    expect(textOf(moved)).toContain("Applied 1 op(s)");
    const bad = await c.callTool({ name: "patch_report", arguments: { report, ops: [{ op: "add", path: "@summary/children/-", value: {} }] } });
    expect(bad.isError).toBe(true);
    expect(textOf(bad)).toContain("No summary band");
    await c.close();
  }, 30_000);

  it("--read-only hides write tools", async () => {
    const c = await connect(["--read-only"]);
    const names = (await c.listTools()).tools.map((t) => t.name);
    expect(names).not.toContain("save_template");
    expect(names).not.toContain("publish_template");
    expect(names).toContain("render_report");
    await c.close();
  }, 30_000);

  it("an agent can fetch an example, patch it by id, analyze and render - through MCP", async () => {
    const c = await connect();
    const ex = JSON.parse(textOf(await c.callTool({ name: "get_example", arguments: { name: "conditional" } })).split("\n")[1]!);
    const patched = await c.callTool({ name: "patch_report", arguments: { report: ex, ops: [{ op: "add", path: "/sections/-", value: { type: "detail", children: [{ type: "text", value: "Added by an AI agent" }] } }] } });
    expect(patched.isError).toBeFalsy();
    const report = JSON.parse(textOf(patched).split("\n")[1]!).report;
    const html = textOf(await c.callTool({ name: "render_report", arguments: { report, format: "html" } }));
    expect(html).toContain("Added by an AI agent");
    await c.close();
  }, 30_000);

  it("errors come back as tool errors the model can read, and a wrong API key is reported", async () => {
    const c = await connect();
    const bad = await c.callTool({ name: "get_example", arguments: { name: "nope" } });
    expect(bad.isError).toBe(true);
    expect(textOf(bad)).toMatch(/404|No example/);
    await c.close();
    const c2 = await connect([], "wrong");
    const denied = await c2.callTool({ name: "list_templates", arguments: {} });
    expect(denied.isError).toBe(true);
    expect(textOf(denied)).toMatch(/401|key/i);
    await c2.close();
  }, 30_000);

  it("exposes resources and the authoring prompt", async () => {
    const c = await connect();
    const res = await c.listResources();
    expect(res.resources.map((r) => r.uri)).toContain("report://schema");
    const guide = await c.readResource({ uri: "report://guide" });
    expect((guide.contents[0] as any).text).toContain("patch_report");
    const ex = await c.readResource({ uri: "report://examples/invoice" });
    expect(JSON.parse((ex.contents[0] as any).text).id).toBe("invoice");
    const prompt = await c.getPrompt({ name: "author_report", arguments: { goal: "a lab report" } });
    expect((prompt.messages[0]!.content as any).text).toContain("Goal: a lab report");
    await c.close();
  }, 30_000);
});
