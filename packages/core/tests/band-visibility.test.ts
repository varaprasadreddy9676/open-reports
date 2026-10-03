import { describe, expect, it } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, resolveReport } from "../src/index.js";

describe("hidden report bands", () => {
  it("omits hidden body and page bands from output while retaining them in the designer structure", async () => {
    const parsed = parseReportDefinition({
      schemaVersion: "1.0", id: "hidden", name: "Hidden",
      sections: [
        { type: "pageHeader", hidden: true, children: [{ type: "text", value: "Page heading" }] },
        { type: "reportHeader", hidden: true, children: [{ type: "text", value: "Report heading" }] },
        { type: "detail", children: [{ type: "text", value: "Visible detail" }] },
      ],
    });
    if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
    const registry = new DataSourceRegistry();
    const output = await resolveReport(parsed.report, { registry });
    expect(output.resolved.sections.some((section) => section.type === "pageHeader")).toBe(false);
    const body = output.resolved.sections.find((section) => section.type === "body")!;
    expect(body.children.some((component: any) => component.band?.sectionIndex === 1)).toBe(false);
    expect(body.children.some((component: any) => component.band?.sectionIndex === 2)).toBe(true);

    const design = await resolveReport(parsed.report, { registry, design: { ghosts: 0 } });
    expect(design.resolved.sections.some((section) => section.type === "pageHeader")).toBe(true);
    const designBody = design.resolved.sections.find((section) => section.type === "body")!;
    expect(designBody.children.find((component: any) => component.band?.sectionIndex === 1)?.band?.hiddenByRule).toBe(true);
  });

  it("preserves an explicit do-not-split band setting over the static-band default", async () => {
    const parsed = parseReportDefinition({
      schemaVersion: "1.0", id: "unsplit", name: "Unsplit",
      sections: [
        { type: "reportHeader", id: "fixed", allowSplit: false, children: [{ type: "text", value: "Fixed" }] },
        { type: "reportFooter", id: "default", children: [{ type: "text", value: "Default" }] },
      ],
    });
    if (!parsed.valid) throw new Error(JSON.stringify(parsed.issues));
    const output = await resolveReport(parsed.report, { registry: new DataSourceRegistry() });
    const body = output.resolved.sections.find((section) => section.type === "body")!;
    expect((body.children.find((component: any) => component.id === "fixed") as any).band.allowSplit).toBe(false);
    expect((body.children.find((component: any) => component.id === "default") as any).band.allowSplit).toBe(true);
  });
});
