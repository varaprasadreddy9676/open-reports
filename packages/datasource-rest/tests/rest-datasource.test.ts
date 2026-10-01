import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { RestDataSource } from "../src/index.js";
import { assertUrlIsSafe, SsrfBlockedError } from "../src/ssrf-guard.js";

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url!, "http://localhost");
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (url.pathname === "/items") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ data: { items: [{ id: 1 }, { id: 2 }] } }));
      } else if (url.pathname === "/echo") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ query: Object.fromEntries(url.searchParams), headers: req.headers, body: body ? JSON.parse(body) : null, method: req.method }));
      } else if (url.pathname === "/slow") {
        setTimeout(() => res.end("{}"), 2000);
      } else if (url.pathname === "/huge") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ blob: "x".repeat(2_000_000) }));
      } else if (url.pathname === "/not-json") {
        res.end("not json");
      } else if (url.pathname === "/error") {
        res.statusCode = 500;
        res.end("boom");
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const limits = { maxRows: 1000, timeoutMs: 30000 };

describe("RestDataSource", () => {
  it("performs a GET and extracts the result via resultPath", async () => {
    const ds = new RestDataSource({ allowedHosts: ["127.0.0.1"] });
    const result = await ds.execute(
      { id: "x", source: "rest", query: { url: `${baseUrl}/items`, resultPath: "data.items" } },
      { parameters: {}, limits }
    );
    expect(result.value).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("interpolates params into the URL, query string, headers and body on a POST", async () => {
    const ds = new RestDataSource({ allowedHosts: ["127.0.0.1"] });
    const result = await ds.execute(
      {
        id: "x",
        source: "rest",
        query: {
          url: `${baseUrl}/echo`,
          method: "POST",
          query: { patientId: "{{params.id}}" },
          headers: { "X-Custom": "{{params.id}}" },
          body: { id: "{{params.id}}", nested: { label: "report-{{params.id}}" } },
        },
      },
      { parameters: { id: "42" }, limits }
    );
    const value = result.value as any;
    expect(value.method).toBe("POST");
    expect(value.query.patientId).toBe("42");
    expect(value.headers["x-custom"]).toBe("42");
    expect(value.body).toEqual({ id: "42", nested: { label: "report-42" } });
  });

  it("times out a slow request", async () => {
    const ds = new RestDataSource({ allowedHosts: ["127.0.0.1"], defaultTimeoutMs: 300 });
    await expect(ds.execute({ id: "x", source: "rest", query: { url: `${baseUrl}/slow` } }, { parameters: {}, limits })).rejects.toThrow(
      /timed out/
    );
  });

  it("enforces a maximum response size", async () => {
    const ds = new RestDataSource({ allowedHosts: ["127.0.0.1"], maxResponseBytes: 1000 });
    await expect(ds.execute({ id: "x", source: "rest", query: { url: `${baseUrl}/huge` } }, { parameters: {}, limits })).rejects.toThrow(
      /exceeded the maximum allowed size/
    );
  });

  it("raises a clear error for a non-2xx response", async () => {
    const ds = new RestDataSource({ allowedHosts: ["127.0.0.1"] });
    await expect(ds.execute({ id: "x", source: "rest", query: { url: `${baseUrl}/error` } }, { parameters: {}, limits })).rejects.toThrow(
      /failed with status 500/
    );
  });

  it("raises a clear error for a non-JSON response", async () => {
    const ds = new RestDataSource({ allowedHosts: ["127.0.0.1"] });
    await expect(ds.execute({ id: "x", source: "rest", query: { url: `${baseUrl}/not-json` } }, { parameters: {}, limits })).rejects.toThrow(
      /not valid JSON/
    );
  });
});

describe("SSRF protection", () => {
  it("blocks loopback addresses by default", async () => {
    await expect(assertUrlIsSafe("http://127.0.0.1:9999/")).rejects.toThrow(SsrfBlockedError);
  });

  it("blocks private network ranges by default", async () => {
    await expect(assertUrlIsSafe("http://10.0.0.5/")).rejects.toThrow(SsrfBlockedError);
    await expect(assertUrlIsSafe("http://192.168.1.1/")).rejects.toThrow(SsrfBlockedError);
    await expect(assertUrlIsSafe("http://169.254.169.254/")).rejects.toThrow(SsrfBlockedError); // cloud metadata endpoint
  });

  it("blocks non-http(s) protocols", async () => {
    await expect(assertUrlIsSafe("file:///etc/passwd")).rejects.toThrow(SsrfBlockedError);
  });

  it("allows a host explicitly present in the allowlist even if it's loopback", async () => {
    await expect(assertUrlIsSafe("http://127.0.0.1:9999/", { allowedHosts: ["127.0.0.1"] })).resolves.toBeUndefined();
  });

  it("the full RestDataSource rejects a loopback URL when no allowlist is configured", async () => {
    const ds = new RestDataSource();
    await expect(ds.execute({ id: "x", source: "rest", query: { url: `${baseUrl}/items` } }, { parameters: {}, limits })).rejects.toThrow(
      SsrfBlockedError
    );
  });
});
