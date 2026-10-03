import { describe, expect, it } from "vitest";
import { canvasFontStack } from "../../src/lib/fonts";

const caps = {
  formats: [], fonts: ["Noto Sans", "Noto Sans Telugu"], defaultFont: "Noto Sans",
  scriptFonts: { telugu: "Noto Sans Telugu" }, secrets: [],
};

describe("canvas font stack", () => {
  it("uses the PDF default and includes installed script faces", () => {
    expect(canvasFontStack(caps)).toBe('"Noto Sans", "Noto Sans Telugu", "Helvetica", "Arial", sans-serif');
  });

  it("resolves installed names case-insensitively and rejects a browser-only family", () => {
    expect(canvasFontStack(caps, "noto sans telugu").startsWith('"Noto Sans Telugu"')).toBe(true);
    expect(canvasFontStack(caps, "Browser-only").startsWith('"Noto Sans"')).toBe(true);
    expect(canvasFontStack(undefined)).toBe('"Helvetica", "Arial", sans-serif');
    expect(canvasFontStack({ ...caps, fonts: ["Noto Sans Telugu"], defaultFont: null })).toBe('"Helvetica", "Noto Sans Telugu", "Arial", sans-serif');
  });
});
