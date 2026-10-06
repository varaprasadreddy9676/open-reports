import { afterEach, describe, expect, it, vi } from "vitest";
import { renderReport } from "../src/client.js";

describe("renderReport", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts the host-owned definition and data to the inline render endpoint", async () => {
    const report = { schemaVersion: "1.0", id: "invoice", sections: [] };
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(["pdf"]), { status: 200, headers: { "content-type": "application/pdf" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await renderReport({ server: "https://reports.example.com", apiKey: "server-key" }, {
      report,
      format: "pdf",
      data: { invoice: { number: "INV-1042" } },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://reports.example.com/api/v1/render");
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(request.headers).toEqual({ "content-type": "application/json", "x-api-key": "server-key" });
    expect(JSON.parse(String(request.body))).toEqual({ report, format: "pdf", data: { invoice: { number: "INV-1042" } } });
    expect(result).toBeInstanceOf(Blob);
  });
});
