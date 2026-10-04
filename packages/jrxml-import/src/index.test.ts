import { describe, expect, it } from "vitest";
import { importJrxml, translateJasperExpression } from "./index.js";

const v6 = `<?xml version="1.0"?>
<jasperReport name="Pilot" pageWidth="595" pageHeight="842" leftMargin="20" rightMargin="20" topMargin="30" bottomMargin="30">
  <parameter name="logoPath" class="java.lang.String"/>
  <field name="patientName" class="java.lang.String"/>
  <queryString><![CDATA[SELECT name FROM patients]]></queryString>
  <title><band height="50"><staticText><reportElement x="10" y="2" width="200" height="24"/><textElement textAlignment="Center"><font fontName="Arial" size="14" isBold="true"/></textElement><text><![CDATA[Patient bill]]></text></staticText></band></title>
  <detail><band height="42">
    <textField><reportElement x="10" y="0" width="180" height="20"/><textFieldExpression><![CDATA[$F{patientName}]]></textFieldExpression></textField>
    <image><reportElement x="200" y="0" width="40" height="30"/><imageExpression><![CDATA[$P{logoPath}]]></imageExpression></image>
    <subreport><reportElement x="250" y="0" width="100" height="30"/><subreportExpression><![CDATA[$P{reportPath} + "header.jasper"]]></subreportExpression></subreport>
  </band></detail>
</jasperReport>`;

describe("JRXML import", () => {
  it("imports basic v6 geometry, text, field and linked image while exposing gaps", () => {
    const result = importJrxml(v6, { id: "pilot" });
    expect(result.format).toBe("v6-style");
    expect(result.report?.id).toBe("pilot");
    expect(result.report?.page).toMatchObject({ unit: "pt", width: 595, height: 842, margin: { left: 20, top: 30 } });
    expect(result.report?.sections[0]?.children[0]).toMatchObject({ type: "text", value: "Patient bill", x: "10pt", y: "2pt", style: { fontWeight: "bold" } });
    expect(result.report?.sections[1]?.children[0]).toMatchObject({ type: "field", expression: "row.patientName" });
    expect(result.report?.sections[1]?.children[1]).toMatchObject({ type: "image", binding: "params.logoPath" });
    expect(result.report?.sections[1]?.children[2]).toMatchObject({ type: "subreport", reportId: "header" });
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ feature: "SQL query", status: "needs-review" }),
      expect.objectContaining({ feature: "subreport", status: "needs-review", original: '$P{reportPath} + "header.jasper"', message: expect.stringContaining("header.jrxml is source unspecified") }),
    ]));
    expect(result.report?.migration?.issues.some((issue) => issue.feature === "subreport")).toBe(true);
    expect(result.report?.migration?.issues.some((issue) => "original" in issue)).toBe(false);
  });

  it("reports the source and data mode of a linked subreport", () => {
    const result = importJrxml(`<jasperReport name="Parent" pageWidth="300" pageHeight="500"><detail><band height="20"><subreport><reportElement x="0" y="0" width="100" height="20"/><subreportParameter name="id"><subreportParameterExpression><![CDATA[$P{id}]]></subreportParameterExpression></subreportParameter><dataSourceExpression><![CDATA[$P{lines}]]></dataSourceExpression><subreportExpression><![CDATA[$P{reportPath} + "PaymentLines.jasper"]]></subreportExpression></subreport></band></detail></jasperReport>`);
    expect(result.report?.sections[0]?.children[0]).toMatchObject({ type: "subreport", reportId: "PaymentLines", dataset: "params.lines", parameters: { id: { expression: "params.id" } } });
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({
      feature: "subreport", status: "needs-review", message: expect.stringContaining("PaymentLines.jrxml is data-source-backed with 1 parameter"),
    })]));
  });

  it("imports v7-style element nodes", () => {
    const result = importJrxml(`<jasperReport name="Modern" pageWidth="300" pageHeight="500"><field name="name" class="java.lang.String"/><title height="50"><element kind="staticText" x="4" y="5" width="100" height="20" fontSize="12.0" bold="true" hTextAlign="Center"><text>Hello</text></element><element kind="image" x="110" y="5" width="20" height="20"><expression><![CDATA["logo.png"]]></expression></element></title><detail><band height="20"><element kind="textField" x="4" y="0" width="100" height="20"><expression><![CDATA[$F{name}]]></expression></element></band></detail></jasperReport>`);
    expect(result.format).toBe("v7-style");
    expect(result.report?.sections[0]?.children[0]).toMatchObject({ type: "text", value: "Hello", x: "4pt", style: { fontSize: 12, fontWeight: "bold", align: "center" } });
    expect(result.report?.sections[0]?.children[1]).toMatchObject({ type: "image", src: "logo.png" });
    expect(result.report?.sections[1]?.children[0]).toMatchObject({ type: "field", expression: "row.name" });
  });

  it("keeps group bands beside the detail dataset", () => {
    const result = importJrxml(`<jasperReport name="Grouped" pageWidth="300" pageHeight="500">
      <field name="category" class="java.lang.String"/>
      <group name="Category"><groupExpression><![CDATA[$F{category}]]></groupExpression><groupHeader><band height="15"><staticText><reportElement x="0" y="0" width="100" height="15"/><text>Header</text></staticText></band></groupHeader><groupFooter><band height="15"><staticText><reportElement x="0" y="0" width="100" height="15"/><text>Footer</text></staticText></band></groupFooter></group>
      <detail><band height="20"><textField><reportElement x="0" y="0" width="100" height="20"/><textFieldExpression><![CDATA[$F{category}]]></textFieldExpression></textField></band></detail>
    </jasperReport>`);
    expect(result.report?.sections.map((section) => section.type)).toEqual(["groupHeader", "detail", "groupFooter"]);
    expect(result.report?.sections[1]?.dataset).toBe("main");
    expect(result.report?.groups[0]?.by).toBe("row.category");
  });

  it("maps simple Sum variables while keeping unsupported calculations visible", () => {
    const result = importJrxml(`<jasperReport name="Totals" pageWidth="300" pageHeight="500">
      <field name="amount" class="java.lang.Double"/>
      <variable name="total" class="java.lang.Double" calculation="Sum"><variableExpression><![CDATA[$F{amount}]]></variableExpression></variable>
      <variable name="average" class="java.lang.Double" calculation="Average"><variableExpression><![CDATA[$F{amount}]]></variableExpression></variable>
      <detail><band height="20"><textField><reportElement x="0" y="0" width="100" height="20"/><textFieldExpression><![CDATA[$V{total}]]></textFieldExpression></textField><textField><reportElement x="110" y="0" width="100" height="20"/><textFieldExpression><![CDATA[$V{average}]]></textFieldExpression></textField></band></detail>
    </jasperReport>`);
    expect(result.report?.variables).toMatchObject([{ id: "total", scope: "row", expression: "(vars.total ?? 0) + (row.amount ?? 0)" }]);
    expect(result.report?.sections[0]?.children[0]).toMatchObject({ type: "field", expression: "vars.total" });
    expect(result.report?.sections[0]?.children[1]).toMatchObject({ type: "text", value: "[Migration review: text expression]" });
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ feature: "Jasper variable", status: "unsupported" })]));
  });

  it("preserves unpadded Jasper date patterns used on receipts", () => {
    const result = importJrxml(`<jasperReport name="Receipt" pageWidth="288" pageHeight="288"><field name="paidOn" class="java.sql.Date"/><detail><band height="20"><textField pattern="d/M/yyyy"><reportElement x="0" y="0" width="90" height="20"/><textFieldExpression><![CDATA[$F{paidOn}]]></textFieldExpression></textField></band></detail></jasperReport>`);
    expect(result.report?.sections[0]?.children[0]).toMatchObject({ type: "field", expression: "row.paidOn", format: "date:d/M/yyyy" });
  });

  it("stacks the page and column headers and maps individual border pens", () => {
    const result = importJrxml(`<jasperReport name="Receipt" pageWidth="288" pageHeight="288">
      <pageHeader><band height="23"><staticText><reportElement x="0" y="1" width="288" height="22"/><text>Receipt</text></staticText></band></pageHeader>
      <columnHeader><band height="20"><staticText><reportElement x="0" y="0" width="107" height="20"/><box><topPen lineWidth="1"/><rightPen lineWidth="0"/><bottomPen lineWidth="1"/><leftPen lineWidth="0.5"/></box><text>Number</text></staticText></band></columnHeader>
      <detail><band height="17"><staticText><reportElement x="0" y="0" width="107" height="17"/><text>R-1</text></staticText></band></detail>
    </jasperReport>`);
    expect(result.report?.sections.map((section) => section.type)).toEqual(["pageHeader", "detail"]);
    expect(result.report?.sections[0]?.children).toMatchObject([
      { value: "Receipt", y: "1pt" },
      { value: "Number", y: "23pt", style: { border: { top: { width: 1 }, right: { width: 0 }, bottom: { width: 1 }, left: { width: 0.5 } } } },
    ]);
  });

  it("refuses DTDs and malformed roots", () => {
    expect(importJrxml('<!DOCTYPE jasperReport SYSTEM "http://example.com/evil.dtd"><jasperReport/>').report).toBeUndefined();
    expect(importJrxml("<other/>").issues[0]).toMatchObject({ status: "unsupported", feature: "document" });
  });

  it("translates only safe references and operators", () => {
    expect(translateJasperExpression('$F{amount} > 0 ? $P{label} : ""')).toBe('row.amount > 0 ? params.label : ""');
    expect(translateJasperExpression('new java.io.File($P{path})')).toBeUndefined();
    expect(translateJasperExpression('$F{name}.toUpperCase()')).toBeUndefined();
    expect(translateJasperExpression('$V{runningTotal}')).toBeUndefined();
  });
});
