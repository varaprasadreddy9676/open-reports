import { describe, expect, it } from "vitest";
import { findPageTextMatch } from "../../src/lib/pdf-text-search";

describe("PDF text search", () => {
  it("maps a phrase over separate text items", () => {
    expect(findPageTextMatch(["Patient", "", "Asha Rao"], "patient asha")).toEqual({
      excerpt: "Patient Asha Rao",
      segments: [{ item: 0, start: 0, end: 7 }, { item: 2, start: 0, end: 4 }],
    });
  });

  it("finds words divided within an item boundary", () => {
    expect(findPageTextMatch(["PRE", "VIEW MARKER"], "PREVIEW")).toEqual({
      excerpt: "PREVIEW MARKER",
      segments: [{ item: 0, start: 0, end: 3 }, { item: 1, start: 0, end: 4 }],
    });
  });

  it("returns no match for an empty or absent query", () => {
    expect(findPageTextMatch(["Patient"], " ")).toBeUndefined();
    expect(findPageTextMatch(["Patient"], "Doctor")).toBeUndefined();
  });
});
