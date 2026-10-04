import { describe, expect, it } from "vitest";
import { defaultTextMeasurer } from "../src/measure.js";
import { layoutComponent, textVerticalOffset } from "../src/box-layout.js";

const text = (style: Record<string, unknown>, height?: number) =>
  layoutComponent({ type: "text", text: "One line", style, ...(height ? { height } : {}) } as any, { x: 0, y: 0, width: 200, height: 1000 }, defaultTextMeasurer);

describe("textVerticalOffset", () => {
  it("records the measured line count", () => {
    expect(text({})!.textMetrics).toMatchObject({ lines: 1 });
  });
  it("is zero for top alignment and for boxes that hug their text", () => {
    expect(textVerticalOffset(text({}, 60))).toBe(0);
    expect(textVerticalOffset(text({ verticalAlign: "middle" }))).toBe(0);
  });
  it("centres or bottom-aligns the lines inside the padded box", () => {
    const middle = text({ verticalAlign: "middle", padding: 4 }, 60);
    const lineHeight = middle.textMetrics!.lineHeight;
    expect(textVerticalOffset(middle)).toBeCloseTo((60 - 8 - lineHeight) / 2, 5);
    expect(textVerticalOffset(text({ verticalAlign: "bottom", padding: 4 }, 60))).toBeCloseTo(60 - 8 - lineHeight, 5);
  });
  it("never moves text up when it overflows its box", () => {
    expect(textVerticalOffset(text({ verticalAlign: "bottom" }, 4))).toBe(0);
  });
});
