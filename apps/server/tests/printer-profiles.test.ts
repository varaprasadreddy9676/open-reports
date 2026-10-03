import { afterEach, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildApp } from "../src/app.js";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });

it("saves, lists and deletes authenticated printer profiles across a server restart", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "printer-profiles-"));
  directories.push(directory);
  const dbPath = path.join(directory, "reports.sqlite");
  const headers = { "x-api-key": "test-key" };
  const payload = { name: "Lab Zebra", print: { printerType: "label", language: "zpl", dpi: 203, safeMargin: 1.5, calibration: { scaleX: 1.008, scaleY: 1, offsetXmm: 0.5, offsetYmm: 0 } }, page: { size: "custom", width: 40, height: 25, unit: "mm", orientation: "landscape", margin: { top: 1.5, right: 2, bottom: 1.5, left: 2 } } };
  const first = buildApp({ dbPath, apiKeys: ["test-key"] });
  try {
    await first.app.ready();
    expect((await first.app.inject({ method: "GET", url: "/api/v1/printer-profiles" })).statusCode).toBe(401);
    const saved = await first.app.inject({ method: "PUT", url: "/api/v1/printer-profiles/lab-zebra", headers, payload });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ id: "lab-zebra", ...payload });
    const invalid = await first.app.inject({ method: "PUT", url: "/api/v1/printer-profiles/bad", headers, payload: { ...payload, page: { ...payload.page, width: -1 } } });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe("INVALID_PRINTER_PROFILE");
    const invalidCalibration = await first.app.inject({ method: "PUT", url: "/api/v1/printer-profiles/bad-calibration", headers, payload: { ...payload, print: { ...payload.print, calibration: { ...payload.print.calibration, scaleX: 1.5 } } } });
    expect(invalidCalibration.statusCode).toBe(400);
  } finally { await first.app.close(); }

  const second = buildApp({ dbPath, apiKeys: ["test-key"] });
  try {
    await second.app.ready();
    const listed = await second.app.inject({ method: "GET", url: "/api/v1/printer-profiles", headers });
    expect(listed.json()).toMatchObject([{ id: "lab-zebra", ...payload }]);
    expect((await second.app.inject({ method: "DELETE", url: "/api/v1/printer-profiles/lab-zebra", headers })).statusCode).toBe(204);
    expect((await second.app.inject({ method: "GET", url: "/api/v1/printer-profiles", headers })).json()).toEqual([]);
  } finally { await second.app.close(); }
});
