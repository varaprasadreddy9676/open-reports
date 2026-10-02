import { describe, it, expect } from "vitest";
import { parseReportDefinition, getReportJsonSchema } from "../src/index.js";

const minimalValidReport = {
  schemaVersion: "1.0",
  id: "invoice",
  name: "Invoice",
  sections: [
    {
      type: "detail",
      children: [{ type: "text", value: "Invoice" }],
    },
  ],
};

describe("parseReportDefinition", () => {
  it("accepts a minimal valid report and applies defaults", () => {
    const result = parseReportDefinition(minimalValidReport);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.report.page.size).toBe("A4");
      expect(result.report.page.orientation).toBe("portrait");
      expect(result.report.datasets).toEqual([]);
    }
  });

  it("preserves declared dataset fields and rejects duplicate or invalid nested paths", () => {
    const report = { ...minimalValidReport, datasets: [{ id: "items", source: "inline", query: { data: [] }, schema: { kind: "array", fields: [{ path: "name", kind: "string" }, { path: "quantity", kind: "number" }] } }] };
    const parsed = parseReportDefinition(report);
    expect(parsed.valid).toBe(true);
    if (parsed.valid) expect(parsed.report.datasets[0]?.schema?.fields).toEqual(report.datasets[0]?.schema.fields);
    expect(parseReportDefinition({ ...report, datasets: [{ ...report.datasets[0], schema: { kind: "array", fields: [{ path: "name", kind: "string" }, { path: "name", kind: "number" }] } }] }).valid).toBe(false);
    expect(parseReportDefinition({ ...report, datasets: [{ ...report.datasets[0], schema: { kind: "array", fields: [{ path: "name", kind: "string" }, { path: "name.first", kind: "string" }] } }] }).valid).toBe(false);
  });

  it("rejects a non-object document", () => {
    const result = parseReportDefinition("not a report");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues[0]?.code).toBe("INVALID_DOCUMENT");
    }
  });

  it("rejects an unknown schema version gracefully", () => {
    const result = parseReportDefinition({ ...minimalValidReport, schemaVersion: "99.0" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.issues[0]?.code).toBe("UNSUPPORTED_SCHEMA_VERSION");
      expect(result.issues[0]?.message).toContain("99.0");
    }
  });

  it("rejects an unknown component type", () => {
    const result = parseReportDefinition({
      ...minimalValidReport,
      sections: [{ type: "detail", children: [{ type: "not-a-real-component" }] }],
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a table missing a required dataset", () => {
    const result = parseReportDefinition({
      ...minimalValidReport,
      sections: [{ type: "detail", children: [{ type: "table", columns: [] }] }],
    });
    expect(result.valid).toBe(false);
  });

  it("accepts nested recursive components (group inside container)", () => {
    const result = parseReportDefinition({
      ...minimalValidReport,
      sections: [
        {
          type: "detail",
          children: [
            {
              type: "container",
              children: [
                {
                  type: "group",
                  groupBy: "region",
                  header: [{ type: "text", binding: "region" }],
                  children: [{ type: "text", binding: "amount" }],
                  footer: [],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it("supports absolute layout positioning", () => {
    const result = parseReportDefinition({
      ...minimalValidReport,
      sections: [
        {
          type: "detail",
          children: [{ type: "text", layout: "absolute", x: 30, y: 40, width: 100, height: 20, value: "Hi" }],
        },
      ],
    });
    expect(result.valid).toBe(true);
  });
});

describe("getReportJsonSchema", () => {
  it("produces a JSON Schema object with the expected title", () => {
    const schema = getReportJsonSchema();
    expect(schema.title ?? (schema as any).$ref).toBeTruthy();
    expect(JSON.stringify(schema)).toContain("schemaVersion");
    expect((schema as any).definitions.ReportDefinition.properties.datasets.items.properties.schema.properties.fields.items.properties.kind.enum).toContain("array");
  });
});
