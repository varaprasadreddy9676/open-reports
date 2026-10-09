# Flagship tutorial: build an invoice, use it in your application, and edit it there

## Purpose and format

Create one approximately **35-minute**, chaptered practical tutorial. A newcomer should see a blank page become an invoice, then see that exact report generate PDFs inside a separate working business application. Developers should be able to reproduce the HTTP and embedded-editor integration from the accompanying source.

Working title: **From a blank page to Print: Open Reports in your application**.

Use a polished fictional **Acme Orders** application: invoice list, invoice detail, customer selector, Print, Download PDF, and Design report. Use two fictional clients and safe sample records. Keep the same invoice and report throughout the film so the viewer can follow every change.

## Contract to explain accurately

There are two independent configuration values:

- `OPEN_REPORTS_URL`: the reporting engine's base address.
- `reportPath` or `reportKey`: the host application's reference to its own report JSON.

For the recommended host-owned workflow, Open Reports accepts **the definition**, not an arbitrary report file path:

```text
User clicks Download PDF / Print
  → host application backend
  → load the selected JSON definition from host storage
  → load the authorized invoice and client branding
  → POST OPEN_REPORTS_URL/api/v1/render
       { report: definition, format: "pdf", data: { invoice, branding } }
  → PDF bytes return to the host
  → host returns the PDF to the browser
  → download, preview, or the browser print dialog
```

The same JSON may come from a configured file path, a database/object store, or a trusted report-definition URL fetched by the host. The render request still contains `report` and `data`. A saved Open Reports `templateId` is a separate optional storage workflow, not a file path.

## Chapter and shot plan

| Time | Chapter | What the recording must actually show |
| --- | --- | --- |
| 00:00–01:15 | The finished workflow | In Acme Orders, open an invoice, click Download PDF, inspect the output, open Design report, edit a header, Save, and download the changed report. Explain that the rest of the video builds this. |
| 01:15–03:00 | Understand the ingredients | Show the invoice JSON with customer, date, number, items, tax rate, and branding. Briefly explain definition vs data vs engine URL. Introduce the final screen layout and terminology. |
| 03:00–12:00 | Create the invoice from a blank report | Start blank A4 portrait. Add a page header with logo/contact details, invoice/customer fields, an item table, amount calculations, subtotal/tax/total, and a page footer. Bind fields and explain why the header/footer repeat. Preview the real PDF. All construction actions are genuine visible editing. |
| 12:00–14:00 | Keep the report in the host app | Export the `.report.json` file. Open it briefly and show the actual page, section, dataset and binding structure. Put it in the sample app's `reports/acme/invoice.report.json` location and show the host's selected `reportPath` variable. |
| 14:00–19:00 | Connect the rendering API | Show the host backend loading the configured path. Inspect the actual outgoing POST: engine URL, definition, format, invoice data, branding. Show status, content type and returned PDF bytes. Switch to a definition already held as JSON, then briefly demonstrate loading a trusted definition URL. The host owns lookup and storage in all three cases. |
| 19:00–23:00 | Make Print and Download PDF work | Click each button in the real app. Use a small synchronized request trace to show the browser request, host lookup, Open Reports call, response and final result. Show the downloaded filename and opened PDF. For Print, open the actual browser print dialog; do not claim a physical print occurred. |
| 23:00–27:30 | Embed the designer | Open the app's Design report screen. Show `createDesigner` or `<open-report-designer>`, its iframe, loaded definition, safe preview data and host save callback. Show readiness/loading state and the editor inside the host's own navigation. No privileged key in browser code. |
| 27:30–31:00 | Edit, save, and prove persistence | Edit a visible header, table style or footer. Show Unsaved changes → Saving → host-confirmed success. Inspect the backend save request and stored JSON change. Leave/reopen the editor, then print/download the invoice again and compare the changed PDF. |
| 31:00–34:00 | Practical variations and recovery | Render the same definition for a second client's logo/footer; switch to a longer invoice and inspect page breaks and repeated headings; demonstrate one failed render with Retry and one failed save with retained edits. Keep each example brief and observable. |
| 34:00–35:00 | Recap and reproduce it | Summarize definition + data → engine → output, and host-owned editing/saving. Point to the exact source, report JSON, sample data and chapter links. Explain the optional saved-template workflow in one short callout; deeper coverage belongs in a separate tutorial. |

Timing is an editorial target. Extend a chapter if it needs readable explanation; remove repetitive typing or idle waits rather than speeding up important interactions.

## Required sample application behaviour

1. The invoice detail has distinct **Print**, **Download PDF**, and **Design report** actions.
2. Print/download use the same selected definition and data. Both show loading and actionable failure feedback.
3. A compact developer trace, used only during the explanation, shows the real report source, endpoint, render ID and status. It must be fed by actual requests; it is not a fake animation or a permanent end-user panel.
4. Definition source choices demonstrate a configured file path, a stored JSON definition, and an optional trusted URL. Selection remains host-controlled.
5. The editor runs on the reporting server's origin inside the host app's frame. Its own Save button and a host Save action both use `saveMode: "host"`.
6. The save callback checks the host response and throws on failure. The success indicator appears only after storage confirms the write.
7. Preview data is supplied separately and is not silently written into the definition. Customer switching supplies the new customer's preview data.
8. Reload/reopen uses the latest stored JSON. Closing/unmounting destroys the embed instance. Unsaved iframe reloads are not advertised as persistent recovery.
9. Branding uses data-bound images and text. The example may send a reachable image URL or a Base64 image; server-local paths are explained as paths accessible to the reporting server, not files on an end user's laptop.
10. Use a plain HTTP client for the main backend demonstration. The optional client helper may be mentioned; installing an SDK must not appear mandatory.

## On-screen integration examples

### File reference owned by the host

```js
const reportPath = reportConfig.invoicePath;
const definition = JSON.parse(await readFile(reportPath, "utf8"));

const rendered = await fetch(`${OPEN_REPORTS_URL}/api/v1/render`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": OPEN_REPORTS_API_KEY, // backend only, when auth is enabled
  },
  body: JSON.stringify({
    report: definition,
    format: "pdf",
    data: { invoice: authorizedInvoice, branding: clientBranding },
  }),
});
if (!rendered.ok) throw new Error("Could not generate the invoice PDF");
const pdfBytes = await rendered.arrayBuffer();
```

Use the source repository for full response/error handling and delivery headers. The displayed excerpt is deliberately short enough to read.

### Definition already held as JSON

Replace file loading with the host's authorized lookup:

```js
const definition = await reportStore.get(clientId, "invoice");
// The render request is unchanged: { report: definition, format, data }.
```

For a definition URL, the **host backend** fetches and checks that approved URL, parses its JSON, and sends the same render request. Do not show an unsupported `{ reportPath: ... }` or `{ reportUrl: ... }` request to `/api/v1/render`.

### Designer inside the host application

```js
const designer = createDesigner(editorContainer, {
  server: OPEN_REPORTS_URL,
  definition,
  data: { invoice: safePreviewInvoice, branding: safePreviewBranding },
  saveMode: "host",
  onSaveDefinition: async (nextDefinition) => {
    const response = await fetch("/app-api/report-definitions/invoice", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(nextDefinition),
    });
    if (!response.ok) throw new Error("Could not save. Please try again.");
  },
});
```

Show the actual request and the resulting stored definition, then the next rendered PDF. Mention the equivalent custom element briefly; explain that the helper creates and manages the iframe and `postMessage` exchange.

## Production treatment

- Record live browser interactions at 1920 × 1080 or above, with consistent framing and readable UI zoom. Deliver a clean 1080p master; a 4K master is optional when captures support it.
- Use real screen recording with continuous actions. Screenshots may support a diagram or recap, but are not a substitute for the demonstration.
- Use clear narration, accurate English captions, chapter markers and a transcript. Narration explains the consequence of each action while it occurs.
- Use restrained camera zooms, cursor emphasis, short callouts and chapter transitions. Leave code, request bodies, print dialogs and final PDFs visible long enough to read.
- Use a simple animated request-flow overlay synchronized to real requests. Clearly distinguish the host application and Open Reports.
- Light theme for the main recording. Avoid desktop notifications, private tabs, real patient/customer information, credentials and unrelated console noise.
- Quiet music may accompany the introduction/transitions; keep it out of detailed technical explanation or sufficiently low that every word is clear.
- Cut waiting and repetitive typing with visible editorial transitions. Do not simulate successful saves, requests or print results.

## Deliverables

- One finished ~35-minute video, ready to play in the Learning Studio.
- English `.vtt` captions, transcript, chapter timestamps and a purposeful poster.
- Runnable Acme Orders sample with setup instructions and configurable engine URL.
- The report built in the film, sample invoice/branding JSON and the exact integration code used.
- A short companion guide mapping each chapter to its source files and API contract.
- A 60–90-second trailer and a few focused excerpts derived from the finished master, after the full tutorial is approved for use.

## Acceptance checks

- A reviewer can follow the published setup and reproduce the entire workflow from a clean checkout.
- The report is created from a blank page on camera, rather than replaced by a prebuilt file mid-demo.
- File-owned and JSON-owned definitions both render through the documented API; no unsupported path-only request is shown.
- Print, download, editor load and editor save are actual operations in the separate application.
- The exported PDF contains the expected invoice identity, all line items, amounts, logo/footer and correct page setup.
- Saving an edit changes the stored JSON; reopening and the next PDF both reflect it.
- Two client brands and a longer invoice work. Failure demonstrations recover without lost edits.
- Every visible action agrees with the narration, captions and displayed code.
- The recording has no private data, leaked keys, misleading success states, unreadable code, excessive effects or long dead time.

References: [integration guide](../INTEGRATION_GUIDE.md), [embedding API](../EMBEDDING.md), [render API](../API.md), and [workflow audit](../design/usage-integration-audit.md).
