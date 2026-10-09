import React, { useState } from "react";

const example = `import { createDesigner } from "https://reports.example.com/embed/open-reports.js";

const response = await fetch("/api/report-definition/invoice");
if (!response.ok) throw new Error("Could not load the report");
const definition = await response.json();

const designer = createDesigner(document.querySelector("#editor"), {
  server: "https://reports.example.com",
  definition,
  data: { invoice: sampleInvoice, client: sampleBranding },
  saveMode: "host",
  onSaveDefinition: async (nextDefinition) => {
    const saved = await fetch("/api/report-definition/invoice", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(nextDefinition),
    });
    if (!saved.ok) throw new Error("Could not save. Try again.");
  },
  onError: (message) => showError(message),
});

// Your host application's Save button can also call:
await designer.save();
// When closing the editor:
designer.destroy();`;

export function DesignerIntegrationExample() {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  return <section className="settings-section integration-next-steps">
    <div className="integration-intro"><span className="integration-step">2</span><div><h3>Put the designer inside your application</h3><p>Load your report JSON, supply safe preview data, and save edits through your existing backend. Works with React, Angular, Vue, or plain JavaScript.</p></div></div>
    <details><summary>Show the embedded designer example</summary>
      <pre className="integration-code" tabIndex={0}><code>{example}</code></pre>
      <button className="btn" type="button" onClick={async () => { try { await navigator.clipboard.writeText(example); setCopied(true); setError(""); } catch { setError("Copy was unavailable. Select the code and copy it manually."); } }}>{copied ? "Copied" : "Copy designer example"}</button>
      {error && <p className="field-error" role="status">{error}</p>}
    </details>
    <p>Replace the sample variables and host endpoints with your application’s own values. A successful save means your backend confirmed storing the JSON. Preview data is separate and is not added to the definition.</p>
  </section>;
}
