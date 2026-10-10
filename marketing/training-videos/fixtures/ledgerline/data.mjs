// Fictional merchant data for the Ledgerline payments dashboard. No real businesses, people or accounts.

export const merchant = {
  name: "Brightside Coffee Co.",
  legalName: "Brightside Coffee Private Limited",
  address: "42 12th Main, Indiranagar, Bengaluru 560038",
  gstin: "29AAKCB7731L1Z2",
  email: "accounts@brightside.example",
  merchantId: "LDG-MER-30418",
  settlementAccount: "HDFC ···· 4417",
};

const lines = {
  beans: ["House blend beans · 1 kg", 1150],
  coldbrew: ["Cold brew concentrate · 1 L", 640],
  catering: ["Office catering · coffee bar (per head)", 180],
  barista: ["Barista on site · per hour", 900],
  pastries: ["Pastry box · 12 pcs", 720],
};
const item = (key, quantity) => ({ description: lines[key][0], quantity, rate: lines[key][1] });

export const invoices = [
  { id: "BSC-INV-1187", date: "2026-10-09", due: "2026-10-23", status: "Paid", method: "UPI · Ledgerline Pay", customer: { name: "Acme Technologies Pvt Ltd", address: "Embassy Tech Village, Bengaluru 560103", gstin: "29AABCA1234M1Z9" }, items: [item("catering", 120), item("barista", 6), item("pastries", 10)] },
  { id: "BSC-INV-1188", date: "2026-10-10", due: "2026-10-24", status: "Pending", method: "Payment link", customer: { name: "Lumen Design Studio", address: "17 Church Street, Bengaluru 560001", gstin: "29AAFCL5521Q1Z4" }, items: [item("beans", 8), item("coldbrew", 12)] },
  { id: "BSC-INV-1189", date: "2026-10-10", due: "2026-10-24", status: "Paid", method: "Card · Visa ···· 0921", customer: { name: "Northwind Co-working", address: "88 Residency Road, Bengaluru 560025", gstin: "29AAGCN9087K1Z1" }, items: [item("catering", 60), item("pastries", 4)] },
];

export const invoiceAmounts = (invoice) => {
  const subtotal = invoice.items.reduce((sum, line) => sum + line.quantity * line.rate, 0);
  const gst = Math.round(subtotal * 0.05 * 100) / 100;
  return { subtotal, gst, total: subtotal + gst };
};

/** A month of card and UPI settlements, deterministic so every recording shows the same statement. */
export function settlements() {
  const methods = ["UPI", "Card", "UPI", "UPI", "Card", "Wallet"];
  const rows = [];
  for (let day = 1; day <= 30; day += 1) {
    const count = 1 + ((day * 7) % 3);
    for (let n = 0; n < count; n += 1) {
      const gross = 820 + ((day * 131 + n * 97) % 2400);
      const method = methods[(day + n) % methods.length];
      const fee = Math.round(gross * (method === "Card" ? 0.018 : method === "Wallet" ? 0.012 : 0) * 100) / 100;
      rows.push({ date: `2026-09-${String(day).padStart(2, "0")}`, reference: `TXN${(904100 + day * 10 + n).toString()}`, method, gross, fee, net: Math.round((gross - fee) * 100) / 100 });
    }
  }
  return rows;
}

export const invoiceData = (invoice, origin) => ({
  invoice: { ...invoice, ...invoiceAmounts(invoice) },
  merchant: { ...merchant, logo: new URL("/brightside-mark.png", origin).href },
});

export const statementData = (origin) => ({
  merchant: { ...merchant, logo: new URL("/brightside-mark.png", origin).href, period: "September 2026" },
  settlements: settlements(),
});
