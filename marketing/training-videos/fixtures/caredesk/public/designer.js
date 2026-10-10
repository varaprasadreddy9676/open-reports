// CareDesk's "Design invoice" screen: the real Open Reports designer embedded in this page.
import { $, esc, showSource, toast } from "./ui.js";

/** Renders the designer screen into `view`; returns a cleanup function for when the user leaves. */
export async function openDesigner(view, { branch, config, trace, onSaved }) {
  const response = await fetch(`/app-api/definition?branch=${branch}`);
  if (!response.ok) throw new Error("Could not load the invoice layout");
  const { definition, file, preview } = await response.json();
  view.innerHTML = `<div class="designer-screen">
    <section class="card designer-bar">
      <button type="button" class="back-link" id="close-designer">← Back to billing</button>
      <div><h1>Invoice layout · ${esc(config.branches[branch].label)}</h1><code>${esc(file.path)}</code></div>
      <span class="spacer"></span>
      <button type="button" class="how-link" id="how-edit">How does editing work?</button>
      <span class="save-state" id="save-state" data-state="saved" role="status">Saved · version ${file.version}</span>
      <button type="button" class="button primary" id="save-layout" data-testid="caredesk-save-layout">Save layout</button>
    </section>
    <section class="card designer-frame" id="designer-host"><div class="designer-loading">Loading the Open Reports designer…</div></section>
  </div>`;
  const status = $("#save-state");
  const setStatus = (state, text) => { status.dataset.state = state; status.textContent = text; };
  $("#close-designer").addEventListener("click", () => { location.hash = "#/bills"; });
  $("#how-edit").addEventListener("click", () => void showSource("embed-designer", "CareDesk page · embedding the designer"));

  const { createDesigner } = await import(`${config.designerUrl}/embed/open-reports.js`);

  // #region embed-designer
  const designer = createDesigner($("#designer-host"), {
    server: config.designerUrl,           // where Open Reports runs; the designer loads in an iframe from there
    definition,                           // CareDesk's own invoice JSON, read from its report folder
    data: preview,                        // sample bill + branding for the preview (never saved into the layout)
    saveMode: "host",                     // edits come back to CareDesk instead of being stored by Open Reports
    height: "100%",
    onSaveDefinition: async (edited) => {
      setStatus("saving", "Saving…");
      const saved = await trace.fetch(`/app-api/definition?branch=${branch}`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(edited),
      }, "Save invoice layout");
      if (!saved.ok) throw new Error((await saved.json()).error ?? "CareDesk could not save the layout");
      const result = await saved.json();  // resolve only after CareDesk has stored it
      setStatus("saved", `Saved · version ${result.version}`);
      onSaved(result);
    },
    onDirtyChange: (dirty) => { if (dirty) setStatus("dirty", "Unsaved changes"); },
    onError: (message) => { setStatus("error", "Not saved"); toast(message, "error"); },
  });
  // #endregion

  $("#save-layout").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.setAttribute("aria-busy", "true");
    try { await designer.save(); toast("Invoice layout saved in CareDesk"); }
    catch { /* onError already explained the failure; the edits stay in the designer */ }
    finally { button.removeAttribute("aria-busy"); }
  });
  return () => designer.destroy();
}
