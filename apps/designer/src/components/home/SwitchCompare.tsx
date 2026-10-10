import React, { useRef, useState } from "react";
import { Icon } from "./Icons";

/** The same invoice heading and total, as a legacy JRXML template and as an Open Reports definition. */
const JRXML = [
  `<?xml version="1.0" encoding="UTF-8"?>`,
  `<jasperReport name="invoice" pageWidth="595" pageHeight="842"`,
  `    columnWidth="555" leftMargin="20" rightMargin="20"`,
  `    topMargin="20" bottomMargin="20">`,
  `  <parameter name="INVOICE_ID" class="java.lang.Integer"/>`,
  `  <queryString><![CDATA[`,
  `    SELECT * FROM invoices WHERE id = $P{INVOICE_ID}`,
  `  ]]></queryString>`,
  `  <field name="customer" class="java.lang.String"/>`,
  `  <field name="total" class="java.math.BigDecimal"/>`,
  `  <title><band height="60">`,
  `    <textField>`,
  `      <reportElement x="0" y="10" width="300" height="24"/>`,
  `      <textElement><font size="16" isBold="true"/></textElement>`,
  `      <textFieldExpression><![CDATA[$F{customer}]]></textFieldExpression>`,
  `    </textField>`,
  `    <textField pattern="#,##0.00">`,
  `      <reportElement x="400" y="10" width="155" height="24"/>`,
  `      <textFieldExpression><![CDATA[$F{total}]]></textFieldExpression>`,
  `    </textField>`,
  `  </band></title>`,
  `</jasperReport>`,
];
const JSON_DEFINITION = [
  `{`,
  `  "name": "Invoice",`,
  `  "page": { "size": "A4", "unit": "mm" },`,
  `  "sections": [{`,
  `    "type": "reportHeader",`,
  `    "children": [`,
  `      { "type": "text", "binding": "data.invoice.customer.name",`,
  `        "style": { "fontSize": 16, "fontWeight": "bold" } },`,
  `      { "type": "text", "binding": "data.invoice.total",`,
  `        "format": "currency:USD" }`,
  `    ]`,
  `  }]`,
  `}`,
];

type Cell = { text: string; tone?: "yes" | "no" | "mixed" };
const COLUMNS = [
  { name: "Open Reports", hint: "MIT, self-hosted" },
  { name: "Classic report servers", hint: "e.g. JasperReports, SSRS, Crystal" },
  { name: "Commercial JS SDKs", hint: "e.g. ActiveReportsJS, Stimulsoft" },
  { name: "Document-template APIs", hint: "e.g. Carbone" },
];
const ROWS: { label: string; cells: Cell[] }[] = [
  { label: "Cost to start", cells: [{ text: "Free, MIT licence", tone: "yes" }, { text: "Free library to paid suite", tone: "mixed" }, { text: "Paid, from about $900 a year", tone: "no" }, { text: "Free tier with hosting limits", tone: "mixed" }] },
  { label: "Where you design", cells: [{ text: "In the browser", tone: "yes" }, { text: "Desktop designer", tone: "no" }, { text: "In the browser", tone: "yes" }, { text: "Word or LibreOffice", tone: "mixed" }] },
  { label: "Your users edit reports in your app", cells: [{ text: "Included, free", tone: "yes" }, { text: "Rarely", tone: "no" }, { text: "With a licence", tone: "mixed" }, { text: "Not built in", tone: "no" }] },
  { label: "Template format", cells: [{ text: "Open JSON schema", tone: "yes" }, { text: "XML (JRXML, RDL)", tone: "mixed" }, { text: "Vendor format", tone: "mixed" }, { text: "DOCX or ODT files", tone: "mixed" }] },
  { label: "Call it from", cells: [{ text: "Any language, over REST", tone: "yes" }, { text: "Mainly JVM or .NET", tone: "mixed" }, { text: "A JavaScript runtime", tone: "mixed" }, { text: "Any language, over REST", tone: "yes" }] },
];

function CodePane({ lines, language }: { lines: string[]; language: "xml" | "json" }) {
  return <pre className={`switch-code switch-code-${language}`}><code>{lines.map((line, index) => <span key={index}><i>{index + 1}</i>{line}{"\n"}</span>)}</code></pre>;
}

export function SwitchCompare() {
  const [split, setSplit] = useState(50);
  const stage = useRef<HTMLDivElement>(null);
  const dragTo = (clientX: number) => {
    const box = stage.current?.getBoundingClientRect();
    if (box) setSplit(Math.round(Math.min(92, Math.max(8, ((clientX - box.left) / box.width) * 100))));
  };
  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragTo(event.clientX);
  };
  return <section className="landing-switch landing-container" id="why" aria-labelledby="switch-heading">
    <div className="landing-section-heading" data-reveal>
      <div><p className="landing-eyebrow">WHY TEAMS SWITCH</p><h2 id="switch-heading">Same invoice.<br /><span className="text-muted">Two very different afternoons.</span></h2></div>
      <p>Both define the same customer heading and total.<span className="switch-drag-hint"> Drag the divider to compare.</span></p>
    </div>

    <div className="switch-stage" ref={stage} style={{ "--split": `${split}%` } as React.CSSProperties} data-reveal
      onPointerDown={onPointerDown} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) dragTo(event.clientX); }}>
      <div className="switch-side switch-before">
        <div className="switch-label"><span>Legacy</span><strong>invoice.jrxml</strong></div>
        <CodePane lines={JRXML} language="xml" />
        <ul className="switch-chips"><li>{JRXML.length} lines of XML</li><li>Desktop IDE</li><li>Compile to .jasper</li><li>Runs in a JVM</li></ul>
      </div>
      <div className="switch-side switch-after" aria-hidden={split > 88}>
        <div className="switch-label"><span>Open Reports</span><strong>invoice.json</strong></div>
        <CodePane lines={JSON_DEFINITION} language="json" />
        <ul className="switch-chips"><li>{JSON_DEFINITION.length} lines of JSON</li><li>Designed in the browser</li><li>No build step</li><li>REST from any stack</li></ul>
      </div>
      <div className="switch-handle" aria-hidden="true"><span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6-6 6 6 6M15 6l6 6-6 6" /></svg></span></div>
      <input className="switch-range" type="range" min={8} max={92} value={split} onChange={(event) => setSplit(Number(event.target.value))} aria-label="Compare the legacy template with the Open Reports definition" />
    </div>

    <div className="switch-table-wrap" data-reveal>
      <table className="switch-table">
        <caption className="sr-only">How Open Reports compares with other kinds of reporting tools</caption>
        <thead><tr><th scope="col"><span className="sr-only">Capability</span></th>{COLUMNS.map((column, index) => <th key={column.name} scope="col" className={index === 0 ? "is-us" : ""}>{column.name}<small>{column.hint}</small></th>)}</tr></thead>
        <tbody>{ROWS.map((row) => <tr key={row.label}><th scope="row">{row.label}</th>{row.cells.map((cell, index) => <td key={index} className={`${index === 0 ? "is-us " : ""}tone-${cell.tone ?? "mixed"}`}><span className="tone-mark" aria-hidden="true" />{cell.text}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <div className="switch-footer" data-reveal>
      <p>Categories describe typical setups; individual products differ. Prices are from vendor and reseller listings, October 2026.</p>
      <a className="landing-text-link" href="#create">Coming from JasperReports? Import your .jrxml files <Icon name="arrow" /></a>
    </div>
  </section>;
}
