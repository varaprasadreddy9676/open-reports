import { describe, expect, it } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { checkDatasetShape, DataSourceRegistry, InlineDataSource, resolveReport, shapeIssueMessage } from "../src/index.js";

const shape = {
  kind: "array" as const,
  fields: [
    { path: "id", kind: "number" as const },
    { path: "customer.email", kind: "string" as const },
    { path: "lines", kind: "array" as const },
    { path: "lines.sku", kind: "string" as const },
    { path: "placed", kind: "date" as const },
  ],
};

const order = (index: number) => ({ id: index, customer: { email: `c${index}@x.io` }, lines: [{ sku: "A" }, { sku: "B" }], placed: "2026-01-02" });

describe("checkDatasetShape (full response)", () => {
  it("checks every row and every nested item, not a sample", () => {
    const rows = Array.from({ length: 5000 }, (_, index) => order(index));
    rows[4321]!.customer = {} as never;
    rows[4999]!.lines[1] = { sku: 7 } as never;
    const result = checkDatasetShape(shape, rows);
    expect(result).toMatchObject({ state: "checked", totalRows: 5000, checkedRows: 5000, complete: true });
    expect(result.issues.map((issue) => [issue.code, issue.path, issue.count, issue.examples])).toEqual([
      ["MISSING_FIELD", "customer.email", 1, ["row 4322"]],
      ["FIELD_KIND", "lines.sku", 1, ["row 5000 lines[2]"]],
    ]);
  });

  it("groups repeated problems with counts and at most three examples", () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({ ...order(index), id: String(index) }));
    const [issue] = checkDatasetShape(shape, rows).issues;
    expect(issue).toMatchObject({ code: "FIELD_KIND", path: "id", expected: "number", actual: "string", count: 50, examples: ["row 1", "row 2", "row 3"] });
    expect(shapeIssueMessage(issue!)).toBe("id: expected number, got string at row 1 (50 values).");
  });

  it("reports when a work budget stops the check early instead of claiming success", () => {
    const rows = Array.from({ length: 100 }, (_, index) => order(index));
    const result = checkDatasetShape(shape, rows, { maxVisits: 50 });
    expect(result.complete).toBe(false);
    expect(result.checkedRows).toBeLessThan(100);
  });

  it("flags a root of the wrong kind", () => {
    expect(checkDatasetShape(shape, { id: 1 }).issues[0]).toMatchObject({ code: "ROOT_KIND", expected: "list of records", actual: "object" });
  });
});

function report(onMismatch?: "warn" | "error") {
  const rows = [order(1), { ...order(2), customer: null }, { ...order(3), id: "three" }];
  const parsed = parseReportDefinition({
    schemaVersion: "1.0", id: "contract", name: "Contract",
    datasets: [{ id: "orders", source: "inline", query: { data: rows }, schema: { ...shape, ...(onMismatch ? { onMismatch } : {}) } }],
    sections: [{ type: "detail", children: [{ type: "text", value: "x" }] }],
  });
  if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
  return parsed.report;
}

describe("declared dataset contracts at render time", () => {
  const registry = new DataSourceRegistry();
  registry.register(new InlineDataSource());

  it("warns by default with a summary of the full response", async () => {
    const out = await resolveReport(report(), { registry });
    expect(out.issues).toEqual([]);
    const warning = out.resolved.warnings.find((w) => w.code === "DATASET_SHAPE_MISMATCH");
    expect(warning).toMatchObject({ path: "datasets.orders" });
    expect(warning!.message).toContain("orders does not match its declared fields (checked 3 of 3 rows)");
    expect(warning!.message).toContain("id: expected number, got string at row 3.");
  });

  it("fails the render when the dataset contract is strict", async () => {
    const out = await resolveReport(report("error"), { registry });
    expect(out.issues).toEqual([expect.objectContaining({ severity: "error", code: "DATASET_SHAPE_MISMATCH", path: "datasets.orders" })]);
  });
});
