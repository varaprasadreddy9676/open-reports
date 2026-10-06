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
const HOSPITAL_LOGO = "https://open-reports-demo.onrender.com/demo-videos/letterhead-assets/northstar-primary-logo.png";
const HOSPITAL_SEAL = "https://open-reports-demo.onrender.com/demo-videos/letterhead-assets/northstar-accreditation-mark.png";
const hospitalMasthead = (title, compact = false) => [
  row([
    { type: "image", id: "hospital-left-logo", src: HOSPITAL_LOGO, width: compact ? 24 : 30, height: compact ? 24 : 30, fit: "contain", alt: "Replaceable hospital logo" },
    col([
      T("NORTHSTAR MEDICAL CENTER", { style: { fontSize: compact ? 10.5 : 15, fontWeight: "bold", color: "#143753" } }),
      T("CARE WITH CLARITY · COMPASSION IN EVERY STEP", { style: { fontSize: compact ? 5.5 : 6.5, fontWeight: "bold", color: "#167c80" } }),
      T("123 Meridian Avenue · Bengaluru 560001 · +91 80 4567 8900", { style: { fontSize: compact ? 5.5 : 6.5, color: "#526575" } }),
    ], { width: "*" }),
    { type: "image", id: "hospital-right-seal", src: HOSPITAL_SEAL, width: compact ? 22 : 28, height: compact ? 22 : 28, fit: "contain", alt: "Replaceable hospital accreditation seal" },
  ], { gap: 4, alignItems: "center" }),
  line(),
  T(title.toUpperCase(), { style: { fontSize: 8, fontWeight: "bold", color: "#526575" } }),
];
const hospitalHeader = (title, compact = false) => ({ type: "pageHeader", appliesTo: "first", children: hospitalMasthead(title, compact) });
const hospitalRepeatHeader = (patientExpression, title) => ({
  type: "pageHeader",
  children: [row([
    X(patientExpression, { width: "*", style: { fontSize: 7.5, color: "#526575" } }),
    T(title.toUpperCase(), { style: { align: "right", fontSize: 7.5, fontWeight: "bold", color: "#143753" } }),
  ]), line()],
});
const hospitalFooter = (left = T("Northstar Medical Center · 080 4567 8900 · northstar.example", { width: "*", style: { fontSize: 6.5, color: "#526575" } })) => ({
  type: "pageFooter",
  children: [
    line(),
    row([left, X('"Page " + page.number + " of " + page.total', { style: { align: "right", fontSize: 7, color: "#526575" } })]),
    T("Confidential patient information · For care-team use", { style: { fontSize: 6, align: "center", color: "#718096" } }),
  ],
});
const base = (id, name, description, extra) => ({ schemaVersion: "1.0", id, name, description, locale: "en-IN", ...extra });
const write = (file, doc) => writeFileSync(join(out, `${file}.report.json`), JSON.stringify(doc, null, 2) + "\n");
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

// ---------------------------------------------------------------- invoice
write("invoice", base("invoice", "Invoice", "Clinic invoice with replaceable left and right hospital logos, patient billing details, payment QR, and a branded footer. Replace the image sources and hospital details.", {
  theme: { currency: "INR" },
  datasets: [{
    id: "invoice", source: "inline",
    query: { data: {
      number: "INV-1001", date: "2025-01-15", status: "Due",
      customer: { name: "Alex Morgan", address: "12 MG Road, Bengaluru 560001", phone: "+91 98765 43210" },
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
    hospitalHeader("Invoice"),
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
          { type: "qrcode", id: "pay-qr", expression: '"upi://pay?pa=northstar@bank&am=" + vars.total', width: 100, height: 80 },
          col([
            row([T("Subtotal", { width: "*" }), X("formatCurrency(vars.subtotal)", { width: 110, style: right })]),
            row([T("GST 18%", { width: "*" }), X("formatCurrency(vars.tax)", { width: 110, style: right })]),
            line(),
            row([T("Total", { width: "*", style: { fontSize: 13, fontWeight: "bold" } }), X("formatCurrency(vars.total)", { width: 110, style: { align: "right", fontSize: 13, fontWeight: "bold" } })]),
          ], { width: "*" }),
        ]),
      ] },
    ] },
    hospitalFooter(),
  ],
}));

// ---------------------------------------------------------------- receipt (80mm thermal)
write("receipt", base("receipt", "Receipt (80mm)", "Hospital pharmacy receipt with a replaceable logo, itemized bill, payment QR and branded thank-you footer.", {
  theme: { currency: "INR" },
  datasets: [{ id: "sale", source: "inline", query: { data: {
    shop: "NORTHSTAR PHARMACY", address: "123 Meridian Avenue, Bengaluru", bill: "B-20931", time: "2025-01-15 16:20",
    items: [{ name: "Paracetamol 500mg", qty: 2, price: 18 }, { name: "Cough Syrup 100ml", qty: 1, price: 96 }, { name: "Vitamin C", qty: 3, price: 42 }],
  } } }],
  variables: [{ id: "total", scope: "report", expression: 'sumProduct(data.sale.items, "qty", "price")' }],
  page: { size: "custom", width: 80, height: 170, unit: "mm", orientation: "portrait", margin: { top: 4, right: 4, bottom: 4, left: 4 } },
  print: { printerType: "receipt", language: "escpos", dpi: 203, safeMargin: 2 },
  sections: [{ type: "detail", children: [
    row([
      { type: "image", id: "hospital-receipt-logo", src: HOSPITAL_LOGO, width: 18, height: 18, fit: "contain", alt: "Replaceable hospital logo" },
      col([B("data.sale.shop", { style: { fontWeight: "bold", fontSize: 10 } }), B("data.sale.address", { style: { fontSize: 7 } })], { width: "*" }),
    ], { gap: 3, alignItems: "center" }),
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
    T("Northstar Medical Center · 080 4567 8900", { style: { align: "center", fontSize: 6, ...muted } }),
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
    datasets: [{ id: "account", source: "inline", query: { data: { holder: "Alex Morgan", number: "XXXX-4471", period: "Jan - Mar 2025", transactions: tx } } }],
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
          rowRules: [{ when: "row.balance < 30000", set: { "style.color": "#b91c1c" } }],
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
write("multilingual", base("multilingual", "Multilingual Report", "Hospital patient notice with replaceable left and right logos, multilingual content and a branded footer (needs Noto fonts for PDF). Replace the image sources and hospital details.", {
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
  sections: [hospitalHeader("Patient Notice"), { type: "detail", children: [
    T("Multilingual notice", { style: { fontSize: 18, fontWeight: "bold" } }), spacer(10),
    { type: "repeater", id: "lines", dataset: "greetings", children: [
      B("row.language", { style: { fontSize: 8, ...muted } }),
      B("row.text", { style: { fontSize: 12 } }),
      spacer(8),
    ] },
  ] }, hospitalFooter()],
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
      rowRules: [
        { when: "row.balance < 0", set: { "style.color": "#b91c1c", "style.fontWeight": "bold", "style.background": "#fef2f2" } },
        { when: "row.balance == 0", set: { "style.color": "#6b7280" } },
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
  datasets: [{ id: "sample", source: "inline", query: { data: { patient: "Alex Morgan", age: "31", sex: "M", test: "CBC", accession: "260100928374", collected: "2025-10-01 16:20" } } }],
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
write("lab-report", base("lab-report", "Laboratory Report", "Hospital letterhead with replaceable left and right logos, a results table, and a branded footer. Replace the image sources and hospital details to make it yours.", {
  datasets: [{ id: "report", source: "inline", query: { data: {
    patient: { name: "Alex Morgan", age: "31 Y", sex: "Male", uhid: "UH12345", consultant: "Dr. Smith" },
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
    hospitalHeader("Laboratory Report"),
    hospitalRepeatHeader('"Patient: " + data.report.patient.name + " · UHID " + data.report.patient.uhid', "Laboratory Report"),
    { type: "detail", children: [
      spacer(8),
      row([
        col([row([T("Patient", { width: 70, style: muted }), B("data.report.patient.name", { style: bold })]), row([T("Age / Sex", { width: 70, style: muted }), X('data.report.patient.age + " / " + data.report.patient.sex')])], { width: "*" }),
        col([row([T("UHID", { width: 70, style: muted }), B("data.report.patient.uhid")]), row([T("Consultant", { width: 70, style: muted }), B("data.report.patient.consultant")])], { width: "*" }),
      ]),
      spacer(10),
      B("data.report.test", { style: { fontSize: 12, fontWeight: "bold" }, keepWithNext: true }),
      { type: "table", id: "results", dataset: "report.results", minRowsAfterBreak: 2,
        rowRules: [{ when: "row.value < row.low || row.value > row.high", set: { "style.fontWeight": "bold", "style.color": "#b91c1c" } }],
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
    hospitalFooter(T("Dr. Smith, MD Pathology · Sign and stamp", { width: "*", style: { fontSize: 7, fontWeight: "bold", color: "#526575" } })),
  ],
}));

// ---------------------------------------------------------------- label & healthcare starters
const labelPage = (w, h, extra = {}) => ({ size: "custom", width: w, height: h, unit: "mm", orientation: "landscape", margin: { top: 1.5, right: 2, bottom: 1.5, left: 2 }, ...extra });
const patientData = { name: "Alex Morgan", uhid: "UH12345", age: "31", sex: "M", dob: "1994-05-12", ward: "Ward 4B", bed: "12", doctor: "Dr. Smith", allergy: "Penicillin", admitted: "2025-10-01 09:40" };

write("wristband", base("wristband", "Patient Wristband 25x250mm", "Long hospital wristband with a replaceable logo, patient and allergy details, and a scannable UHID barcode.", {
  datasets: [{ id: "patient", source: "inline", query: { data: patientData } }],
  page: { size: "custom", width: 250, height: 25, unit: "mm", orientation: "landscape", margin: { top: 2, right: 4, bottom: 2, left: 4 } },
  print: { name: "Zebra wristband", printerType: "wristband", language: "zpl", dpi: 300, safeMargin: 1 },
  sections: [{ type: "detail", children: [
    row([
      { type: "image", id: "hospital-wristband-logo", src: HOSPITAL_LOGO, width: 17, height: 17, fit: "contain", alt: "Replaceable hospital logo" },
      col([B("data.patient.name", { style: { fontSize: 12, fontWeight: "bold" } }), X('"UHID " + data.patient.uhid + "   DOB " + data.patient.dob + "   " + data.patient.sex', { style: { fontSize: 8 } }), X('"Allergy: " + data.patient.allergy', { style: { fontSize: 8, fontWeight: "bold", color: "#b91c1c" } })], { width: "*" }),
      { type: "barcode", id: "uhid-barcode", value: "", expression: "data.patient.uhid", symbology: "code128", width: 80, height: 18 },
    ], { alignItems: "center", gap: 6 }),
  ] }],
}));

write("pharmacy-label", base("pharmacy-label", "Pharmacy Label 50x30mm", "Medication label: drug, dose, patient, expiry and QR for dispensing records.", {
  datasets: [{ id: "rx", source: "inline", query: { data: { drug: "Amoxicillin 500 mg", dose: "1 capsule every 8 hours after food", patient: "Alex Morgan", qty: "21 capsules", expiry: "2026-08", batch: "B2291", code: "RX-884201" } } }],
  page: labelPage(50, 30),
  print: { name: "Zebra ZD421 203dpi", printerType: "label", language: "zpl", dpi: 203, safeMargin: 1.5 },
  sections: [{ type: "detail", children: [
    B("data.rx.drug", { style: { fontSize: 9, fontWeight: "bold" } }),
    B("data.rx.dose", { style: { fontSize: 6.5 } }),
    row([
      col([B("data.rx.patient", { style: { fontSize: 7, fontWeight: "bold" } }), X('data.rx.qty + " · Exp " + data.rx.expiry', { style: { fontSize: 6 } }), X('"Batch " + data.rx.batch', { style: { fontSize: 6, ...muted } })], { width: "*" }),
      { type: "qrcode", id: "rx-qr", value: "", expression: "data.rx.code", width: 34, height: 34 },
    ], { gap: 4 }),
  ] }],
}));

write("blood-bag-label", base("blood-bag-label", "Blood Bag Label 100x50mm", "Blood bag label with group, unit number barcode and expiry. Verify every field before use.", {
  datasets: [{ id: "unit", source: "inline", query: { data: { group: "O POSITIVE", unit: "W0123 25 456789", component: "Packed Red Cells", collected: "2025-10-01", expiry: "2025-11-05", volume: "350 mL" } } }],
  page: labelPage(100, 50, { margin: { top: 3, right: 4, bottom: 3, left: 4 } }),
  print: { name: "Zebra ZT411 300dpi", printerType: "label", language: "zpl", dpi: 300, safeMargin: 2 },
  sections: [{ type: "detail", children: [
    row([B("data.unit.group", { width: "*", style: { fontSize: 22, fontWeight: "bold" } }), B("data.unit.component", { style: { fontSize: 9, align: "right" } })], { alignItems: "center" }),
    { type: "barcode", id: "unit-barcode", value: "", expression: 'replace(data.unit.unit, " ", "")', symbology: "code128", width: 250, height: 40 },
    B("data.unit.unit", { style: { fontSize: 9, align: "center" } }),
    row([X('"Collected " + data.unit.collected', { width: "*", style: { fontSize: 8 } }), X('"Expiry " + data.unit.expiry', { style: { fontSize: 8, fontWeight: "bold", align: "right" } })]),
    B("data.unit.volume", { style: { fontSize: 8, ...muted } }),
  ] }],
}));

write("patient-id-card", base("patient-id-card", "Patient ID Card", "Hospital patient ID card with a replaceable logo, patient details, UHID and QR code.", {
  datasets: [{ id: "patient", source: "inline", query: { data: patientData } }],
  page: { size: "custom", width: 85.6, height: 54, unit: "mm", orientation: "landscape", margin: { top: 4, right: 4, bottom: 4, left: 4 } },
  print: { name: "Card printer", printerType: "card", language: "pdf", dpi: 300, safeMargin: 2 },
  sections: [{ type: "detail", children: [
    row([
      { type: "image", id: "hospital-card-logo", src: HOSPITAL_LOGO, width: 14, height: 14, fit: "contain", alt: "Replaceable hospital logo" },
      T("NORTHSTAR MEDICAL CENTER", { style: { fontSize: 7, fontWeight: "bold", color: "#143753" } }),
    ], { gap: 2, alignItems: "center" }),
    row([
      col([B("data.patient.name", { style: { fontSize: 11, fontWeight: "bold" } }), X('"UHID: " + data.patient.uhid', { style: { fontSize: 8 } }), X('"DOB: " + data.patient.dob + "  " + data.patient.sex', { style: { fontSize: 8 } })], { width: "*" }),
      { type: "qrcode", id: "card-qr", value: "", expression: "data.patient.uhid", width: 52, height: 52 },
    ], { gap: 6 }),
  ] }],
}));

write("receipt-58mm", base("receipt-58mm", "Receipt 58mm", "Compact hospital pharmacy receipt with a replaceable logo, itemized total and contact footer.", {
  theme: { currency: "INR" },
  datasets: [{ id: "sale", source: "inline", query: { data: { store: "NORTHSTAR PHARMACY", number: "R-5521", date: "2025-10-01 16:40", items: [{ name: "Paracetamol 500", qty: 2, price: 24 }, { name: "ORS sachet", qty: 3, price: 18 }, { name: "Vitamin C", qty: 1, price: 95 }] } } }],
  variables: [{ id: "total", scope: "report", expression: 'sumProduct(data.sale.items, "qty", "price")' }],
  page: { size: "custom", width: 58, height: 160, unit: "mm", orientation: "portrait", margin: { top: 3, right: 3, bottom: 3, left: 3 } },
  print: { name: "58mm thermal", printerType: "receipt", language: "escpos", dpi: 203, safeMargin: 2 },
  sections: [{ type: "detail", children: [
    row([
      { type: "image", id: "hospital-receipt-logo", src: HOSPITAL_LOGO, width: 12, height: 12, fit: "contain", alt: "Replaceable hospital logo" },
      B("data.sale.store", { style: { fontSize: 8, fontWeight: "bold" } }),
    ], { gap: 2, alignItems: "center" }),
    X('data.sale.number + "  " + data.sale.date', { style: { fontSize: 6, align: "center", ...muted } }),
    line(),
    { type: "table", id: "lines", dataset: "sale.items", showHeader: false, style: { fontSize: 7 }, columns: [
      { id: "name", header: "Item", binding: "row.name", width: "*" },
      { id: "qty", header: "Qty", binding: "row.qty", width: 14, align: "right" },
      { id: "amt", header: "Amt", expression: "row.qty * row.price", format: "currency", width: 34, align: "right" },
    ] },
    line(),
    row([T("TOTAL", { width: "*", style: { fontSize: 9, fontWeight: "bold" } }), X("vars.total", { format: "currency", style: { fontSize: 9, fontWeight: "bold", align: "right" } })]),
    T("Thank you · Northstar Medical Center · 080 4567 8900", { style: { fontSize: 5.5, align: "center", ...muted } }),
  ] }],
}));

write("label-50x30", base("label-50x30", "Label 50x30mm", "Generic product / sample label: title, two lines of detail and a barcode.", {
  datasets: [{ id: "item", source: "inline", query: { data: { title: "SAMPLE ITEM", line1: "Lot 2291  ·  Exp 2026-08", line2: "Store below 25 °C", code: "8901234567890" } } }],
  page: labelPage(50, 30),
  print: { name: "203 dpi label printer", printerType: "label", language: "zpl", dpi: 203, safeMargin: 1.5 },
  sections: [{ type: "detail", children: [
    B("data.item.title", { style: { fontSize: 9, fontWeight: "bold" } }),
    B("data.item.line1", { style: { fontSize: 6.5 } }),
    B("data.item.line2", { style: { fontSize: 6, ...muted } }),
    { type: "barcode", id: "item-barcode", value: "", expression: "data.item.code", symbology: "code128", width: 125, height: 30 },
  ] }],
}));

write("label-100x50", base("label-100x50", "Label 100x50mm", "Shipping-style label with a large title, address block and barcode.", {
  datasets: [{ id: "ship", source: "inline", query: { data: { to: "Alex Morgan", address: "12 MG Road, Bengaluru 560001", ref: "SHP-2025-0098", code: "SHP20250098" } } }],
  page: labelPage(100, 50, { margin: { top: 3, right: 4, bottom: 3, left: 4 } }),
  print: { name: "300 dpi label printer", printerType: "label", language: "zpl", dpi: 300, safeMargin: 2 },
  sections: [{ type: "detail", children: [
    T("SHIP TO", { style: { fontSize: 7, ...muted } }),
    B("data.ship.to", { style: { fontSize: 16, fontWeight: "bold" } }),
    B("data.ship.address", { style: { fontSize: 10 } }),
    spacer(4),
    { type: "barcode", id: "ship-barcode", value: "", expression: "data.ship.code", symbology: "code128", width: 250, height: 40 },
    B("data.ship.ref", { style: { fontSize: 8, align: "center" } }),
  ] }],
}));

write("prescription", base("prescription", "Prescription", "Hospital letterhead with replaceable left and right logos, patient and medicine details, and a signature area. Replace the image sources and hospital details.", {
  datasets: [{ id: "rx", source: "inline", query: { data: {
    doctor: { name: "Dr. A. Smith", reg: "KMC 48213", clinic: "ACME Health Clinic, Bengaluru" },
    patient: { name: "Alex Morgan", age: "31", sex: "Male", uhid: "UH12345", date: "2025-10-01" },
    diagnosis: "Acute pharyngitis",
    medicines: [
      { name: "Amoxicillin 500 mg", dose: "1-0-1", days: 5, notes: "After food" },
      { name: "Paracetamol 650 mg", dose: "SOS", days: 3, notes: "Max 3 per day" },
      { name: "Saline gargle", dose: "1-1-1", days: 5, notes: "" },
    ],
  } } }],
  page: A4({ size: "A5" }),
  sections: [
    hospitalHeader("Prescription", true),
    hospitalRepeatHeader('"Prescription · " + data.rx.patient.name + " · UHID " + data.rx.patient.uhid', "Prescription"),
    { type: "detail", children: [
      spacer(6),
      X('data.rx.doctor.name + " · " + data.rx.doctor.reg + " · " + data.rx.doctor.clinic', { style: { fontSize: 8, ...muted } }),
      row([X('"Patient: " + data.rx.patient.name + " (" + data.rx.patient.age + "/" + data.rx.patient.sex + ")"', { width: "*", style: bold }), X('"Date: " + data.rx.patient.date', { style: { align: "right" } })]),
      X('"Diagnosis: " + data.rx.diagnosis', { style: { fontSize: 9 } }),
      spacer(8),
      T("Rx", { style: { fontSize: 18, fontWeight: "bold" } }),
      { type: "table", id: "medicines", dataset: "rx.medicines", columns: [
        { id: "name", header: "Medicine", binding: "row.name", width: "*" },
        { id: "dose", header: "Dose", binding: "row.dose", width: 50 },
        { id: "days", header: "Days", binding: "row.days", width: 36, align: "right" },
        { id: "notes", header: "Notes", binding: "row.notes", width: 90 },
      ] },
      spacer(40),
      { type: "keepTogether", children: [line(), T("Doctor's signature", { style: { fontSize: 8, align: "right", ...muted } })] },
    ] },
    hospitalFooter(B("data.rx.doctor.name", { width: "*", style: { fontSize: 7, color: "#526575" } })),
  ],
}));

write("radiology-report", base("radiology-report", "Radiology Report", "Hospital letterhead with replaceable left and right logos, patient and study details, findings, and a branded footer. Replace the image sources and hospital details.", {
  datasets: [{ id: "study", source: "inline", query: { data: {
    patient: { name: "Alex Morgan", age: "31 Y", sex: "Male", uhid: "UH12345" },
    exam: "X-ray chest PA view", date: "2025-10-01", radiologist: "Dr. R. Rao, MD Radiology",
    sections: [
      { heading: "Technique", text: "Single frontal chest radiograph obtained in erect position at full inspiration." },
      { heading: "Findings", text: "Both lung fields are clear. No consolidation, effusion or pneumothorax. Cardiac silhouette is normal in size. Both costophrenic angles are sharp. Bony thorax and soft tissues are unremarkable." },
    ],
    impression: "No acute cardiopulmonary abnormality.",
  } } }],
  page: A4(),
  sections: [
    hospitalHeader("Radiology Report"),
    hospitalRepeatHeader('"Patient: " + data.study.patient.name + " · UHID " + data.study.patient.uhid', "Radiology Report"),
    { type: "detail", children: [
      spacer(8),
      row([X('"Patient: " + data.study.patient.name + " · " + data.study.patient.age + " / " + data.study.patient.sex', { width: "*", style: bold }), X('"UHID: " + data.study.patient.uhid')]),
      row([B("data.study.exam", { width: "*" }), X('"Date: " + data.study.date', { style: { align: "right" } })]),
      spacer(10),
      { type: "repeater", id: "findings", dataset: "study.sections", children: [
        { type: "keepTogether", children: [B("row.heading", { style: { fontWeight: "bold", fontSize: 11 }, keepWithNext: true }), B("row.text", { minLinesAtTop: 2, minLinesAtBottom: 2 }), spacer(6)] },
      ] },
      { type: "keepTogether", children: [T("Impression", { style: { fontWeight: "bold", fontSize: 11 } }), B("data.study.impression", { style: bold })] },
    ] },
    hospitalFooter(B("data.study.radiologist", { width: "*", style: { fontSize: 7, fontWeight: "bold", color: "#526575" } })),
  ],
}));

write("discharge-summary", base("discharge-summary", "Discharge Summary", "Multi-page discharge summary with replaceable left and right hospital logos, a repeating patient banner, and a branded footer. Replace the image sources and hospital details.", {
  datasets: [{ id: "adm", source: "inline", query: { data: {
    patient: { name: "Alex Morgan", age: "31 Y", sex: "Male", uhid: "UH12345", ward: "Ward 4B" },
    admitted: "2025-09-28", discharged: "2025-10-01", doctor: "Dr. A. Smith", diagnosis: "Acute appendicitis - post laparoscopic appendicectomy",
    course: "Patient presented with right iliac fossa pain and fever. Ultrasound confirmed appendicitis. Underwent laparoscopic appendicectomy under general anaesthesia on 29 Sep. Post-operative course was uneventful. Oral intake resumed on day 1. Wounds healthy at discharge.",
    medicines: [
      { name: "Cefuroxime 500 mg", dose: "1-0-1", days: 5 },
      { name: "Paracetamol 650 mg", dose: "SOS", days: 5 },
      { name: "Pantoprazole 40 mg", dose: "1-0-0", days: 7 },
    ],
    followup: "Review in surgical OPD after 7 days with the histopathology report. Return immediately for fever, vomiting or wound discharge.",
  } } }],
  page: A4(),
  sections: [
    hospitalHeader("Discharge Summary"),
    hospitalRepeatHeader('data.adm.patient.name + " · UHID " + data.adm.patient.uhid', "Discharge Summary"),
    { type: "detail", children: [
      spacer(6),
      row([
        col([row([T("Patient", { width: 60, style: muted }), B("data.adm.patient.name", { style: bold })]), row([T("Age / Sex", { width: 60, style: muted }), X('data.adm.patient.age + " / " + data.adm.patient.sex')])], { width: "*" }),
        col([row([T("Admitted", { width: 60, style: muted }), B("data.adm.admitted")]), row([T("Discharged", { width: 60, style: muted }), B("data.adm.discharged")])], { width: "*" }),
      ]),
      spacer(10),
      T("Diagnosis", { style: { fontWeight: "bold", fontSize: 11 }, keepWithNext: true }), B("data.adm.diagnosis"),
      spacer(8),
      T("Hospital course", { style: { fontWeight: "bold", fontSize: 11 }, keepWithNext: true }), B("data.adm.course", { minLinesAtTop: 2, minLinesAtBottom: 2 }),
      spacer(8),
      T("Medicines on discharge", { style: { fontWeight: "bold", fontSize: 11 }, keepWithNext: true }),
      { type: "table", id: "discharge-meds", dataset: "adm.medicines", columns: [
        { id: "name", header: "Medicine", binding: "row.name", width: "*" },
        { id: "dose", header: "Dose", binding: "row.dose", width: 60 },
        { id: "days", header: "Days", binding: "row.days", width: 40, align: "right" },
      ] },
      spacer(8),
      { type: "keepTogether", children: [T("Follow-up", { style: { fontWeight: "bold", fontSize: 11 } }), B("data.adm.followup")] },
    ] },
    { type: "pageFooter", appliesTo: "last", children: [row([B("data.adm.doctor", { width: "*", style: { fontSize: 8, fontWeight: "bold" } }), T("Signature and stamp", { style: { fontSize: 7, ...muted } })])] },
    hospitalFooter(),
  ],
}));

write("sticker-sheet", base("sticker-sheet", "Sticker Sheet (A4, 2x4 labels)", "Eight 99.1x67.7 mm labels per A4 sheet (Avery L7165 style), one per patient record, with start position for partly used sheets.", {
  datasets: [{ id: "patients", source: "inline", query: { data: [
    { name: "Alex Morgan", uhid: "UH12345", dob: "1994-05-12" },
    { name: "Anita Rao", uhid: "UH12346", dob: "1988-11-02" },
    { name: "Ravi Kumar", uhid: "UH12347", dob: "1975-03-21" },
    { name: "Meena Iyer", uhid: "UH12348", dob: "2001-07-30" },
    { name: "John Mathew", uhid: "UH12349", dob: "1969-01-14" },
    { name: "Fatima Khan", uhid: "UH12350", dob: "1992-09-09" },
    { name: "Arjun Das", uhid: "UH12351", dob: "1983-12-25" },
    { name: "Latha S", uhid: "UH12352", dob: "1997-04-18" },
    { name: "Imran Ali", uhid: "UH12353", dob: "1990-06-06" },
    { name: "Kavya N", uhid: "UH12354", dob: "2005-02-27" },
  ] } }],
  page: { size: "A4", orientation: "portrait", unit: "mm", margin: { top: 13, right: 4.65, bottom: 0, left: 4.65 } },
  print: { name: "A4 label sheet", printerType: "document", language: "pdf", dpi: 300, safeMargin: 4 },
  sections: [{ type: "detail", children: [{
    type: "labelSheet", id: "sheet", dataset: "patients", columns: 2, rows: 4, labelWidth: 99.1, labelHeight: 67.7, gapX: 2.5, gapY: 0, startPosition: 1,
    children: [
      B("row.name", { style: { fontSize: 14, fontWeight: "bold" } }),
      X('"UHID " + row.uhid', { style: { fontSize: 10 } }),
      X('"DOB " + row.dob', { style: { fontSize: 9, color: "#6b7280" } }),
      { type: "barcode", id: "sheet-barcode", value: "", expression: "row.uhid", symbology: "code128", width: 150, height: 34 },
    ],
  }] }],
}));

// ---------------------------------------------------------------- banded report (groups, repeated headers, subtotals)
{
  const r = rng(11);
  const depts = ["Cardiology", "Orthopaedics", "Paediatrics"];
  const docs = { Cardiology: ["Dr. Rao", "Dr. Iyer"], Orthopaedics: ["Dr. Khan", "Dr. Mathew"], Paediatrics: ["Dr. Das", "Dr. Reddy"] };
  const visits = [];
  for (let i = 0; i < 90; i++) {
    const dept = depts[Math.floor(r() * 3)];
    visits.push({ dept, doctor: docs[dept][Math.floor(r() * 2)], patient: `Patient ${String(i + 1).padStart(3, "0")}`, uhid: `UH${1000 + i}`, amount: Math.round(r() * 3000 + 300), note: r() > 0.7 ? "Follow-up advised in two weeks with repeat investigations." : "" });
  }
  write("department-report", base("department-report", "Department Revenue (banded)", "Hospital-branded grouped report with replaceable left and right logos, repeating headers, subtotals, and a confidentiality footer. Replace the image sources and hospital details.", {
    theme: { currency: "INR" },
    datasets: [{ id: "visits", source: "inline", query: { data: visits } }],
    groups: [
      { id: "dept", name: "Department", dataset: "visits", by: "row.dept", sort: "asc", repeatHeader: true, newPage: "none", keepTogether: false, minDetailRows: 2 },
      { id: "doctor", name: "Doctor", by: "row.doctor", sort: "asc", repeatHeader: false, minDetailRows: 1 },
    ],
    page: A4(),
    watermark: { text: "SAMPLE", opacity: 0.08, pages: "first" },
    sections: [
      { type: "reportHeader", name: "Report title", children: [...hospitalMasthead("Department Revenue Report"), T("Outpatient visits grouped by department and doctor", { style: { fontSize: 9, ...muted } }), spacer(6)] },
      { type: "pageHeader", name: "Page header", appliesTo: "standard", children: [row([
        { type: "image", id: "hospital-repeat-logo", src: HOSPITAL_LOGO, width: 14, height: 14, fit: "contain", alt: "Replaceable hospital logo" },
        T("NORTHSTAR MEDICAL CENTER", { width: "*", style: { fontSize: 8, fontWeight: "bold", color: "#143753" } }),
        T("Department Revenue", { style: { fontSize: 8, align: "right", color: "#526575" } }),
      ], { gap: 3, alignItems: "center" }), line()] },
      { type: "pageFooter", name: "Page footer", children: hospitalFooter().children },
      { type: "dataHeader", name: "Column headings", dataset: "visits", children: [row([T("Patient", { width: "*", style: { fontWeight: "bold", fontSize: 9 } }), T("UHID", { width: 70, style: { fontWeight: "bold", fontSize: 9 } }), T("Amount", { width: 80, style: { fontWeight: "bold", fontSize: 9, align: "right" } })]), line()] },
      { type: "groupHeader", name: "Department header", groupId: "dept", children: [X('"Department: " + group.key', { style: { fontSize: 12, fontWeight: "bold", color: "#1d4ed8" }, expression: '"Department: " + group.key' })], style: { background: "#eff6ff" } },
      { type: "groupHeader", name: "Doctor header", groupId: "doctor", children: [X('"   " + group.key + "  (" + group.count + " visits)"', { style: { fontWeight: "bold", fontSize: 10 } })] },
      { type: "detail", id: "visit-line", name: "Visit", dataset: "visits", children: [row([B("row.patient", { width: "*", style: { fontSize: 9 } }), B("row.uhid", { width: 70, style: { fontSize: 9, ...muted } }), B("row.amount", { width: 80, format: "currency", style: { fontSize: 9, align: "right" } })])] },
      { type: "child", name: "Visit note", parent: "visit-line", suppressWhenBlank: true, children: [B("row.note", { style: { fontSize: 8, color: "#b45309" } })] },
      { type: "groupFooter", name: "Doctor subtotal", groupId: "doctor", children: [row([T("Doctor total", { width: "*", style: { fontSize: 9, ...muted } }), X('sumBy(group.rows, "amount")', { width: 80, format: "currency", style: { fontSize: 9, fontWeight: "bold", align: "right" } })]), spacer(4)] },
      { type: "groupFooter", name: "Department subtotal", groupId: "dept", children: [row([T("Department total", { width: "*", style: { fontWeight: "bold" } }), X('sumBy(group.rows, "amount")', { width: 80, format: "currency", style: { fontWeight: "bold", align: "right" } })]), line(), spacer(8)] },
      { type: "dataFooter", name: "Grand total", dataset: "visits", children: [row([T("GRAND TOTAL", { width: "*", style: { fontSize: 12, fontWeight: "bold" } }), X('sumBy(data.visits, "amount")', { width: 100, format: "currency", style: { fontSize: 12, fontWeight: "bold", align: "right" } })])] },
      { type: "noData", name: "No visits", dataset: "visits", children: [T("No visits in the selected period.", { style: { align: "center", ...muted } })] },
    ],
  }));
}

console.log("examples written to", out);
