import { describe, expect, it } from "vitest";
import fs from "node:fs";
import JSZip from "jszip";
import { exportJrxml } from "../../src/lib/jrxml-export";
import { createJrxmlPackage } from "../../src/lib/jrxml-export";

describe("exportJrxml", () => {
  it("exports a simple JasperReports 6 report with page setup, static text and bound fields", () => {
    const result = exportJrxml({
      id: "invoice-demo",
      name: "Invoice & receipt",
      page: { size: "A4", orientation: "portrait", unit: "mm", margin: { top: 10, right: 12, bottom: 10, left: 12 } },
      parameters: [{ id: "customer", type: "string", required: true, default: "Walk-in" }],
      sections: [{ type: "detail", height: 20, children: [
        { id: "heading", type: "text", value: "Invoice <copy>", width: 80, height: 8, style: { fontWeight: "bold" } },
        { id: "customer-name", type: "field", binding: "data.customer.name", x: 0, y: 10, width: 100, height: 5 },
      ] }],
    });

    expect(result.issues).toEqual([]);
    expect(result.jrxml).toContain('name="invoice_demo"');
    expect(result.jrxml).toContain('pageWidth="595"');
    expect(result.jrxml).toContain('<parameter name="customer" class="java.lang.String" isForPrompting="true"><defaultValueExpression><![CDATA["Walk-in"]]></defaultValueExpression></parameter>');
    expect(result.jrxml).toContain('<field name="f_customer_name" class="java.lang.Object">');
    expect(result.jrxml).toContain("<![CDATA[Invoice <copy>]]>");
    expect(result.jrxml).toContain('$F{f_customer_name}');
    expect(result.jrxml).toContain('<textField textAdjust="StretchHeight" isBlankWhenNull="true">');
    expect(result.jrxml).toContain('<detail><band height="21">');
  });

  it("keeps component coordinates in points and converts custom page geometry from its page unit", () => {
    const result = exportJrxml({
      id: "custom-label",
      page: { size: "custom", orientation: "landscape", unit: "mm", width: 50, height: 30, margin: { left: 2, right: 2, top: 1, bottom: 1 } },
      sections: [{ type: "detail", children: [
        { type: "text", value: "Label", x: 1.4, y: 2.6, width: 40.4, height: 8.8 },
      ] }],
    });

    expect(result.jrxml).toContain('pageWidth="142" pageHeight="85"');
    expect(result.jrxml).toContain('leftMargin="6" rightMargin="6" topMargin="3" bottomMargin="3"');
    expect(result.jrxml).toContain('x="1" y="3" width="40" height="9"');
    expect(result.jrxml).not.toContain('NaN');
  });

  it("resolves font and color theme tokens and reports required runtime fonts", () => {
    const result = exportJrxml({
      id: "theme",
      theme: { fonts: { body: "Noto Sans" }, fontSizes: { small: 8 }, colors: { ink: "#123456" }, textStyles: { caption: { fontFamily: "$body", fontSize: "$small", color: "$ink" } } },
      sections: [{ type: "detail", children: [{ type: "text", value: "Caption", textStyle: "caption" }] }],
    });

    expect(result.jrxml).toContain('fontName="Noto Sans" size="8"');
    expect(result.jrxml).toContain('forecolor="#123456"');
    expect(result.issues).toContainEqual(expect.objectContaining({ path: "theme.fonts", message: expect.stringContaining("Noto Sans") }));
    expect(result.jrxml).toContain("install those fonts or a JasperReports font extension");
  });

  it("exports bound image paths dynamically and embeds base64 image sources", () => {
    const result = exportJrxml({ id: "logos", sections: [{ type: "detail", children: [
      { type: "image", binding: "params.logoUrl", width: 20, height: 20 },
      { type: "image", src: "data:image/png;base64,aGVsbG8=", width: 20, height: 20 },
    ] }] });

    expect(result.jrxml).toContain('$P{logoUrl}');
    expect(result.jrxml).toContain("String.valueOf($P{logoUrl})");
    expect(result.jrxml).toContain('<parameter name="logoUrl" class="java.lang.Object" isForPrompting="false"/>');
    expect(result.jrxml).toContain('class="java.io.InputStream"');
    expect(result.jrxml).toContain("java.util.Base64.getDecoder().decode(\"aGVsbG8=\")");
    expect(result.issues).toEqual([]);
  });

  it("embeds a real supplied logo file as a self-contained image expression", () => {
    const bytes = fs.readFileSync(new URL("../fixtures/letterheads/discharge-bill-left-brand.png", import.meta.url));
    const base64 = bytes.toString("base64");
    const result = exportJrxml({ id: "letterhead", sections: [{ type: "pageHeader", children: [{ type: "image", src: `data:image/png;base64,${base64}`, width: 60, height: 40 }] }] });
    expect(result.jrxml).toContain(`Base64.getDecoder().decode("${base64}")`);
    expect(result.issues).toEqual([]);
  });

  it("packages bundled subreports with Jasper subreport references and setup notes", async () => {
    const doc = {
      id: "parent-report",
      parameters: [{ id: "hospitalName", type: "string", default: "ACME" }],
      subreports: {
        header: {
          schemaVersion: "1.0", id: "shared-header", name: "Shared header", parameters: [{ id: "hospitalName", type: "string" }],
          subreports: { footer: { schemaVersion: "1.0", id: "shared-footer", name: "Shared footer", sections: [{ type: "detail", children: [{ type: "text", value: "Powered by ACME" }] }] } },
          sections: [{ type: "detail", children: [{ type: "text", binding: "params.hospitalName" }, { type: "subreport", reportId: "footer", width: 200, height: 20 }] }],
        },
      },
      sections: [{ type: "detail", children: [{ type: "subreport", reportId: "header", parameters: { hospitalName: { expression: "params.hospitalName" } }, width: 400, height: 30 }] }],
    };
    const result = exportJrxml(doc);

    expect(result.issues).toEqual([]);
    expect(result.jrxml).toContain('<parameter name="SUBREPORT_DIR" class="java.lang.String" isForPrompting="false"/>');
    expect(result.jrxml).toContain("$P{SUBREPORT_DIR} + \"subreports/header-");
    expect(result.dependencies).toHaveLength(2);
    expect(result.dependencies[0]?.jrxml).toContain('$P{hospitalName}');
    expect(result.jrxml).toContain('<subreportParameter name="hospitalName"><subreportParameterExpression><![CDATA[$P{hospitalName}]]></subreportParameterExpression></subreportParameter>');
    expect(result.dependencies[0]?.jrxml).toContain('leftMargin="0" rightMargin="0" topMargin="0" bottomMargin="0"');
    expect(result.dependencies[0]?.jrxml).toContain('subreports/header-');
    expect(result.dependencies[0]?.jrxml).toContain('<subreportParameter name="SUBREPORT_DIR"><subreportParameterExpression><![CDATA[$P{SUBREPORT_DIR}]]></subreportParameterExpression></subreportParameter>');
    expect(result.dependencies[1]?.jrxml).toContain("Powered by ACME");

    const zip = await JSZip.loadAsync(await createJrxmlPackage(doc, result));
    expect(Object.keys(zip.files)).toContain("parent_report.jrxml");
    expect(Object.keys(zip.files).some((path) => path.startsWith("subreports/") && path.endsWith(".jrxml"))).toBe(true);
    expect(await zip.file("README.md")?.async("string")).toContain("SUBREPORT_DIR");
    const readme = await zip.file("README.md")?.async("string");
    expect(readme).toContain("EXPERIMENTAL");
    expect(readme).toContain("as soon as practical");
    expect(readme).toContain("Open Reports JSON format");
  });

  it("exports a dataset-backed table with headers, fields, widths and a Jasper collection datasource", () => {
    const result = exportJrxml({ id: "invoice", datasets: [{ id: "invoice", source: "inline", query: { data: { items: [{ sku: "A-1", amount: 12 }] } } }], sections: [{ type: "detail", children: [
      { type: "table", id: "lines", dataset: "invoice.items", width: 400, height: 80, showFooter: true, columns: [
        { id: "sku", header: "SKU", binding: "row.sku", width: 100 },
        { id: "amount", header: "Amount", expression: "row.qty * row.price", format: "number:2:plain", width: 300, align: "right", footer: { aggregate: "sum" } },
      ] },
    ] }] });

    expect(result.jrxml).toContain('xmlns:jr="http://jasperreports.sourceforge.net/jasperreports/components"');
    expect(result.jrxml).toContain('<subDataset name="ds_lines"');
    expect(result.jrxml).toContain('<field name="sku" class="java.lang.Object"/>');
    expect(result.jrxml).toContain('<datasetRun subDataset="ds_lines"><dataSourceExpression><![CDATA[new net.sf.jasperreports.engine.data.JRMapCollectionDataSource((java.util.Collection)$F{f_items})]]></dataSourceExpression></datasetRun>');
    expect(result.jrxml).toContain('<jr:column width="100">');
    expect(result.jrxml).toContain('<jr:columnHeader height="18">');
    expect(result.jrxml).toContain('<![CDATA[$F{sku}]]>');
    expect(result.jrxml).toContain(".multiply(");
    expect(result.jrxml).toContain('pattern="0.00"');
    expect(result.jrxml).toContain('calculation="Sum"');
    expect(result.jrxml).toContain("<jr:tableFooter height=\"18\">");
    expect(result.issues).toContainEqual(expect.objectContaining({ path: "datasets[0]", message: expect.stringContaining("data are not embedded") }));
  });

  it("reports unsupported conversion behavior instead of silently claiming parity", () => {
    const result = exportJrxml({ id: "lossy", page: {}, sections: [{ type: "detail", children: [
      { type: "text", expression: "sumBy(data.items, 'amount')" },
      { type: "table", dataset: "orders", columns: [{ header: "Total", expression: "if (row.qty) return row.qty * row.price" }] },
    ] }], groups: [{ id: "department", by: "row.department" }] });

    expect(result.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      expect.stringContaining("no safe Jasper Java translation"),
      expect.stringContaining("outside the supported numeric arithmetic subset"),
    ]));
  });

  it("exports nested report groups, headers and footers with Jasper sort and page behavior", () => {
    const result = exportJrxml({
      id: "grouped-sales",
      groups: [{ id: "department", name: "Department", dataset: "sales", by: "row.department", sort: "asc", repeatHeader: true, newPage: "before", keepTogether: true }],
      datasets: [{ id: "sales", source: "inline", query: { data: [{ department: "Cardiology" }] } }],
      sections: [
        { type: "groupHeader", groupId: "department", children: [{ type: "text", binding: "group.key" }] },
        { type: "detail", dataset: "sales", children: [{ type: "field", binding: "row.total" }] },
        { type: "groupFooter", groupId: "department", children: [{ type: "text", value: "Department total" }] },
      ],
    });

    expect(result.jrxml).toContain('<sortField name="f_department" order="Ascending"/>');
    expect(result.jrxml).toContain('<group name="department" isReprintHeaderOnEachPage="true" isStartNewPage="true" keepTogether="true">');
    expect(result.jrxml).toContain('<groupExpression><![CDATA[$F{f_department}]]></groupExpression>');
    expect(result.jrxml).toContain('<groupHeader><band height="13">');
    expect(result.jrxml).toContain('<groupFooter><band height="13">');
    expect(result.issues).toEqual([expect.objectContaining({ path: "datasets[0]" })]);
  });

  it("translates safe Open Reports expressions and row variables into Jasper Java expressions", () => {
    const result = exportJrxml({
      id: "expressions",
      groups: [{ id: "region", by: "row.region" }],
      variables: [{ id: "runningTotal", scope: "row", expression: "(vars.runningTotal ?? 0) + row.amount", resetOn: "region" }],
      sections: [{ type: "detail", children: [
        { type: "text", expression: 'if (data.customer.name == "Alex Morgan") { return "N/A"; } else { return formatDate(data.issued, "dd MMM yyyy"); }' },
        { type: "field", binding: "vars.runningTotal", format: "currency:INR" },
      ] }],
    });

    expect(result.jrxml).toContain('name="runningTotal" class="java.math.BigDecimal" calculation="Nothing" resetType="Group" resetGroup="region"');
    expect(result.jrxml).toContain('$V{runningTotal}');
    expect(result.jrxml).toContain('java.util.Objects.equals($F{f_customer_name}, "Alex Morgan")');
    expect(result.jrxml).toContain('new java.text.SimpleDateFormat("dd MMM yyyy").format((java.util.Date)$F{f_issued})');
    expect(result.issues).toEqual([]);
  });

  it("exports supported visibility conditions and rich text markup", () => {
    const result = exportJrxml({ id: "visibility", sections: [{ type: "detail", visibleWhen: "data.active == true", children: [
      { type: "richText", value: "<b>Balance</b> <i>due</i>", visibleWhen: "data.total > 0" },
    ] }] });
    expect(result.jrxml).toContain('<printWhenExpression><![CDATA[(java.util.Objects.equals($F{f_active}, true)) && (');
    expect(result.jrxml).toContain('.compareTo(');
    expect(result.jrxml).toContain('markup="html"');
    expect(result.issues).toEqual([]);
  });

  it("exports a rotated first-page watermark as an embedded vector image", () => {
    const result = exportJrxml({ id: "watermarked", watermark: { text: "CONFIDENTIAL & INTERNAL", color: "#990000", opacity: 0.2, fontSize: 44, angle: 35, pages: "first" }, sections: [{ type: "detail", children: [{ type: "text", value: "Report body" }] }] });
    expect(result.jrxml).toContain('<background><band height="728">');
    expect(result.jrxml).toContain('printWhenExpression><![CDATA[$V{PAGE_NUMBER} == 1]]>');
    const base64 = result.jrxml.match(/getDecoder\(\)\.decode\("([A-Za-z0-9+/=]+)"\)/)?.[1];
    expect(base64).toBeTruthy();
    const svg = Buffer.from(base64!, "base64").toString("utf8");
    expect(svg).toContain('rotate(-35');
    expect(svg).toContain("CONFIDENTIAL &amp; INTERNAL");
    expect(result.issues).toEqual([]);
  });

  it("exports dynamic QR codes and common barcode symbologies as native Jasper components", () => {
    const result = exportJrxml({ id: "codes", sections: [{ type: "detail", children: [
      { type: "qrcode", binding: "data.invoice.url", width: 40, height: 40 },
      { type: "barcode", value: "123456789012", symbology: "ean13", width: 120, height: 24 },
    ] }] });
    expect(result.jrxml).toContain('<jr:QRCode><jr:codeExpression><![CDATA[String.valueOf($F{f_invoice_url})]]></jr:codeExpression></jr:QRCode>');
    expect(result.jrxml).toContain('<jr:barbecue type="EAN13" drawText="false"><jr:codeExpression><![CDATA["123456789012"]]></jr:codeExpression></jr:barbecue>');
    expect(result.issues).toEqual([]);
  });

  it("includes optional Jasper runtime dependencies in the source package when needed", async () => {
    const doc = { id: "code-assets", sections: [{ type: "detail", children: [
      { type: "qrcode", value: "https://example.test" },
      { type: "barcode", value: "12345678", symbology: "code128" },
    ] }] };
    const zip = await JSZip.loadAsync(await createJrxmlPackage(doc, exportJrxml(doc)));
    const pom = await zip.file("pom.xml")?.async("string");
    expect(pom).toContain("net.sf.barcode4j</groupId>");
    expect(pom).toContain("com.google.zxing</groupId>");
    expect(pom).toContain("net.sourceforge.barbecue</groupId>");
    expect(pom).toContain("batik-bridge</artifactId>");
  });

  it("exports bar, line and pie charts with isolated dataset fields", () => {
    const result = exportJrxml({ id: "charts", sections: [{ type: "detail", children: [
      { id: "sales-chart", type: "chart", chartType: "bar", dataset: "data.sales", categoryBinding: "row.month", series: [{ name: "Revenue", binding: "row.total" }], title: "Revenue by month", width: 260, height: 160 },
      { id: "share-chart", type: "chart", chartType: "pie", dataset: "data.sales", categoryBinding: "row.month", series: [{ name: "Revenue", binding: "row.total" }], width: 160, height: 120 },
      { id: "trend-chart", type: "chart", chartType: "line", dataset: "data.sales", categoryBinding: "row.month", series: [{ name: "Revenue", binding: "row.total" }], width: 260, height: 160 },
    ] }] });
    expect(result.jrxml).toContain('<barChart>');
    expect(result.jrxml).toContain('<lineChart>');
    expect(result.jrxml).toContain('<pieChart>');
    expect(result.jrxml).toContain('<subDataset name="ds_sales_chart"');
    expect(result.jrxml).toContain('new net.sf.jasperreports.engine.data.JRMapCollectionDataSource((java.util.Collection)$F{f_sales})');
    expect(result.issues).toEqual([]);
  });

  it("maps INR currency formatting to a Jasper number pattern", () => {
    const result = exportJrxml({ id: "currency", datasets: [{ id: "invoice", source: "inline", query: { data: { items: [{ price: 1250 }] } } }], sections: [{ type: "detail", children: [
      { type: "table", id: "lines", dataset: "invoice.items", columns: [{ id: "price", header: "Price", binding: "row.price", format: "currency:INR" }] },
    ] }] });
    expect(result.jrxml).toContain("pattern=\"&apos;₹&apos; #,##0.00;-&apos;₹&apos; #,##0.00\"");
    expect(result.jrxml).toContain("new java.math.BigDecimal(String.valueOf($F{price}))");
  });

  it("escapes XML safely, including CDATA terminators", () => {
    const result = exportJrxml({ id: "xml", sections: [{ type: "detail", children: [{ type: "text", value: "a ]]> b & <c>" }] }] });
    expect(result.jrxml).toContain("<![CDATA[a ]]]]><![CDATA[> b & <c>]]>");
  });
});
