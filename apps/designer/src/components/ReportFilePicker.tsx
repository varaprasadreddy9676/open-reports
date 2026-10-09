import React, { useState } from "react";
import { parseReportDefinition } from "@reporting/schema";
import { requestReplaceReport, useStore } from "../store";
import type { Doc } from "../model/ops";

export function ReportFilePicker() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const open = async (file?: File) => {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      if (file.size > 10_000_000) throw new Error("Choose a report JSON file smaller than 10 MB.");
      const result = parseReportDefinition(JSON.parse(await file.text()));
      if (!result.valid) throw new Error(`Invalid report: ${result.issues[0]?.path || "definition"} — ${result.issues[0]?.message}`);
      requestReplaceReport(() => {
        useStore.getState().loadDoc(result.report as Doc);
        useStore.getState().set({ dialog: null, mode: "design" });
      });
    } catch (cause) {
      setError(cause instanceof SyntaxError ? "This file is not valid JSON. Choose an exported .report.json file." : (cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return <section className="settings-section">
    <label className="field wide"><span className="field-label">Open a report JSON file</span>
      <input type="file" accept=".json,application/json" aria-label="Open report JSON file" disabled={busy} onChange={(event) => { void open(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
      <span className="field-hint">Choose the .json definition exported from Open Reports. It opens for editing; opening it does not save it on the server.</span>
    </label>
    {error && <p className="field-error" role="alert">{error}</p>}
  </section>;
}
