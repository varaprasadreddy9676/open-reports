import { describe, expect, it } from "vitest";
import { parseSubreportFile, subreportSources } from "../../src/lib/subreports";

const report = (id: string, name = id) => ({ schemaVersion: "1.0", id, name, sections: [] });

describe("subreport files", () => {
  it("accepts an Open Reports JSON file and returns its stable report id", () => {
    expect(parseSubreportFile(JSON.stringify(report("letterhead", "Client letterhead")))).toMatchObject({
      id: "letterhead",
      name: "Client letterhead",
    });
  });

  it("rejects JSON that is not a report definition with a useful validation message", () => {
    expect(() => parseSubreportFile('{"hello":"world"}')).toThrow(/schemaVersion|id|name/i);
  });

  it("makes attached child files available to the render pipeline, including nested files", () => {
    const nested = report("nested", "Nested child");
    const child = { ...report("child", "Reusable header"), subreports: { nested } };
    expect(subreportSources({ subreports: { child } } as any)).toEqual({
      child: { report: expect.objectContaining({ id: "child" }) },
      nested: { report: expect.objectContaining({ id: "nested" }) },
    });
  });
});
