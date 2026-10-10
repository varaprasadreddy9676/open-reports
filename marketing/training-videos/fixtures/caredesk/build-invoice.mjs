// Writes reports/hospital-invoice.report.json: the finished invoice the flagship video builds on camera.
// The header subreport is bundled under `subreports`, exactly as the designer does when its file is picked.
// Run: node marketing/training-videos/fixtures/caredesk/build-invoice.mjs
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bills, renderData } from "./data.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const header = JSON.parse(await readFile(path.join(here, "reports/northstar-header.report.json"), "utf8"));
const sample = renderData(bills[0], "http://127.0.0.1:3002");

const muted = { fontSize: 7.5, color: "#526575" };
const label = (value) => ({ type: "text", value, style: { fontSize: 6.5, fontWeight: "bold", color: "#7a8a99" } });
const totalRow = (text, expression, strong = false) => ({
  type: "row",
  children: [
    { type: "text", value: text, width: "*", style: strong ? { fontSize: 11, fontWeight: "bold" } : { color: "#374151" } },
    { type: "text", expression: `formatCurrency(${expression})`, width: 110, style: { align: "right", ...(strong ? { fontSize: 11, fontWeight: "bold" } : {}) } },
  ],
});

const definition = {
  schemaVersion: "1.0",
  id: "hospital-invoice",
  name: "Hospital invoice",
  description: "Patient invoice for CareDesk HIMS with a shared letterhead subreport, itemised services and payment summary.",
  locale: "en-IN",
  theme: { currency: "INR" },
  page: { size: "A4", orientation: "portrait", unit: "mm", margin: { top: 14, right: 15, bottom: 18, left: 15 } },
  datasets: [
    { id: "invoice", source: "inline", query: { data: sample.invoice } },
    { id: "branding", source: "inline", query: { data: sample.branding } },
  ],
  sections: [
    {
      type: "pageHeader",
      children: [
        { type: "subreport", id: "letterhead", reportId: "northstar-header", dataset: "branding" },
        { type: "spacer", height: 2 },
        { type: "line" },
        { type: "spacer", height: 2 },
        {
          type: "row",
          children: [
            { type: "text", id: "invoice-title", value: "TAX INVOICE", width: "*", style: { fontSize: 11, fontWeight: "bold", color: "#143753" } },
            { type: "text", expression: "\"Bill \" + data.invoice.id", style: { align: "right", fontWeight: "bold" } },
          ],
        },
      ],
    },
    {
      type: "detail",
      children: [
        { type: "spacer", height: 4 },
        {
          type: "row",
          gap: 6,
          children: [
            {
              type: "column",
              width: "*",
              children: [
                label("PATIENT"),
                { type: "text", binding: "data.invoice.patient.name", style: { fontSize: 12, fontWeight: "bold" } },
                { type: "text", expression: "\"UHID \" + data.invoice.patient.uhid + \" · \" + data.invoice.patient.age + \" y · \" + data.invoice.patient.sex", style: muted },
                { type: "text", binding: "data.invoice.patient.address", style: muted },
                { type: "text", binding: "data.invoice.patient.phone", style: muted },
              ],
            },
            {
              type: "column",
              width: 210,
              children: [
                label("VISIT"),
                { type: "text", expression: "formatDate(data.invoice.date, \"dd MMM yyyy\") + \" · \" + data.invoice.visit", style: { fontWeight: "bold" } },
                { type: "text", expression: "\"Consultant: \" + data.invoice.doctor", style: muted },
                { type: "text", expression: "\"Payer: \" + data.invoice.payer", style: muted },
                { type: "text", id: "invoice-status", expression: "\"Status: \" + data.invoice.status", style: { ...muted, fontWeight: "bold", color: "#b45309" } },
              ],
            },
          ],
        },
        { type: "spacer", height: 6 },
        {
          type: "table",
          id: "services",
          dataset: "invoice.items",
          showFooter: true,
          alternateRowStyle: true,
          keepRowTogether: true,
          columns: [
            { id: "description", header: "Service", binding: "row.description", width: "*" },
            { id: "category", header: "Department", binding: "row.category", width: 90 },
            { id: "quantity", header: "Qty", binding: "row.quantity", width: 36, align: "right" },
            { id: "rate", header: "Rate", binding: "row.rate", format: "currency:INR", width: 80, align: "right" },
            { id: "amount", header: "Amount", expression: "row.quantity * row.rate", format: "currency:INR", width: 92, align: "right", footer: { aggregate: "sum" } },
          ],
        },
        { type: "spacer", height: 6 },
        {
          type: "keepTogether",
          children: [
            {
              type: "row",
              gap: 8,
              children: [
                {
                  type: "column",
                  width: "*",
                  children: [
                    label("PAYMENT"),
                    { type: "text", expression: "data.invoice.paymentMode + \" · \" + data.invoice.status", style: { fontWeight: "bold" } },
                    { type: "text", value: "Medical services are exempt from GST under notification 12/2017.", style: muted },
                  ],
                },
                {
                  type: "column",
                  width: 220,
                  children: [
                    totalRow("Subtotal", "data.invoice.subtotal"),
                    totalRow("Discount", "data.invoice.discount"),
                    totalRow("Net payable", "data.invoice.net"),
                    totalRow("Paid", "data.invoice.paid"),
                    { type: "line" },
                    totalRow("Balance due", "data.invoice.balance", true),
                  ],
                },
              ],
            },
            { type: "spacer", height: 14 },
            {
              type: "row",
              children: [
                { type: "text", id: "invoice-note", value: "Thank you for trusting Northstar with your care. Please keep this invoice for insurance claims.", width: "*", style: muted },
                { type: "text", value: "Authorised signatory", width: 130, style: { align: "right", fontSize: 7.5, fontWeight: "bold" } },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "pageFooter",
      children: [
        { type: "line" },
        {
          type: "row",
          children: [
            { type: "text", value: "Computer-generated invoice · CareDesk HIMS", width: "*", style: { fontSize: 6.5, color: "#526575" } },
            { type: "text", expression: "\"Page \" + page.number + \" of \" + page.total", style: { align: "right", fontSize: 7, color: "#526575" } },
          ],
        },
      ],
    },
  ],
  subreports: { "northstar-header": header },
};

await writeFile(path.join(here, "reports/hospital-invoice.report.json"), `${JSON.stringify(definition, null, 2)}\n`);
console.log("Wrote reports/hospital-invoice.report.json");
