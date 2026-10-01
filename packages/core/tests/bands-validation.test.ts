import { describe, it, expect } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { validateReport } from "../src/index.js";

const v = (extra: object) => {
  const p = parseReportDefinition({ schemaVersion: "1.0", id: "v", name: "v", datasets: [{ id: "d", source: "inline", query: { data: [] } }], ...extra });
  if (!p.valid) throw new Error(JSON.stringify(p.issues));
  return validateReport(p.report).issues.map((i) => i.code);
};

describe("band validation", () => {
  it("accepts a well-formed grouped report", () => {
    expect(v({ groups: [{ id: "g", dataset: "d", by: "row.x" }], sections: [{ type: "groupHeader", groupId: "g", children: [] }, { type: "detail", dataset: "d", children: [] }, { type: "groupFooter", groupId: "g", children: [] }] })).toEqual([]);
  });
  it("flags unknown groups, bad parents, duplicate band ids, bad expressions, misplaced options", () => {
    expect(v({ sections: [{ type: "groupHeader", groupId: "nope", children: [] }] })).toContain("UNKNOWN_GROUP");
    expect(v({ sections: [{ type: "child", parent: "ghost", children: [] }] })).toContain("UNKNOWN_PARENT_BAND");
    expect(v({ sections: [{ type: "detail", id: "a", children: [] }, { type: "detail", id: "a", children: [] }] })).toContain("DUPLICATE_ID");
    expect(v({ groups: [{ id: "g", by: "row.(" }], sections: [] })).toContain("INVALID_EXPRESSION");
    expect(v({ sections: [{ type: "pageHeader", dataset: "d", children: [] }] })).toContain("PAGE_BAND_WITH_DATA");
    expect(v({ sections: [{ type: "detail", repeatEveryPage: true, children: [] }] })).toContain("REPEAT_ON_NON_GROUP_HEADER");
    expect(v({ groups: [{ id: "g", by: "row.x" }], sections: [{ type: "detail", children: [] }] })).toContain("UNUSED_GROUP");
  });
  it("unknown datasets on groups are reported", () => {
    expect(v({ groups: [{ id: "g", dataset: "zzz", by: "row.x" }], sections: [{ type: "groupHeader", groupId: "g", children: [] }] })).toContain("UNKNOWN_DATASET");
  });
});
