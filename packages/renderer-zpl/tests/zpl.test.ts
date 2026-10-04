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

  it("applies measured ZPL scale and position without changing the media size", async () => {
    const report = { ...label, sections: [{ type: "detail", children: [{ type: "rectangle", width: 50, height: 20 }] }] };
    const base = (await zpl(report)).content as string;
    const correction = { scaleX: 1.05, scaleY: 0.95, offsetXmm: 1, offsetYmm: 0.5 };
    const calibrated = (await zpl({ ...report, print: { ...label.print, calibration: correction } })).content as string;
    const box = (text: string) => text.match(/\^FO(\d+),(\d+)\^GB(\d+),(\d+),1\^FS/)!.slice(1).map(Number);
    const [x, y, width, height] = box(base);
    const [cx, cy, correctedWidth, correctedHeight] = box(calibrated);
    expect(calibrated).toContain("^PW320\n^LL200");
    expect(cx).toBeGreaterThan(x!);
    expect(cy).toBeGreaterThan(y!);
    expect(correctedWidth).toBeGreaterThan(width!);
    expect(correctedHeight).toBeLessThan(height!);
  });

  it("warns when a calibration moves printed content beyond the media", async () => {
    const report = { ...label, print: { ...label.print, calibration: { scaleX: 1, scaleY: 1, offsetXmm: 25, offsetYmm: 0 } }, sections: [{ type: "detail", children: [{ type: "rectangle", width: 60, height: 20 }] }] };
    const result = await zpl(report);
    expect(result.warnings.some((warning) => warning.code === "ZPL_CALIBRATION_OUTSIDE_MEDIA")).toBe(true);
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

  it("rotates a whole label for the printer: 90° and 270° transform each field, 180° inverts the print", async () => {
    const wristband = {
      schemaVersion: "1.0", id: "w", name: "W",
      print: { dpi: 203, printerType: "wristband", language: "zpl", rotation: 90 },
      page: { size: "custom", width: 100, height: 25, unit: "mm", orientation: "landscape", margin: { top: 0, right: 0, bottom: 0, left: 0 } },
      sections: [{ type: "detail", layout: "absolute", children: [
        { type: "text", id: "name", value: "PATIENT", x: 10, y: 20, width: 120, height: 14, style: { fontSize: 10 } },
        { type: "barcode", id: "code", value: "123456", x: 150, y: 10, width: 120, height: 40 },
        { type: "rectangle", id: "frame", x: 5, y: 5, width: 60, height: 20 },
      ] }],
    };
    const W = ptToDots((100 / 25.4) * 72, 203);
    const H = ptToDots((25 / 25.4) * 72, 203);
    const dots = (pt: number) => Math.round((pt / 72) * 203);
    const rotated = (await zpl(wristband)).content as string;
    expect(rotated).toContain(`^PW${H}`);
    expect(rotated).toContain(`^LL${W}`);
    expect(rotated).toContain(`^FO${H - dots(20) - dots(14)},${dots(10)}^A0R,`);
    expect(rotated).toContain("^BCR,");
    expect(rotated).toContain(`^FO${H - dots(5) - dots(20)},${dots(5)}^GB${dots(20)},${dots(60)},`);
    const left = (await zpl({ ...wristband, print: { ...wristband.print, rotation: 270 } })).content as string;
    expect(left).toContain(`^FO${dots(20)},${W - dots(10) - dots(120)}^A0B,`);
    const inverted = (await zpl({ ...wristband, print: { ...wristband.print, rotation: 180 } })).content as string;
    expect(inverted).toContain("^POI");
    expect(inverted).toContain(`^PW${W}`);
    expect((await zpl(label)).content as string).not.toContain("^POI");
  });
});
