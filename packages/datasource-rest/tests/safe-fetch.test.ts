import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo, LookupFunction } from "node:net";
import { RestDataSource } from "../src/index.js";
import { redirectTarget, safeFetch } from "../src/safe-fetch.js";
import { assertUrlIsSafe, SsrfBlockedError } from "../src/ssrf-guard.js";

const limits = { maxRows: 1000, timeoutMs: 5000 };
let target: http.Server;
let redirector: http.Server;
let targetPort: number;
let redirectorPort: number;
const seenHeaders: http.IncomingHttpHeaders[] = [];

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));
}

beforeAll(async () => {
  target = http.createServer((req, res) => {
    seenHeaders.push(req.headers);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ secret: "internal" }));
  });
  targetPort = await listen(target);
  redirector = http.createServer((req, res) => {
    const url = new URL(req.url!, "http://placeholder");
    if (url.pathname === "/loop") {
      res.writeHead(302, { location: "/loop" });
      res.end();
      return;
    }
    res.writeHead(302, { location: url.searchParams.get("to")! });
    res.end();
  });
  redirectorPort = await listen(redirector);
});

afterAll(async () => {
  await new Promise<void>((resolve) => target.close(() => resolve()));
  await new Promise<void>((resolve) => redirector.close(() => resolve()));
});

const via = (to: string) => `http://127.0.0.1:${redirectorPort}/?to=${encodeURIComponent(to)}`;

describe("safeFetch redirects", () => {
  it("re-validates every redirect hop against the host allowlist", async () => {
    const internal = `http://localhost:${targetPort}/`;
    await expect(safeFetch(via(internal), {}, { allowedHosts: ["127.0.0.1"] })).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it("follows an allowed redirect and drops author headers when the origin changes", async () => {
    seenHeaders.length = 0;
    const response = await safeFetch(via(`http://localhost:${targetPort}/`), { headers: { "x-api-key": "top-secret", accept: "application/json" } }, { allowedHosts: ["127.0.0.1", "localhost"] });
    expect(response.status).toBe(200);
    expect(seenHeaders).toHaveLength(1);
    expect(seenHeaders[0]!["x-api-key"]).toBeUndefined();
  });

  it("stops after a bounded number of redirects", async () => {
    await expect(safeFetch(`http://127.0.0.1:${redirectorPort}/loop`, {}, { allowedHosts: ["127.0.0.1"] })).rejects.toThrow(/redirect/i);
  });

  it("refuses to downgrade from https to http and resolves relative locations", () => {
    expect(() => redirectTarget(new URL("https://api.example/a"), "http://api.example/b")).toThrow(/https/i);
    expect(redirectTarget(new URL("https://api.example/a/b"), "../c?x=1").toString()).toBe("https://api.example/c?x=1");
    expect(redirectTarget(new URL("http://api.example/a"), "https://api.example/b").protocol).toBe("https:");
  });
});

describe("safeFetch DNS pinning", () => {
  it("rejects a host that resolves to a public address when checked but a private one when connecting", async () => {
    let calls = 0;
    const rebinding: LookupFunction = (_host, options, callback) => {
      calls++;
      const address = calls === 1 ? { address: "93.184.216.34", family: 4 } : { address: "127.0.0.1", family: 4 };
      if ((options as { all?: boolean }).all) (callback as (e: null, a: typeof address[]) => void)(null, [address]);
      else callback(null, address.address, address.family);
    };
    await expect(safeFetch(`http://rebind.example:${targetPort}/`, {}, { lookup: rebinding })).rejects.toBeInstanceOf(SsrfBlockedError);
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});

describe("encoded and mapped private addresses", () => {
  for (const url of [
    "http://2130706433/",
    "http://0x7f000001/",
    "http://0177.0.0.1/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::1]/",
    "http://[::]/",
    "http://0.0.0.0/",
    "http://224.0.0.1/",
    "http://255.255.255.255/",
    "http://198.18.0.1/",
    "http://localhost./",
  ]) {
    it(`blocks ${url}`, async () => {
      await expect(assertUrlIsSafe(url)).rejects.toBeInstanceOf(SsrfBlockedError);
    });
  }
});

describe("RestDataSource uses the hardened fetch", () => {
  it("does not follow a redirect from an allowed host to a host outside the allowlist", async () => {
    const ds = new RestDataSource({ allowedHosts: ["127.0.0.1"] });
    const definition = { id: "d", type: "rest", query: { url: via(`http://localhost:${targetPort}/`) } } as never;
    await expect(ds.execute(definition, { parameters: {}, limits } as never)).rejects.toThrow(/allowlist/);
  });
});
