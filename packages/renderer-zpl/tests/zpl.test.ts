import { describe, it, expect } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, InlineDataSource, resolveReport } from "@reporting/core";
import { ZplRenderer, ptToDots } from "../src/index.js";

async function zpl(doc: unknown) {
  const parsed = parseReportDefinition(doc);
  if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
  const registry = new DataSourceRegistry();
  registry.register(new InlineDataSource());
  const p = await resolveReport(parsed.report, { registry });
  return new ZplRenderer().render({ resolved: p.resolved, resolvePageSection: p.resolvePageSection });
}

const label = {
  schemaVersion: "1.0",
  id: "l",
  name: "L",
  print: { dpi: 203, printerType: "label", language: "zpl" },
  page: { size: "custom", width: 40, height: 25, unit: "mm", orientation: "landscape", margin: { top: 1.5, right: 2, bottom: 1.5, left: 2 } },
  sections: [
    {
      type: "detail",
      children: [
        { type: "text", value: "Sai Varaprasad", style: { fontSize: 7 } },
        { type: "barcode", value: "260100928374", symbology: "code128", height: 28 },
        { type: "qrcode", value: "ACC-1", width: 40, height: 40 },
      ],
    },
  ],
};

describe("ZplRenderer", () => {
  it("converts millimetres to printer dots deterministically (40x25mm at 203 DPI = 320x200)", async () => {
    const r = await zpl(label);
    const text = r.content as string;
    expect(text).toContain("^PW320");
    expect(text).toContain("^LL200");
    expect(ptToDots((40 / 25.4) * 72, 203)).toBe(320);
  });

  it("emits text, a Code 128 barcode and a QR code", async () => {
    const text = (await zpl(label)).content as string;
    expect(text).toMatch(/\^XA[\s\S]*\^XZ/);
    expect(text).toContain("^FDSai Varaprasad^FS");
    expect(text).toMatch(/\^BY\d+\^BCN,\d+,N,N,N\^FD260100928374\^FS/);
    expect(text).toMatch(/\^BQN,2,\d+\^FDQA,ACC-1\^FS/);
  });

  it("uses the print profile DPI (300 DPI gives more dots for the same label)", async () => {
    const text = (await zpl({ ...label, print: { dpi: 300 } })).content as string;
    expect(text).toContain("^PW472");
  });

  it("warns instead of silently dropping unsupported content", async () => {
    const r = await zpl({ ...label, sections: [{ type: "detail", children: [{ type: "image", src: "x.png" }, { type: "text", value: "తెలుగు" }] }] });
    expect(r.warnings.some((w) => w.code === "ZPL_UNSUPPORTED_COMPONENT")).toBe(true);
    expect(r.warnings.some((w) => w.code === "ZPL_NON_LATIN_TEXT")).toBe(true);
  });

  it("neutralizes ZPL control characters in data so values cannot inject commands", async () => {
    const text = (await zpl({ ...label, sections: [{ type: "detail", children: [{ type: "text", value: "A^FO0,0^FDHACK^FS" }] }] })).content as string;
    expect(text).not.toContain("^FDHACK");
  });
});
