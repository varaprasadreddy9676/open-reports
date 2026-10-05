import { describe, it, expect } from "vitest";
import { formatCombo, matchesCombo } from "../../src/lib/shortcuts";

const key = (init: Partial<KeyboardEventInit> & { key: string; code?: string }) => ({ ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, code: "", ...init }) as KeyboardEvent;

describe("shortcut matching", () => {
  it("treats Ctrl and ⌘ as the same modifier", () => {
    expect(matchesCombo({ key: "z", mod: true }, key({ key: "z", metaKey: true }))).toBe(true);
    expect(matchesCombo({ key: "z", mod: true }, key({ key: "z", ctrlKey: true }))).toBe(true);
    expect(matchesCombo({ key: "z", mod: true }, key({ key: "z" }))).toBe(false);
  });

  it("requires the exact Shift and Alt state unless the combo allows any", () => {
    expect(matchesCombo({ key: "z", mod: true }, key({ key: "Z", metaKey: true, shiftKey: true }))).toBe(false);
    expect(matchesCombo({ key: "z", mod: true, shift: true }, key({ key: "Z", metaKey: true, shiftKey: true }))).toBe(true);
    expect(matchesCombo({ key: "ArrowLeft", shift: "any" }, key({ key: "ArrowLeft", shiftKey: true }))).toBe(true);
    expect(matchesCombo({ key: "ArrowLeft", shift: "any" }, key({ key: "ArrowLeft" }))).toBe(true);
  });

  it("matches Alt shortcuts by physical key, because ⌥A types å on a Mac", () => {
    expect(matchesCombo({ code: "KeyA", alt: true }, key({ key: "å", code: "KeyA", altKey: true }))).toBe(true);
    expect(matchesCombo({ code: "KeyA", alt: true }, key({ key: "a", code: "KeyA" }))).toBe(false);
  });

  it("matches characters that need Shift on some layouts without asking for Shift", () => {
    expect(matchesCombo({ key: "?", shift: "any" }, key({ key: "?", shiftKey: true }))).toBe(true);
  });
});

describe("shortcut labels", () => {
  it("uses Mac symbols on a Mac", () => {
    expect(formatCombo({ key: "z", mod: true, shift: true }, true)).toBe("⇧⌘Z");
    expect(formatCombo({ code: "KeyA", alt: true }, true)).toBe("⌥A");
    expect(formatCombo({ key: "ArrowUp" }, true)).toBe("↑");
  });

  it("spells modifiers out elsewhere", () => {
    expect(formatCombo({ key: "z", mod: true, shift: true }, false)).toBe("Ctrl+Shift+Z");
    expect(formatCombo({ code: "BracketRight", mod: true, alt: true }, false)).toBe("Ctrl+Alt+]");
    expect(formatCombo({ key: "Delete" }, false)).toBe("Delete");
  });
});
