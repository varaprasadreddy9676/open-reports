import { describe, expect, it } from "vitest";
import { decodeEscPos } from "../../src/lib/escpos-preview";

describe("ESC/POS roll preview decoder", () => {
  it("shows text, QR and barcode markers while skipping printer commands", () => {
    const bytes = Uint8Array.from([
      0x1b, 0x40, 0x1b, 0x74, 16, 0x1b, 0x61, 1, 0x1b, 0x45, 1,
      ...new TextEncoder().encode("STORE\n"),
      0x1d, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30, 0x0a,
      0x1d, 0x6b, 0x49, 5, 0x7b, 0x42, 0x31, 0x32, 0x33, 0x0a,
      0x0a, 0x1d, 0x56, 0x42, 0x00,
    ]);
    expect(decodeEscPos(bytes)).toEqual({ text: "STORE\n[QR code]\n[Barcode: 123]\n", lines: 4, cuts: 1 });
  });

  it("retains every line of a long receipt", () => {
    const rows = Array.from({ length: 500 }, (_, i) => `Item${String(i).padStart(4, "0")}  10.00`).join("\n") + "\n";
    const bytes = Uint8Array.from([...new TextEncoder().encode(rows), 0x1d, 0x56, 0x42, 0x00]);
    const decoded = decodeEscPos(bytes);
    expect(decoded.lines).toBe(500);
    expect(decoded.text).toContain("Item0000");
    expect(decoded.text).toContain("Item0499");
    expect(decoded.cuts).toBe(1);
  });
});
