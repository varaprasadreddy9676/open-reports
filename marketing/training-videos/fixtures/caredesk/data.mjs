// Fictional hospital data for the CareDesk HIMS training host. No real patients, staff or organisations.

export const branches = {
  bengaluru: {
    id: "bengaluru",
    label: "Northstar Medical Center · Bengaluru",
    branding: {
      name: "NORTHSTAR MEDICAL CENTER",
      tagline: "CARE WITH CLARITY · COMPASSION IN EVERY STEP",
      address: "123 Meridian Avenue, Bengaluru 560001",
      phone: "+91 80 4567 8900",
      email: "billing@northstar.example",
      gstin: "29AANCN4821K1Z6",
      logo: "/assets/northstar-logo.png",
      seal: "/assets/northstar-seal.png",
      accent: "#143753",
    },
  },
  mysuru: {
    id: "mysuru",
    label: "Northstar Children's Hospital · Mysuru",
    branding: {
      name: "NORTHSTAR CHILDREN'S HOSPITAL",
      tagline: "GENTLE CARE FOR GROWING LIVES",
      address: "8 Chamundi Hill Road, Mysuru 570010",
      phone: "+91 821 455 7000",
      email: "accounts@northstar-children.example",
      gstin: "29AANCN4821K2Z5",
      logo: "/assets/northstar-children-logo.png",
      seal: "/assets/northstar-children-seal.png",
      accent: "#4c1d95",
    },
  },
};

const services = {
  consult: ["Consultation · General Medicine", "Consultation", 800],
  cardioConsult: ["Consultation · Cardiology", "Consultation", 1200],
  pedsConsult: ["Consultation · Paediatrics", "Consultation", 700],
  cbc: ["Complete Blood Count (CBC)", "Laboratory", 450],
  lipid: ["Lipid Profile", "Laboratory", 900],
  hba1c: ["HbA1c", "Laboratory", 650],
  ecg: ["ECG · 12 lead", "Diagnostics", 400],
  echo: ["2D Echocardiogram", "Diagnostics", 2800],
  xray: ["X-Ray Chest PA View", "Radiology", 600],
  nebul: ["Nebulisation", "Procedure", 350],
  dressing: ["Wound Dressing", "Procedure", 300],
  pharmacy: ["Pharmacy · Dispensed medicines", "Pharmacy", 1265],
  vaccine: ["Vaccination · MMR", "Procedure", 950],
};

const line = (key, quantity = 1) => {
  const [description, category, rate] = services[key];
  return { description, category, quantity, rate };
};

function longStayItems() {
  const days = [];
  for (let day = 1; day <= 14; day += 1) {
    days.push({ description: `Ward bed charges · Day ${day}`, category: "Room", quantity: 1, rate: 3200 });
    days.push({ description: `Nursing care · Day ${day}`, category: "Nursing", quantity: 1, rate: 900 });
    if (day % 2 === 1) days.push({ description: `Physician round · Day ${day}`, category: "Consultation", quantity: 1, rate: 1000 });
    if (day % 3 === 0) days.push({ description: `Laboratory panel · Day ${day}`, category: "Laboratory", quantity: 1, rate: 1450 });
  }
  return [...days, line("echo"), line("xray", 2), line("pharmacy", 6)];
}

export const bills = [
  { id: "NMC-OPD-24817", branch: "bengaluru", date: "2026-10-09", visit: "OPD · Cardiology", doctor: "Dr. Kavya Raman", payer: "Self pay", paymentMode: "UPI", status: "Paid", discount: 500, paid: null,
    patient: { name: "Arjun Mehta", uhid: "NMC-0098213", age: 54, sex: "M", phone: "+91 98450 11223", address: "14 Lavelle Road, Bengaluru 560001" },
    items: [line("cardioConsult"), line("ecg"), line("echo"), line("lipid"), line("hba1c"), line("pharmacy")] },
  { id: "NMC-OPD-24822", branch: "bengaluru", date: "2026-10-09", visit: "OPD · General Medicine", doctor: "Dr. Imran Sheikh", payer: "Star Health (cashless)", paymentMode: "Insurance", status: "Due", discount: 0, paid: 0,
    patient: { name: "Meera Krishnan", uhid: "NMC-0101457", age: 37, sex: "F", phone: "+91 99001 44556", address: "221 Indiranagar 2nd Stage, Bengaluru 560038" },
    items: [line("consult"), line("cbc"), line("xray"), line("dressing", 2)] },
  { id: "NMC-IPD-03311", branch: "bengaluru", date: "2026-10-08", visit: "IPD · Ward 4B · 14 days", doctor: "Dr. Kavya Raman", payer: "Corporate · Acme Technologies", paymentMode: "Credit", status: "Due", discount: 2500, paid: 25000,
    patient: { name: "Rohan Desai", uhid: "NMC-0087741", age: 61, sex: "M", phone: "+91 98860 77812", address: "9 Koramangala 5th Block, Bengaluru 560095" },
    items: longStayItems() },
  { id: "NCH-OPD-11502", branch: "mysuru", date: "2026-10-09", visit: "OPD · Paediatrics", doctor: "Dr. Ananya Rao", payer: "Self pay", paymentMode: "Card", status: "Paid", discount: 0, paid: null,
    patient: { name: "Aditi Shetty", uhid: "NCH-0044120", age: 6, sex: "F", phone: "+91 97400 23019", address: "52 Saraswathipuram, Mysuru 570009" },
    items: [line("pedsConsult"), line("nebul", 2), line("cbc"), line("vaccine"), line("pharmacy")] },
  { id: "NCH-OPD-11509", branch: "mysuru", date: "2026-10-10", visit: "OPD · Paediatrics", doctor: "Dr. Ananya Rao", payer: "Self pay", paymentMode: "Cash", status: "Due", discount: 200, paid: 0,
    patient: { name: "Kabir Nair", uhid: "NCH-0044377", age: 9, sex: "M", phone: "+91 96866 90142", address: "3 Gokulam 3rd Stage, Mysuru 570002" },
    items: [line("pedsConsult"), line("xray"), line("dressing")] },
];

export const amounts = (bill) => {
  const subtotal = bill.items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  const net = subtotal - (bill.discount || 0);
  const paid = bill.paid === null ? net : bill.paid;
  return { subtotal, discount: bill.discount || 0, net, paid, balance: net - paid };
};

/** The data object sent to Open Reports. Keys match the dataset ids in the invoice definition. */
export function renderData(bill, origin) {
  const branding = branches[bill.branch].branding;
  return {
    invoice: { ...bill, branch: undefined, ...amounts(bill) },
    branding: [{ ...branding, logo: new URL(branding.logo, origin).href, seal: new URL(branding.seal, origin).href }],
  };
}
