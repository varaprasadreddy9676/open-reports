import { describe, it, expect, beforeAll, afterAll } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { PluginRegistry } from "@reporting/plugin-sdk";
import clinicPack from "@reporting/plugin-clinic-pack";
import { buildApp } from "../src/app.js";
import type { FastifyInstance } from "fastify";

let app: FastifyInstance;
let plugins: PluginRegistry;

const report = {
  schemaVersion: "1.0",
  id: "plug",
  name: "Plugin demo",
  datasets: [
    { id: "p", source: "inline", query: { data: { name: "Alex Morgan Reed", uhid: "UH12345" } } },
    { id: "nums", source: "plugin:number-range", query: { from: 1, to: 3 } },
  ],
  sections: [
    {
      type: "detail",
      children: [
        { type: "text", expression: 'initials(data.p.name) + " / " + maskId(data.p.uhid, 3)' },
        { type: "custom", kind: "statusBadge", props: { text: "DISCHARGED", tone: "ok" } },
        { type: "table", dataset: "nums", columns: [{ id: "n", header: "N", binding: "row.n" }] },
      ],
    },
  ],
};

beforeAll(async () => {
  plugins = new PluginRegistry();
  await plugins.register(clinicPack);
  ({ app } = buildApp({ dbPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "plug-")), "db.sqlite"), plugins }));
  await app.ready();
});
afterAll(() => app.close());

describe("plugins through the server", () => {
  it("lists loaded plugins and advertises their formats, components and functions", async () => {
    const list = (await app.inject({ url: "/api/v1/plugins" })).json();
    expect(list.plugins[0]).toMatchObject({ name: "clinic-pack", state: "active" });
    const caps = (await app.inject({ url: "/api/v1/capabilities" })).json();
    expect(caps.formats.some((f: any) => f.id === "txt")).toBe(true);
    expect(caps.customComponents[0].kind).toBe("statusBadge");
    expect(caps.functions.map((f: any) => f.name)).toContain("maskId");
    expect(caps.dataSources).toContain("plugin:number-range");
  });

  it("renders with plugin functions, a custom component and a plugin datasource, to PDF and to the plugin's txt format", async () => {
    const txt = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report, format: "txt" } });
    expect(txt.statusCode, txt.payload).toBe(200);
    expect(txt.headers["content-type"]).toContain("text/plain");
    expect(txt.payload).toContain("AMR / ••••345");
    expect(txt.payload).toContain("DISCHARGED");
    expect(txt.payload).toMatch(/N\n1\n2\n3|N\s*\n1 *\n2 *\n3/);

    const pdf = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report, format: "pdf" } });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("an unknown custom component is a warning, not a crash", async () => {
    const r = { ...report, sections: [{ type: "detail", children: [{ type: "custom", kind: "nope", props: {} }, { type: "text", value: "still renders" }] }] };
    const res = await app.inject({ method: "POST", url: "/api/v1/render", payload: { report: r, format: "txt" } });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain("still renders");
  });

  it("without the plugin, the same report fails clearly", async () => {
    const { app: bare } = buildApp({ dbPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bare-")), "db.sqlite") });
    await bare.ready();
    const res = await bare.inject({ method: "POST", url: "/api/v1/render", payload: { report, format: "pdf" } });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    const fmt = await bare.inject({ method: "POST", url: "/api/v1/render", payload: { report, format: "txt" } });
    expect(fmt.json().error.code).toBe("UNSUPPORTED_FORMAT");
    await bare.close();
  });
});
