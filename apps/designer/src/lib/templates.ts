import type { Doc } from "../model/ops";

const files = import.meta.glob("../../../../examples/*.report.json", { eager: true, import: "default" }) as Record<string, Doc>;

export interface StarterTemplate {
  key: string;
  name: string;
  description: string;
  group: "Documents" | "Healthcare" | "Printing" | "Data";
  doc: Doc;
}

const GROUPS: Record<string, StarterTemplate["group"]> = {
  invoice: "Documents",
  "purchase-order": "Documents",
  "account-statement": "Documents",
  "absolute-form": "Documents",
  "grouped-sales": "Data",
  conditional: "Data",
  charts: "Data",
  crosstab: "Data",
  "large-dataset": "Data",
  multilingual: "Healthcare",
  "lab-report": "Healthcare",
  "specimen-label": "Printing",
  receipt: "Printing",
  "receipt-58mm": "Printing",
  "label-50x30": "Printing",
  "label-100x50": "Printing",
  "sticker-sheet": "Printing",
  "patient-id-card": "Printing",
  wristband: "Healthcare",
  "pharmacy-label": "Healthcare",
  "blood-bag-label": "Healthcare",
  prescription: "Healthcare",
  "radiology-report": "Healthcare",
  "discharge-summary": "Healthcare",
  "hospital-letterhead": "Healthcare",
  "preprinted-letterhead": "Healthcare",
  "department-report": "Data",
};

export const STARTERS: StarterTemplate[] = Object.entries(files)
  .map(([path, doc]) => {
    const key = path.split("/").pop()!.replace(".report.json", "");
    return { key, name: doc.name as string, description: (doc.description as string) ?? "", group: GROUPS[key] ?? "Documents", doc };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

export function blankReport(name = "Untitled report"): Doc {
  return {
    schemaVersion: "1.0",
    id: "untitled",
    name,
    page: { size: "A4", orientation: "portrait", unit: "mm", margin: { top: 15, right: 15, bottom: 18, left: 15 } },
    datasets: [],
    sections: [{ type: "detail", children: [] }],
  };
}
