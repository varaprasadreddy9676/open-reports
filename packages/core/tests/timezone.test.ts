import { describe, expect, it } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, formatValue, resolveReport, validateReport } from "../src/index.js";
import { sectionChildren } from "./helpers.js";

function report(theme: Record<string, unknown>) {
  const parsed = parseReportDefinition({
    schemaVersion: "1.0", id: "tz", name: "Time zones", theme,
    sections: [{ type: "detail", children: [
      { type: "field", id: "formatted", expression: "\"2025-01-15T22:30:00Z\"", format: "date:yyyy-MM-dd HH:mm" },
      { type: "text", id: "expression", expression: "formatDate(\"2025-01-15T22:30:00Z\", \"dd MMM HH:mm\")" },
    ] }],
  });
  if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
  return parsed.report;
}

describe("theme.timezone", () => {
  it("drives date formats and formatDate()", async () => {
    const out = await resolveReport(report({ timezone: "Asia/Kolkata" }), { registry: new DataSourceRegistry() });
    const [field, text] = sectionChildren(out.resolved, 0) as any[];
    expect(field.text).toBe("2025-01-16 04:00");
    expect(text.text).toBe("16 Jan 04:00");
  });
  it("formatValue accepts a time zone", () => {
    expect(formatValue("2025-01-15T22:30:00Z", "date:yyyy-MM-dd HH:mm", { locale: "en-US", currency: "USD", timeZone: "America/Los_Angeles" })).toBe("2025-01-15 14:30");
  });
  it("formats Jasper numeric patterns with or without grouping", () => {
    expect(formatValue(1250, "number:2:plain", { locale: "en-US", currency: "USD" })).toBe("1250.00");
    expect(formatValue(1250, "number:2:group", { locale: "en-US", currency: "USD" })).toBe("1,250.00");
  });
  it("rejects an unknown time zone", () => {
    const { issues } = validateReport(report({ timezone: "Mars/Olympus" }));
    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "UNKNOWN_TIMEZONE", path: "theme.timezone" })]));
  });
});
