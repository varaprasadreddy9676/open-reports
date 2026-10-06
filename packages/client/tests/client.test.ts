import { describe, expect, it } from "vitest";
import { OpenReportsClient } from "../src/index.js";

describe("inline rendering with shared subreports", () => {
  it("sends a reusable child definition with each parent render", async () => {
    const requests: any[] = [];
    const client = new OpenReportsClient({
      server: "https://reports.example.test",
      fetch: async (_input, init) => {
        requests.push(JSON.parse(String(init?.body)));
        return new Response(new Uint8Array([37, 80, 68, 70]), {
          headers: { "content-type": "application/pdf", "x-render-id": "render-1" },
        });
      },
    });
    const sharedHeader = { schemaVersion: "1.0", id: "tenant-header-v7", sections: [] };
    const subreports = { "tenant-header-v7": { report: sharedHeader } };

    await client.renderInline({ report: { id: "invoice" }, format: "pdf", subreports });
    await client.renderInline({ report: { id: "receipt" }, format: "pdf", subreports });

    expect(requests).toHaveLength(2);
    expect(requests.map((body) => body.report.id)).toEqual(["invoice", "receipt"]);
    expect(requests.map((body) => body.subreports["tenant-header-v7"].report.id)).toEqual(["tenant-header-v7", "tenant-header-v7"]);
  });
});
