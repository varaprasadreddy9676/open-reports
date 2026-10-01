import { sectionChildren } from "./helpers.js";
import { describe, it, expect } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, InlineDataSource, resolveReport } from "../src/index.js";

const registry = new DataSourceRegistry();
registry.register(new InlineDataSource());

function report(sheet: Record<string, unknown>) {
  return {
    schemaVersion: "1.0",
    id: "s",
    name: "s",
    datasets: [{ id: "p", source: "inline", query: { data: Array.from({ length: 9 }, (_, i) => ({ n: `P${i + 1}` })) } }],
    sections: [{ type: "detail", children: [{ type: "labelSheet", columns: 2, rows: 2, labelWidth: 50, labelHeight: 30, children: [{ type: "text", binding: "row.n" }], ...sheet }] }],
  };
}

async function sheets(sheet: Record<string, unknown>) {
  const parsed = parseReportDefinition(report(sheet));
  if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
  const { resolved } = await resolveReport(parsed.report, { registry, parameters: {} });
  return sectionChildren(resolved, 0);
}

const texts = (sheet: any) => sheet.children.map((l: any) => l.children[0]?.text);

describe("labelSheet", () => {
  it("fills one label per record, 4 per sheet, starting a new page for each sheet", async () => {
    const s = await sheets({ dataset: "p" });
    expect(s).toHaveLength(3);
    expect(texts(s[0])).toEqual(["P1", "P2", "P3", "P4"]);
    expect(texts(s[2])).toEqual(["P9"]);
    expect(s[0].pageBreakBefore).toBe(false);
    expect(s[1].pageBreakBefore).toBe(true);
  });

  it("places labels on exact mm cells with gaps", async () => {
    const s = await sheets({ dataset: "p", gapX: 5, gapY: 2 });
    const mm = 72 / 25.4;
    expect(s[0].children[1].x).toBeCloseTo(55 * mm, 3);
    expect(s[0].children[2].y).toBeCloseTo(32 * mm, 3);
    expect(s[0].children[0].width).toBeCloseTo(50 * mm, 3);
  });

  it("skips used positions with startPosition", async () => {
    const s = await sheets({ dataset: "p", startPosition: 3 });
    expect(texts(s[0])).toEqual(["P1", "P2"]);
    expect(s[0].children[0].x).toBeCloseTo(0, 3);
    expect(s[0].children[0].y).toBeGreaterThan(0); // third cell = second row
  });

  it("repeats one label when there is no dataset", async () => {
    const s = await sheets({ copies: 6, children: [{ type: "text", value: "X" }] });
    expect(s).toHaveLength(2);
    expect(s[0].children).toHaveLength(4);
    expect(s[1].children).toHaveLength(2);
  });
});
