import { describe, it, expect } from "vitest";
import { coerceParameter, initialParameters } from "../src/params.js";
import { isEmbedMessage, PROTOCOL } from "../src/protocol.js";

describe("parameter values from form fields", () => {
  it("converts numbers and booleans, and leaves blanks out", () => {
    expect(coerceParameter({ id: "n", type: "number" }, "12.5")).toBe(12.5);
    expect(coerceParameter({ id: "n", type: "number" }, "")).toBeUndefined();
    expect(coerceParameter({ id: "n", type: "number" }, "abc")).toBeUndefined();
    expect(coerceParameter({ id: "b", type: "boolean" }, "true")).toBe(true);
    expect(coerceParameter({ id: "b", type: "boolean" }, "false")).toBe(false);
  });

  it("keeps dates and text as strings, and parses JSON for lists and objects", () => {
    expect(coerceParameter({ id: "d", type: "date" }, "2026-10-05")).toBe("2026-10-05");
    expect(coerceParameter({ id: "s", type: "string" }, "Ward 4")).toBe("Ward 4");
    expect(coerceParameter({ id: "a", type: "array" }, "[1,2]")).toEqual([1, 2]);
    expect(coerceParameter({ id: "a", type: "array" }, "not json")).toBeUndefined();
  });

  it("keeps enum values in their declared type", () => {
    expect(coerceParameter({ id: "e", type: "enum", enumValues: [1, 2, 3] }, "2")).toBe(2);
    expect(coerceParameter({ id: "e", type: "enum", enumValues: ["A", "B"] }, "B")).toBe("B");
  });

  it("starts from the report's defaults, overridden by values the host page passed", () => {
    const defs = [{ id: "from", type: "date" as const, default: "2026-01-01" }, { id: "ward", type: "string" as const }];
    expect(initialParameters(defs, { ward: "4" })).toEqual({ from: "2026-01-01", ward: "4" });
  });
});

describe("message protocol", () => {
  it("accepts only well-formed Open Reports messages", () => {
    expect(isEmbedMessage({ protocol: PROTOCOL, type: "ready" })).toBe(true);
    expect(isEmbedMessage({ protocol: "other", type: "ready" })).toBe(false);
    expect(isEmbedMessage({ type: "ready" })).toBe(false);
    expect(isEmbedMessage("ready")).toBe(false);
    expect(isEmbedMessage(null)).toBe(false);
  });
});
