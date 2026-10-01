import { sectionChildren } from "./helpers.js";
import { describe, it, expect } from "vitest";
import { parseReportDefinition } from "@reporting/schema";
import { DataSourceRegistry, InlineDataSource, resolveReport } from "../src/index.js";
import type { ResolvedTableComponent, ResolvedTextComponent, ResolvedGroupComponent } from "../src/resolved-report.js";

function registry() {
  const r = new DataSourceRegistry();
  r.register(new InlineDataSource());
  return r;
}

const invoiceReport = {
  schemaVersion: "1.0",
  id: "invoice",
  name: "Invoice",
  parameters: [{ id: "invoiceId", type: "number", required: true }],
  datasets: [
    {
      id: "items",
      source: "inline",
      query: {
        data: [
          { description: "Eye Examination", quantity: 2, price: 500 },
          { description: "Frame", quantity: 1, price: 1500 },
        ],
      },
    },
  ],
  sections: [
    {
      type: "pageHeader",
      children: [{ type: "text", expression: '"Invoice #" + params.invoiceId' }],
    },
    {
      type: "detail",
      children: [
        {
          type: "table",
          dataset: "items",
          showFooter: true,
          columns: [
            { id: "description", header: "Description", binding: "row.description" },
            { id: "quantity", header: "Qty", binding: "row.quantity" },
            {
              id: "amount",
              header: "Amount",
              expression: "row.quantity * row.price",
              format: "currency",
              footer: { aggregate: "sum", label: "Total" },
            },
          ],
        },
      ],
    },
  ],
};

describe("resolveReport (full pipeline)", () => {
  it("resolves parameters, datasets, expressions and table totals end to end", async () => {
    const parsed = parseReportDefinition(invoiceReport);
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;

    const { resolved, issues } = await resolveReport(parsed.report, {
      registry: registry(),
      parameters: { invoiceId: 1001 },
    });

    expect(issues).toEqual([]);

    const header = sectionChildren(resolved, 0)[0] as ResolvedTextComponent;
    expect(header.text).toBe("Invoice #1001");

    const table = sectionChildren(resolved, 1)[0] as ResolvedTableComponent;
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]!.raw.amount).toBe(1000);
    expect(table.rows[0]!.formatted.amount).toBe("$1,000.00");
    expect(table.rows[1]!.raw.amount).toBe(1500);

    const amountColumn = table.columns.find((c) => c.id === "amount")!;
    expect(amountColumn.footer?.value).toBe("$2,500.00");
  });

  it("produces a validation-style error when a required parameter is missing", async () => {
    const parsed = parseReportDefinition(invoiceReport);
    if (!parsed.valid) throw new Error("fixture should be schema-valid");

    const { issues } = await resolveReport(parsed.report, { registry: registry(), parameters: {} });
    expect(issues.some((i) => i.code === "MISSING_REQUIRED_PARAMETER")).toBe(true);
  });

  it("hides a repeated item when visibleWhen is false for that row, keeps it when true", async () => {
    const withRepeater = {
      ...invoiceReport,
      sections: [
        ...invoiceReport.sections.slice(0, 1),
        {
          type: "detail",
          children: [
            {
              type: "repeater",
              dataset: "items",
              children: [{ type: "text", visibleWhen: "row.quantity > 1", binding: "row.description" }],
            },
          ],
        },
      ],
    };
    const parsed = parseReportDefinition(withRepeater);
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;
    const { resolved } = await resolveReport(parsed.report, { registry: registry(), parameters: { invoiceId: 1 } });
    const repeater = sectionChildren(resolved, 1)[0] as any;
    // Only "Eye Examination" has quantity 2 (> 1); "Frame" has quantity 1 and is hidden.
    expect(repeater.children).toHaveLength(1);
    expect(repeater.children[0].text).toBe("Eye Examination");
  });
});

describe("resolveReport grouping and variables", () => {
  const groupedReport = {
    schemaVersion: "1.0",
    id: "sales",
    name: "Sales",
    parameters: [],
    datasets: [
      {
        id: "sales",
        source: "inline",
        query: {
          data: [
            { region: "South", city: "Bangalore", amount: 20000 },
            { region: "South", city: "Chennai", amount: 15000 },
            { region: "North", city: "Delhi", amount: 25000 },
          ],
        },
      },
    ],
    variables: [{ id: "groupTotal", scope: "group", expression: 'sumBy(data.sales, "amount")' }],
    sections: [
      {
        type: "detail",
        children: [
          {
            type: "group",
            dataset: "sales",
            groupBy: "row.region",
            header: [{ type: "text", binding: "row.region" }],
            children: [{ type: "text", binding: "row.city" }],
            footer: [{ type: "text", expression: "vars.groupTotal" }],
          },
        ],
      },
    ],
  };

  it("groups rows and computes group-scoped variables over only that group's rows", async () => {
    const parsed = parseReportDefinition(groupedReport);
    expect(parsed.valid).toBe(true);
    if (!parsed.valid) return;

    const { resolved } = await resolveReport(parsed.report, { registry: registry(), parameters: {} });
    const group = sectionChildren(resolved, 0)[0] as ResolvedGroupComponent;
    expect(group.groups).toHaveLength(2);

    const south = group.groups.find((g) => g.key === "South")!;
    expect(south.children).toHaveLength(2);
    expect((south.footer[0] as ResolvedTextComponent).text).toBe("35000");

    const north = group.groups.find((g) => g.key === "North")!;
    expect((north.footer[0] as ResolvedTextComponent).text).toBe("25000");
  });
});

describe("nested dataset paths", () => {
  it("lets a table bind to an array nested inside an object dataset", async () => {
    const parsed = parseReportDefinition({
      schemaVersion: "1.0",
      id: "n",
      name: "N",
      datasets: [{ id: "invoice", source: "inline", query: { data: { number: "A1", items: [{ d: "x" }, { d: "y" }] } } }],
      sections: [{ type: "detail", children: [{ type: "table", dataset: "invoice.items", columns: [{ id: "d", header: "D", binding: "row.d" }] }] }],
    });
    if (!parsed.valid) throw new Error("invalid");
    const { resolved } = await resolveReport(parsed.report, { registry: registry(), parameters: {} });
    const table = sectionChildren(resolved, 0)[0] as ResolvedTableComponent;
    expect(table.rows).toHaveLength(2);
  });
});

describe("hidden, empty states and reusable fragments", () => {
  const base = {
    schemaVersion: "1.0",
    id: "x",
    name: "X",
    datasets: [{ id: "none", source: "inline", query: { data: [] } }],
  };

  it("never renders a hidden component", async () => {
    const parsed = parseReportDefinition({ ...base, sections: [{ type: "detail", children: [{ type: "text", value: "shown" }, { type: "text", value: "secret", hidden: true }] }] });
    if (!parsed.valid) throw new Error("invalid");
    const { resolved } = await resolveReport(parsed.report, { registry: registry() });
    expect(sectionChildren(resolved, 0).map((c: any) => c.text)).toEqual(["shown"]);
  });

  it("table empty state: hide, message, or headers only", async () => {
    const mk = (emptyState?: string) =>
      parseReportDefinition({ ...base, sections: [{ type: "detail", children: [{ type: "table", dataset: "none", emptyState, emptyMessage: "Nothing here", columns: [{ id: "a", header: "A", binding: "row.a" }] }] }] });
    const run = async (es?: string) => {
      const p = mk(es);
      if (!p.valid) throw new Error("invalid");
      return sectionChildren((await resolveReport(p.report, { registry: registry() })).resolved, 0);
    };
    expect(await run("hide")).toHaveLength(0);
    expect((await run("message"))[0].text).toBe("Nothing here");
    expect((await run("headers"))[0].type).toBe("table");
    expect((await run())[0].type).toBe("table");
  });

  it("inlines a reusable fragment and warns about an unknown one", async () => {
    const parsed = parseReportDefinition({
      ...base,
      fragments: [{ id: "letterhead", children: [{ type: "text", value: "ACME" }] }],
      sections: [{ type: "detail", children: [{ type: "fragment", ref: "letterhead" }, { type: "fragment", ref: "missing" }] }],
    });
    if (!parsed.valid) throw new Error("invalid");
    const { resolved } = await resolveReport(parsed.report, { registry: registry() });
    const first = sectionChildren(resolved, 0)[0] as any;
    expect(first.children[0].text).toBe("ACME");
    expect(resolved.warnings.some((w) => w.code === "UNKNOWN_FRAGMENT")).toBe(true);
  });

  it("tolerant mode turns a broken binding into a visible placeholder instead of failing the report", async () => {
    const parsed = parseReportDefinition({ ...base, sections: [{ type: "detail", children: [{ type: "text", id: "bad", binding: "data.nope.field" }, { type: "text", value: "ok" }] }] });
    if (!parsed.valid) throw new Error("invalid");
    await expect(resolveReport(parsed.report, { registry: registry() })).rejects.toThrow();
    const { resolved } = await resolveReport(parsed.report, { registry: registry(), tolerant: true });
    expect((sectionChildren(resolved, 0)[0] as any).text).toContain("⚠");
    expect(resolved.warnings.find((w) => w.code === "COMPONENT_ERROR")?.componentId).toBe("bad");
  });
});
