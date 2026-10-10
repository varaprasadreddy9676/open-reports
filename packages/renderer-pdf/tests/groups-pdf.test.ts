import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, InlineDataSource, resolveReport } from "@reporting/core";
import { PdfRenderer } from "../src/render.js";
import { extractPdfPages } from "./pdf-helpers.js";

const registry = new DataSourceRegistry();
registry.register(new InlineDataSource());
const example = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../examples/department-report.report.json"), "utf-8"));

async function render(doc: any) {
  const p = parseReportDefinition(doc);
  if (!p.valid) throw new Error(JSON.stringify(p.issues));
  const r = await resolveReport(p.report, { registry, parameters: {} });
  const res = await new PdfRenderer().render({ resolved: r.resolved, resolvePageSection: r.resolvePageSection });
  return extractPdfPages(res.content as Buffer);
}

describe("banded report in a real PDF", () => {
  it("prints every visit once, headers per group, a repeated department header on continuation pages, page numbers and one grand total", async () => {
    const pages = await render(example);
    const text = pages.join("\n");
    expect(pages.length).toBeGreaterThan(2);
    expect((text.match(/Patient \d{3}/g) ?? []).length).toBe(90);
    for (const d of ["Cardiology", "Orthopaedics", "Paediatrics"]) expect(text).toContain(`Department: ${d}`);
    expect((text.match(/GRAND TOTAL/g) ?? []).length).toBe(1);
    expect((text.match(/Department total/g) ?? []).length).toBe(3);
    pages.forEach((p, i) => expect(p).toContain(`Page ${i + 1} of ${pages.length}`));
    // a department that spans pages shows its header again at the top of the continuation page
    const repeated = pages.slice(1).filter((p) => /^\s*NORTHSTAR MEDICAL CENTER\s+Department Revenue\s+Department: /.test(p));
    expect(repeated.length).toBeGreaterThan(0);
  });

  it("0, 1 and many records: no-data band, single group, many groups", async () => {
    const withData = (data: unknown[]) => ({ ...example, datasets: [{ id: "visits", source: "inline", query: { data } }] });
    expect((await render(withData([]))).join("\n")).toContain("No visits in the selected period.");
    const one = (await render(withData([{ dept: "Cardiology", doctor: "Dr. Rao", patient: "Solo", uhid: "U1", amount: 500, note: "" }]))).join("\n");
    expect(one).toContain("Solo");
    expect(one).not.toContain("No visits");
    for (const n of [29, 30, 31, 60, 61]) {
      const data = Array.from({ length: n }, (_, i) => ({ dept: i % 2 ? "A" : "B", doctor: "D", patient: `Pt ${String(i).padStart(3, "0")}`, uhid: `U${i}`, amount: 100, note: "" }));
      const t = (await render(withData(data))).join("\n");
      expect((t.match(/Pt \d{3}/g) ?? []).length, `n=${n}`).toBe(n);
    }
  }, 120_000);
});
