// Performance benchmarks. Run after `pnpm build`:  node scripts/bench.mjs [--quick]
// Writes benchmarks/results.json and prints a table. Numbers depend on the machine; the point is to catch regressions.
import { writeFileSync, mkdirSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, InlineDataSource, resolveReport } from "@reporting/core";
import { PdfRenderer } from "@reporting/renderer-pdf";
import { XlsxRenderer } from "@reporting/renderer-xlsx";
import { CsvRenderer } from "@reporting/renderer-csv";
import { HtmlRenderer } from "@reporting/renderer-html";

const quick = process.argv.includes("--quick");
const registry = new DataSourceRegistry();
registry.register(new InlineDataSource());

const report = (n) => ({
  schemaVersion: "1.0", id: "bench", name: "Bench",
  datasets: [{ id: "d", source: "inline", query: { data: Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Customer ${i % 997}`, region: ["N", "S", "E", "W"][i % 4], qty: (i % 13) + 1, price: 10 + (i % 90), date: "2025-01-15" })) } }],
  sections: [
    { type: "pageHeader", children: [{ type: "text", value: "Benchmark" }] },
    { type: "detail", children: [{ type: "table", dataset: "d", showFooter: true, columns: [
      { id: "id", header: "#", binding: "row.id", width: 50 },
      { id: "name", header: "Customer", binding: "row.name", width: "*" },
      { id: "region", header: "Region", binding: "row.region", width: 50 },
      { id: "qty", header: "Qty", binding: "row.qty", width: 40, align: "right" },
      { id: "amount", header: "Amount", expression: "row.qty * row.price", format: "currency", width: 80, align: "right", footer: { aggregate: "sum" } },
    ] }] },
    { type: "pageFooter", children: [{ type: "text", expression: '"Page " + page.number + " of " + page.total' }] },
  ],
});

async function resolve(n) {
  const parsed = parseReportDefinition(report(n));
  if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
  return resolveReport(parsed.report, { registry, parameters: {}, maxRows: 1_000_000 });
}

const results = [];
async function bench(name, rows, fn) {
  global.gc?.();
  const mem0 = process.memoryUsage().rss;
  const t0 = performance.now();
  const bytes = await fn();
  const ms = performance.now() - t0;
  const peakMb = Math.round((process.memoryUsage().rss - mem0) / 1048576);
  const row = { name, rows, ms: Math.round(ms), rowsPerSec: Math.round(rows / (ms / 1000)), outputKb: Math.round(bytes / 1024), rssDeltaMb: peakMb };
  results.push(row);
  console.log(`${name.padEnd(34)} ${String(rows).padStart(7)} rows  ${String(row.ms).padStart(7)} ms  ${String(row.rowsPerSec).padStart(8)} rows/s  ${String(row.outputKb).padStart(7)} KB  +${peakMb} MB rss`);
}
const size = (c) => (typeof c === "string" ? Buffer.byteLength(c) : c.length);

const sizes = quick ? { xl1: 2_000, xl2: 10_000, csv: 20_000, pdf: 500, html: 2_000 } : { xl1: 10_000, xl2: 100_000, csv: 100_000, pdf: 2_000, html: 10_000 };

for (const [label, n, Renderer] of [
  [`resolve + XLSX`, sizes.xl1, XlsxRenderer], [`resolve + XLSX`, sizes.xl2, XlsxRenderer],
  [`resolve + CSV`, sizes.csv, CsvRenderer], [`resolve + HTML`, sizes.html, HtmlRenderer], [`resolve + PDF`, sizes.pdf, PdfRenderer],
]) {
  await bench(label, n, async () => {
    const p = await resolve(n);
    const r = await new Renderer().render({ resolved: p.resolved, resolvePageSection: p.resolvePageSection });
    return size(r.content);
  });
}

// concurrency: N simultaneous 500-row PDFs
for (const c of quick ? [4] : [4, 16]) {
  await bench(`concurrent PDFs x${c} (500 rows)`, 500 * c, async () => {
    const outs = await Promise.all(Array.from({ length: c }, async () => {
      const p = await resolve(500);
      return (await new PdfRenderer().render({ resolved: p.resolved, resolvePageSection: p.resolvePageSection })).content.length;
    }));
    return outs.reduce((a, b) => a + b, 0);
  });
}

mkdirSync("../../benchmarks", { recursive: true });
writeFileSync("../../benchmarks/results.json", JSON.stringify({ node: process.version, platform: process.platform, quick, at: new Date().toISOString(), results }, null, 2));
console.log("\nwrote benchmarks/results.json");
