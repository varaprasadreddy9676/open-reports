import type { Doc } from "../model/ops";

/** The public demo shares one server between every visitor and resets it on restart. */
export function isPublicDemo(): boolean {
  return typeof window !== "undefined" && window.location.hostname === "open-reports-demo.onrender.com";
}

/** Downloads the report definition as `<id>.report.json`: a copy the user keeps, to import later or keep in git. */
export function downloadReportFile(doc: Doc): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${doc.id || "report"}.report.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
