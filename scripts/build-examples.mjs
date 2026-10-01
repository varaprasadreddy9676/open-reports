// Generates the sample report definitions in /examples. Run: node scripts/build-examples.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "examples");
mkdirSync(out, { recursive: true });

const T = (value, o = {}) => ({ type: "text", value, ...o });
const B = (binding, o = {}) => ({ type: "text", binding, ...o });
const X = (expression, o = {}) => ({ type: "text", expression, ...o });
const row = (children, o = {}) => ({ type: "row", children, ...o });
const col = (children, o = {}) => ({ type: "column", children, ...o });
const spacer = (h = 10) => ({ type: "spacer", height: h });
const line = () => ({ type: "line" });
const muted = { color: "#6b7280" };
const bold = { fontWeight: "bold" };
const right = { align: "right" };
const MARGIN = { top: 15, right: 15, bottom: 18, left: 15 };
const A4 = (extra = {}) => ({ size: "A4", orientation: "portrait", unit: "mm", margin: MARGIN, ...extra });
const footerPages = () => ({
  type: "pageFooter",
  children: [X('"Page " + page.number + " of " + page.total', { style: { align: "right", fontSize: 8, ...muted } })],
});
const base = (id, name, description, extra) => ({ schemaVersion: "1.0", id, name, description, locale: "en-IN", ...extra });
const write = (file, doc) => writeFileSync(join(out, `${file}.report.json`), JSON.stringify(doc, null, 2) + "\n");
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

// ---------------------------------------------------------------- invoice
write("invoice", base("invoice", "Invoice", "Logo block, customer details, item table, tax and totals, QR code, repeating footer.", {
  theme: { currency: "INR" },
  datasets: [{
    id: "invoice", source: "inline",
    query: { data: {
      number: "INV-1001", date: "2025-01-15", status: "Due",
      customer: { name: "Sai Varaprasad", address: "12 MG Road, Bengaluru 560001", phone: "+91 98765 43210" },
      items: [
        { description: "Eye Examination", quantity: 1, rate: 500 },
        { description: "Progressive Lenses", quantity: 2, rate: 3200 },
        { description: "Titanium Frame", quantity: 1, rate: 4800 },
        { description: "Lens Coating", quantity: 2, rate: 650 },
      ],
    } },
  }],
  variables: [
    { id: "subtotal", scope: "report", expression: 'sumProduct(data.invoice.items, "quantity", "rate")' },
    { id: "tax", scope: "report", expression: "vars.subtotal * 0.18" },
    { id: "total", scope: "report", expression: "vars.subtotal + vars.tax" },
  ],
  page: A4(),
  sections: [
    { type: "pageHeader", children: [
      row([
        T("ACME HEALTH", { id: "company", width: "*", style: { fontSize: 18, fontWeight: "bold", color: "#1d4ed8" } }),
        T("INVOICE", { style: { fontSize: 18, fontWeight: "bold", align: "right" } }),
      ]),
      line(),
    ] },
    { type: "detail", children: [
      spacer(8),
      row([
        col([
          T("Bill to", { style: { fontSize: 8, ...muted } }),
          B("data.invoice.customer.name", { style: { fontSize: 12, fontWeight: "bold" } }),
          B("data.invoice.customer.address"),
          B("data.invoice.customer.phone"),
        ], { width: "*" }),
        col([
          X('"Invoice # " + data.invoice.number', { style: { align: "right", fontWeight: "bold" } }),
          X('"Date: " + formatDate(data.invoice.date, "dd MMM yyyy")', { style: right }),
          X('"Status: " + data.invoice.status', { style: { align: "right", color: "#b45309" } }),
        ], { width: 200 }),
      ]),
      spacer(14),
      { type: "table", id: "items", dataset: "invoice.items", showFooter: true, alternateRowStyle: true, keepRowTogether: true,
        columns: [
          { id: "description", header: "Description", binding: "row.description", width: "*" },
          { id: "quantity", header: "Qty", binding: "row.quantity", width: 50, align: "right" },
          { id: "rate", header: "Rate", binding: "row.rate", format: "currency:INR", width: 90, align: "right" },
          { id: "amount", header: "Amount", expression: "row.quantity * row.rate", format: "currency:INR", width: 100, align: "right", footer: { aggregate: "sum" } },
        ] },
      spacer(14),
      { type: "keepTogether", children: [
        row([
          { type: "qrcode", id: "pay-qr", expression: '"upi://pay?pa=acme@bank&am=" + vars.total', width: 100, height: 80 },
          col([
            row([T("Subtotal", { width: "*" }), X("formatCurrency(vars.subtotal)", { width: 110, style: right })]),
            row([T("GST 18%", { width: "*" }), X("formatCurrency(vars.tax)", { width: 110, style: right })]),
            line(),
            row([T("Total", { width: "*", style: { fontSize: 13, fontWeight: "bold" } }), X("formatCurrency(vars.total)", { width: 110, style: { align: "right", fontSize: 13, fontWeight: "bold" } })]),
          ], { width: "*" }),
        ]),
      ] },
    ] },
    footerPages(),
  ],
}));

// ---------------------------------------------------------------- receipt (80mm thermal)
write("receipt", base("receipt", "Receipt (80mm)", "Compact single-page thermal receipt.", {
  theme: { currency: "INR" },
  datasets: [{ id: "sale", source: "inline", query: { data: {
    shop: "ACME PHARMACY", address: "12 MG Road, Bengaluru", bill: "B-20931", time: "2025-01-15 16:20",
    items: [{ name: "Paracetamol 500mg", qty: 2, price: 18 }, { name: "Cough Syrup 100ml", qty: 1, price: 96 }, { name: "Vitamin C", qty: 3, price: 42 }],
  } } }],
  variables: [{ id: "total", scope: "report", expression: 'sumProduct(data.sale.items, "qty", "price")' }],
  page: { size: "custom", width: 80, height: 170, unit: "mm", orientation: "portrait", margin: { top: 4, right: 4, bottom: 4, left: 4 } },
  sections: [{ type: "detail", children: [
    B("data.sale.shop", { style: { align: "center", fontWeight: "bold", fontSize: 12 } }),
    B("data.sale.address", { style: { align: "center", fontSize: 8 } }),
    spacer(4), line(), spacer(2),
    X('"Bill " + data.sale.bill + "   " + data.sale.time', { style: { fontSize: 8 } }),
    spacer(2),
    { type: "table", id: "lines", dataset: "sale.items", showFooter: true, style: { fontSize: 8 }, columns: [
      { id: "name", header: "Item", binding: "row.name", width: "*" },
      { id: "qty", header: "Qty", binding: "row.qty", width: 26, align: "right" },
      { id: "amt", header: "Amt", expression: "row.qty * row.price", format: "number:2", width: 44, align: "right", footer: { aggregate: "sum" } },
    ] },
    spacer(6),
    T("Thank you - get well soon", { style: { align: "center", fontSize: 8 } }),
    { type: "qrcode", id: "rx-qr", expression: 'data.sale.bill', width: 56, height: 56, style: { align: "center" } },
  ] }],
}));

// ---------------------------------------------------------------- purchase order
write("purchase-order", base("purchase-order", "Purchase Order", "Multiple sections, vendor/ship-to blocks, terms and signature blocks kept together.", {
  theme: { currency: "INR" },
  datasets: [{ id: "po", source: "inline", query: { data: {
    number: "PO-7731", date: "2025-02-03",
    vendor: { name: "Medline Supplies Pvt Ltd", address: "Plot 4, Industrial Area, Hyderabad" },
    shipTo: { name: "Acme Health - Central Stores", address: "12 MG Road, Bengaluru" },
    lines: [
      { sku: "GLV-100", item: "Nitrile Gloves (box of 100)", qty: 40, price: 310 },
      { sku: "SYR-5", item: "Syringe 5ml (pack of 50)", qty: 25, price: 185 },
      { sku: "MSK-3P", item: "3-ply Face Masks (box of 50)", qty: 60, price: 120 },
    ],
  } } }],
  variables: [{ id: "total", scope: "report", expression: 'sumProduct(data.po.lines, "qty", "price")' }],
  page: A4(),
  sections: [
    { type: "pageHeader", children: [row([T("PURCHASE ORDER", { width: "*", style: { fontSize: 16, fontWeight: "bold" } }), X('data.po.number', { style: { align: "right", fontWeight: "bold" } })]), line()] },
    { type: "detail", children: [
      spacer(8),
      row([
        col([T("Vendor", { style: { fontSize: 8, ...muted } }), B("data.po.vendor.name", { style: bold }), B("data.po.vendor.address")], { width: "*" }),
        col([T("Ship to", { style: { fontSize: 8, ...muted } }), B("data.po.shipTo.name", { style: bold }), B("data.po.shipTo.address")], { width: "*" }),
      ]),
      spacer(12),
      { type: "table", id: "lines", dataset: "po.lines", showFooter: true, keepFooterTogether: true, columns: [
        { id: "sku", header: "SKU", binding: "row.sku", width: 70 },
        { id: "item", header: "Item", binding: "row.item", width: "*" },
        { id: "qty", header: "Qty", binding: "row.qty", width: 45, align: "right" },
        { id: "price", header: "Unit price", binding: "row.price", format: "currency", width: 80, align: "right" },
        { id: "amount", header: "Amount", expression: "row.qty * row.price", format: "currency", width: 90, align: "right", footer: { aggregate: "sum" } },
      ] },
      spacer(16),
      { type: "keepTogether", children: [
        T("Terms: Payment within 30 days of delivery. Goods subject to inspection on receipt.", { style: { fontSize: 8, ...muted } }),
        spacer(30),
        row([
          col([line(), T("Prepared by", { style: { fontSize: 8 } })], { width: "*" }),
          col([line(), T("Approved by", { style: { fontSize: 8 } })], { width: "*" }),
          col([line(), T("Vendor acknowledgement", { style: { fontSize: 8 } })], { width: "*" }),
        ]),
      ] },
    ] },
    footerPages(),
  ],
}));

// ---------------------------------------------------------------- account statement (multi-page)
{
  const r = rng(42);
  let bal = 25000;
  const tx = [];
  for (let i = 0; i < 140; i++) {
    const credit = r() > 0.7 ? Math.round(r() * 20000) : 0;
    const debit = credit ? 0 : Math.round(r() * 5000);
    bal += credit - debit;
    const d = new Date(Date.UTC(2025, 0, 1 + Math.floor(i / 2)));
    tx.push({ date: d.toISOString().slice(0, 10), narration: credit ? `NEFT credit REF${1000 + i}` : `UPI payment ${["Grocer", "Pharmacy", "Fuel", "Utilities", "Travel"][i % 5]}`, debit, credit, balance: bal });
  }
  write("account-statement", base("account-statement", "Account Statement", "Multi-page transaction table with repeating header; negative balances are highlighted.", {
    theme: { currency: "INR" },
    datasets: [{ id: "account", source: "inline", query: { data: { holder: "Sai Varaprasad", number: "XXXX-4471", period: "Jan - Mar 2025", transactions: tx } } }],
    variables: [{ id: "credits", scope: "report", expression: 'sumBy(data.account.transactions, "credit")' }, { id: "debits", scope: "report", expression: 'sumBy(data.account.transactions, "debit")' }],
    page: A4(),
    sections: [
      { type: "pageHeader", children: [row([T("ACCOUNT STATEMENT", { width: "*", style: { fontWeight: "bold", fontSize: 14 } }), B("data.account.number", { style: right })]), line()] },
      { type: "detail", children: [
        spacer(6),
        X('data.account.holder + "   |   " + data.account.period', { style: { fontSize: 9 } }),
        X('"Total credits " + formatCurrency(vars.credits) + "    Total debits " + formatCurrency(vars.debits)', { style: { fontSize: 9, ...muted } }),
        spacer(8),
        { type: "table", id: "transactions", dataset: "account.transactions", repeatHeaderOnPageBreak: true, minRowsAfterBreak: 3, style: { fontSize: 8 },
          rowStyleWhen: [{ when: "row.balance < 30000", style: { color: "#b91c1c" } }],
          columns: [
            { id: "date", header: "Date", binding: "row.date", format: "date:dd/MM/yyyy", width: 62 },
            { id: "narration", header: "Narration", binding: "row.narration", width: "*" },
            { id: "debit", header: "Debit", binding: "row.debit", format: "number:2", width: 70, align: "right" },
            { id: "credit", header: "Credit", binding: "row.credit", format: "number:2", width: 70, align: "right" },
            { id: "balance", header: "Balance", binding: "row.balance", format: "number:2", width: 80, align: "right" },
          ] },
      ] },
      footerPages(),
    ],
  }));
}

// ---------------------------------------------------------------- grouped sales
write("grouped-sales", base("grouped-sales", "Grouped Sales Report", "Group headers, group subtotals and a grand total.", {
  theme: { currency: "INR" },
  datasets: [{ id: "sales", source: "inline", query: { data: [
    { region: "South", city: "Bangalore", amount: 20000 }, { region: "South", city: "Chennai", amount: 15000 },
    { region: "North", city: "Delhi", amount: 25000 }, { region: "West", city: "Mumbai", amount: 31000 },
    { region: "West", city: "Pune", amount: 12000 }, { region: "North", city: "Jaipur", amount: 9000 },
  ] } }],
  variables: [
    { id: "groupTotal", scope: "group", expression: 'sumBy(data.sales, "amount")' },
    { id: "grandTotal", scope: "report", expression: 'sumBy(data.sales, "amount")' },
  ],
  page: A4(),
  sections: [
    { type: "reportHeader", children: [T("Sales by Region", { style: { fontSize: 16, fontWeight: "bold" } }), spacer(8)] },
    { type: "detail", children: [{
      type: "group", id: "by-region", dataset: "sales", groupBy: "row.region",
      header: [spacer(6), X('"Region: " + row.region', { keepWithNext: true, style: { fontWeight: "bold", background: "#eef2ff", padding: 3 } })],
      children: [row([B("row.city", { width: "*" }), X("formatCurrency(row.amount)", { style: { align: "right" }, width: 120 })])],
      footer: [line(), row([T("Subtotal", { width: "*", style: bold }), X("formatCurrency(vars.groupTotal)", { width: 120, style: { align: "right", fontWeight: "bold" } })])],
    }] },
    { type: "reportFooter", children: [spacer(12), row([T("Grand total", { width: "*", style: { fontSize: 12, fontWeight: "bold" } }), X("formatCurrency(vars.grandTotal)", { width: 140, style: { align: "right", fontSize: 12, fontWeight: "bold" } })])] },
    footerPages(),
  ],
}));

// ---------------------------------------------------------------- multilingual
write("multilingual", base("multilingual", "Multilingual Report", "English, Hindi, Telugu, Kannada, Tamil and Arabic in one document (needs the Noto fonts for PDF).", {
  theme: { fonts: { body: "Noto Sans" } },
  datasets: [{ id: "greetings", source: "inline", query: { data: [
    { language: "English", text: "Welcome to our hospital. Please keep this document safe.", dir: "ltr" },
    { language: "Hindi", text: "हमारे अस्पताल में आपका स्वागत है। कृपया इस दस्तावेज़ को सुरक्षित रखें।", dir: "ltr" },
    { language: "Telugu", text: "మా ఆసుపత్రికి స్వాగతం. దయచేసి ఈ పత్రాన్ని భద్రంగా ఉంచండి.", dir: "ltr" },
    { language: "Kannada", text: "ನಮ್ಮ ಆಸ್ಪತ್ರೆಗೆ ಸ್ವಾಗತ. ದಯವಿಟ್ಟು ಈ ದಾಖಲೆಯನ್ನು ಸುರಕ್ಷಿತವಾಗಿ ಇರಿಸಿ.", dir: "ltr" },
    { language: "Tamil", text: "எங்கள் மருத்துவமனைக்கு வரவேற்கிறோம். இந்த ஆவணத்தை பாதுகாப்பாக வைத்திருங்கள்.", dir: "ltr" },
    { language: "Arabic", text: "مرحبا بكم في مستشفانا. يرجى الاحتفاظ بهذه الوثيقة.", dir: "rtl" },
  ] } }],
  page: A4(),
  sections: [{ type: "detail", children: [
    T("Multilingual notice", { style: { fontSize: 18, fontWeight: "bold" } }), spacer(10),
    { type: "repeater", id: "lines", dataset: "greetings", children: [
      B("row.language", { style: { fontSize: 8, ...muted } }),
      B("row.text", { style: { fontSize: 12 } }),
      spacer(8),
    ] },
  ] }],
}));

// ---------------------------------------------------------------- conditional
write("conditional", base("conditional", "Conditional Report", "Rows and sections change colour and visibility based on values.", {
  theme: { currency: "INR" },
  datasets: [{ id: "accounts", source: "inline", query: { data: [
    { customer: "Asha Traders", balance: 12500 }, { customer: "Bright Labs", balance: -4200 },
    { customer: "Care Clinic", balance: 0 }, { customer: "Delta Pharma", balance: -18000 }, { customer: "Evergreen Foods", balance: 7600 },
  ] } }],
  page: A4(),
  sections: [{ type: "detail", children: [
    T("Customer balances", { style: { fontSize: 16, fontWeight: "bold" } }), spacer(8),
    { type: "table", id: "balances", dataset: "accounts",
      rowStyleWhen: [
        { when: "row.balance < 0", style: { color: "#b91c1c", fontWeight: "bold", background: "#fef2f2" } },
        { when: "row.balance == 0", style: { color: "#6b7280" } },
      ],
      columns: [
        { id: "customer", header: "Customer", binding: "row.customer", width: "*" },
        { id: "balance", header: "Balance", binding: "row.balance", format: "currency:INR", width: 120, align: "right" },
        { id: "status", header: "Status", expression: 'row.balance < 0 ? "Overdue" : row.balance == 0 ? "Settled" : "Credit"', width: 90 },
      ] },
    spacer(12),
    { type: "conditional", id: "attention", when: "count(data.accounts) > 3", children: [T("Attention: more than 3 customers listed - review overdue accounts.", { style: { color: "#b45309", fontWeight: "bold" } })], otherwise: [T("Few customers listed.", { style: muted })] },
  ] }],
}));

// ---------------------------------------------------------------- charts
write("charts", base("charts", "Charts Report", "Bar, line and pie charts compiled to vector SVG.", {
  datasets: [{ id: "monthly", source: "inline", query: { data: [
    { month: "Jan", revenue: 120, cost: 80 }, { month: "Feb", revenue: 150, cost: 95 }, { month: "Mar", revenue: 90, cost: 70 },
    { month: "Apr", revenue: 180, cost: 100 }, { month: "May", revenue: 210, cost: 120 }, { month: "Jun", revenue: 170, cost: 110 },
  ] } }],
  page: A4(),
  sections: [{ type: "detail", children: [
    T("Quarterly performance", { style: { fontSize: 16, fontWeight: "bold" } }), spacer(8),
    { type: "chart", id: "bar", chartType: "bar", title: "Revenue vs cost", dataset: "monthly", categoryBinding: "row.month", series: [{ name: "Revenue", binding: "row.revenue" }, { name: "Cost", binding: "row.cost" }], height: 190 },
    spacer(10),
    { type: "chart", id: "line", chartType: "line", title: "Revenue trend", dataset: "monthly", categoryBinding: "row.month", series: [{ name: "Revenue", binding: "row.revenue" }], height: 170 },
    spacer(10),
    { type: "chart", id: "pie", chartType: "pie", title: "Revenue share", dataset: "monthly", categoryBinding: "row.month", series: [{ name: "Revenue", binding: "row.revenue" }], height: 200 },
  ] }],
}));

// ---------------------------------------------------------------- absolute-layout form
write("absolute-form", base("absolute-form", "Certificate (absolute layout)", "Pixel-controlled positioning for forms, certificates and pre-printed stationery.", {
  datasets: [{ id: "cert", source: "inline", query: { data: { name: "Dr. Asha Rao", course: "Advanced Cardiac Life Support", date: "2025-03-14", id: "CERT-88213" } } }],
  page: { size: "A4", orientation: "landscape", unit: "mm", margin: { top: 10, right: 10, bottom: 10, left: 10 } },
  sections: [{ type: "detail", children: [{
    type: "container", id: "canvas", layout: "absolute", height: 480, children: [
      { type: "rectangle", id: "frame", x: 0, y: 0, width: 770, height: 470, style: { border: { width: 3, color: "#1d4ed8" } } },
      T("CERTIFICATE OF COMPLETION", { id: "title", x: 0, y: 70, width: 770, style: { align: "center", fontSize: 30, fontWeight: "bold", color: "#1d4ed8" } }),
      T("This is to certify that", { id: "lead", x: 0, y: 150, width: 770, style: { align: "center", fontSize: 13 } }),
      B("data.cert.name", { id: "name", x: 0, y: 185, width: 770, style: { align: "center", fontSize: 28, fontWeight: "bold" } }),
      T("has successfully completed", { id: "lead2", x: 0, y: 245, width: 770, style: { align: "center", fontSize: 13 } }),
      B("data.cert.course", { id: "course", x: 0, y: 275, width: 770, style: { align: "center", fontSize: 20 } }),
      X('"Issued " + formatDate(data.cert.date, "dd MMM yyyy")', { id: "date", x: 60, y: 400, width: 200, style: { fontSize: 11 } }),
      { type: "line", id: "sig-line", x: 520, y: 420, width: 190 },
      T("Programme Director", { id: "sig", x: 520, y: 426, width: 190, style: { align: "center", fontSize: 10 } }),
      { type: "qrcode", id: "verify", x: 340, y: 370, width: 70, height: 70, expression: "data.cert.id" },
    ],
  }] }],
}));

// ---------------------------------------------------------------- large dataset
{
  const r = rng(7);
  const rows = Array.from({ length: 500 }, (_, i) => ({ id: i + 1, sku: `SKU-${String(i + 1).padStart(5, "0")}`, name: `Item ${i + 1}`, quantity: 1 + Math.floor(r() * 90), price: Math.round(r() * 100000) / 100 }));
  write("large-dataset", base("large-dataset", "Large Dataset Export", "A 500-row table for XLSX/CSV export. Use `report render --format csv` or the export API.", {
    datasets: [{ id: "rows", source: "inline", query: { data: rows } }],
    exports: { xlsx: { sheetName: "Inventory" }, csv: { target: "inventory", delimiter: "," } },
    page: A4(),
    sections: [{ type: "detail", children: [
      T("Inventory export", { style: { fontSize: 14, fontWeight: "bold" } }), spacer(6),
      { type: "table", id: "inventory", dataset: "rows", style: { fontSize: 8 }, columns: [
        { id: "id", header: "#", binding: "row.id", width: 40, align: "right" },
        { id: "sku", header: "SKU", binding: "row.sku", width: 80 },
        { id: "name", header: "Name", binding: "row.name", width: "*" },
        { id: "quantity", header: "Qty", binding: "row.quantity", width: 50, align: "right" },
        { id: "price", header: "Price", binding: "row.price", format: "number:2", width: 80, align: "right" },
      ] },
    ] }],
  }));
}

// ---------------------------------------------------------------- lab specimen label 40x25mm
write("specimen-label", base("specimen-label", "Specimen Label 40x25mm", "Tiny laboratory tube label with name, test, barcode and timestamp.", {
  datasets: [{ id: "sample", source: "inline", query: { data: { patient: "Sai Varaprasad", age: "31", sex: "M", test: "CBC", accession: "260100928374", collected: "2025-10-01 16:20" } } }],
  page: { size: "custom", width: 40, height: 25, unit: "mm", orientation: "landscape", margin: { top: 1.5, right: 2, bottom: 1.5, left: 2 } },
  sections: [{ type: "detail", children: [
    row([T("LAB SAMPLE", { width: "*", style: { fontSize: 5, fontWeight: "bold" } }), B("data.sample.test", { style: { fontSize: 6, fontWeight: "bold", align: "right" } })]),
    X('data.sample.patient + "  " + data.sample.age + "/" + data.sample.sex', { style: { fontSize: 7, fontWeight: "bold" } }),
    { type: "barcode", id: "acc-barcode", value: "", expression: "data.sample.accession", symbology: "code128", height: 28 },
    B("data.sample.accession", { style: { fontSize: 6, align: "center" } }),
    B("data.sample.collected", { style: { fontSize: 5, align: "center", ...muted } }),
  ] }],
}));

// ---------------------------------------------------------------- lab report
write("lab-report", base("lab-report", "Laboratory Report", "Patient block, results table with out-of-range highlighting, interpretation kept with the result.", {
  datasets: [{ id: "report", source: "inline", query: { data: {
    patient: { name: "Sai Varaprasad", age: "31 Y", sex: "Male", uhid: "UH12345", consultant: "Dr. Smith" },
    collected: "2025-10-01 16:20", test: "Complete Blood Count",
    results: [
      { parameter: "Haemoglobin", value: 14.2, unit: "g/dL", low: 13, high: 17 },
      { parameter: "WBC count", value: 11.8, unit: "10^3/uL", low: 4, high: 11 },
      { parameter: "Platelets", value: 255, unit: "10^3/uL", low: 150, high: 410 },
      { parameter: "Haematocrit", value: 38, unit: "%", low: 40, high: 50 },
    ],
    interpretation: "Mild leukocytosis and borderline low haematocrit. Clinical correlation advised.",
  } } }],
  page: A4(),
  sections: [
    { type: "pageHeader", children: [row([T("ACME DIAGNOSTICS", { width: "*", style: { fontSize: 16, fontWeight: "bold", color: "#0f766e" } }), T("Laboratory Report", { style: { align: "right", fontWeight: "bold" } })]), line()] },
    { type: "detail", children: [
      spacer(8),
      row([
        col([row([T("Patient", { width: 70, style: muted }), B("data.report.patient.name", { style: bold })]), row([T("Age / Sex", { width: 70, style: muted }), X('data.report.patient.age + " / " + data.report.patient.sex')])], { width: "*" }),
        col([row([T("UHID", { width: 70, style: muted }), B("data.report.patient.uhid")]), row([T("Consultant", { width: 70, style: muted }), B("data.report.patient.consultant")])], { width: "*" }),
      ]),
      spacer(10),
      B("data.report.test", { style: { fontSize: 12, fontWeight: "bold" }, keepWithNext: true }),
      { type: "table", id: "results", dataset: "report.results", minRowsAfterBreak: 2,
        rowStyleWhen: [{ when: "row.value < row.low || row.value > row.high", style: { fontWeight: "bold", color: "#b91c1c" } }],
        columns: [
          { id: "parameter", header: "Parameter", binding: "row.parameter", width: "*" },
          { id: "value", header: "Result", binding: "row.value", width: 70, align: "right" },
          { id: "unit", header: "Unit", binding: "row.unit", width: 70 },
          { id: "range", header: "Reference", expression: 'row.low + " - " + row.high', width: 90 },
          { id: "flag", header: "Flag", expression: 'row.value < row.low ? "LOW" : row.value > row.high ? "HIGH" : ""', width: 50 },
        ] },
      spacer(10),
      { type: "keepTogether", children: [T("Interpretation", { style: { fontWeight: "bold" } }), B("data.report.interpretation")] },
    ] },
    { type: "pageFooter", children: [row([T("Dr. Smith, MD Pathology", { width: "*", style: { fontSize: 8 } }), X('"Page " + page.number + " of " + page.total', { style: { align: "right", fontSize: 8 } })])] },
  ],
}));

console.log("examples written to", out);
