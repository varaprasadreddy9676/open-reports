# Embedding Open Reports in your app

Two custom elements put reports and the designer inside any web page, in any framework (React, Vue, Angular, plain HTML). They have no dependencies and are served by your Open Reports server.

```html
<script type="module" src="https://reports.example.com/embed/open-reports.js"></script>
```

## Show a report: `<open-report-viewer>`

```html
<open-report-viewer
  server="https://reports.example.com"
  template="invoice"
  parameters='{"invoiceId": 1042}'
  downloads="pdf,xlsx,csv"
  style="height: 800px"
></open-report-viewer>
```

It renders the latest **published** version of the template, with:

- a form for the report's parameters (text, number, date, choice lists), pre-filled from the report's defaults and the `parameters` attribute;
- **Refresh**, **Print** and **Download** buttons (`downloads` chooses the formats: `pdf`, `docx`, `xlsx`, `csv`, `html`, `zpl`, `escpos`);
- **Find in report**, with every match highlighted and Enter / Shift+Enter (or ‹ ›) to step through them;
- **Contents**: a sidebar built from the report's bookmarks;
- **Click-to-sort columns**: click a table or crosstab heading to sort ascending, again for descending. The server re-lays the report, so page breaks and totals stay right, and downloads use the same order;
- **Drill-down**: groups with `drillDown` show ▸/▾ beside each group header to show or hide that group's rows (headers and subtotals stay);
- **Drill-through**: elements and table cells with a `report` link open that report in the viewer, with its parameters filled in, and **← Back** returns.

| Attribute | Meaning |
|---|---|
| `server` | Your Open Reports server. Defaults to the page's own origin. |
| `template` | Template id for an Open Reports-stored template. Provide `report` instead for a host-owned report. |
| `report` | JSON report definition (or assign the `report` property) to render inline without server template lookup. |
| `data` | JSON render data (or assign the `data` property) for this report. |
| `version` | A specific version instead of the latest published one. |
| `parameters` | JSON object of starting parameter values. |
| `downloads` | Comma-separated download formats. Default `pdf,xlsx,csv`. |
| `hide-parameters` | Hide the parameter form. |
| `api-key` | Sent as `X-API-Key` when the server has API keys enabled. Configured keys are instance-wide; do not put a privileged key in browser markup. |

Events (they bubble): `report-rendered` (`detail.template`, `detail.parameters`, `detail.version`, `detail.sort`), `report-drill` (`detail.template`, `detail.parameters`) and `report-error` (`detail.message`).

From JavaScript:

```js
const viewer = document.querySelector("open-report-viewer").viewer;
await viewer.refresh({ invoiceId: 1043 });
await viewer.download("pdf");
viewer.print();
await viewer.drill({ report: "invoice", parameters: { invoiceId: 1043 } });
await viewer.back();
```

Style it with CSS custom properties (`--or-accent`, `--or-border`, `--or-bg`, `--or-text`) or the `::part(toolbar)`, `::part(page)` selectors. The viewer lives in a shadow root, so your page's CSS cannot break it.

### Render a host-owned report in the viewer

To preview a report definition owned by your application, set its `report` property and optional `data` property before connecting the viewer. This uses `POST /api/v1/render`; it does not require a template ID in Open Reports:

```js
import { createViewer } from "@reporting/embed";

createViewer(document.querySelector("#report"), {
  server: OPEN_REPORTS_URL,
  report: await reportStore.get(tenantId, "invoice"),
  data: { invoice: authorizedInvoice },
  downloads: ["pdf"],
});
```

The `<open-report-viewer>` custom element also accepts `report` and `data` properties. Browser rendering is appropriate only when the report and data are safe to expose to that browser; otherwise render from the host backend.

## Let users design: `<open-report-designer>`

```html
<open-report-designer server="https://reports.example.com" template="invoice" height="800px"></open-report-designer>
```

The full designer runs inside a frame without its home screen. Omit `template` to start with a blank report.

```js
const element = document.querySelector("open-report-designer");
element.addEventListener("report-dirty", (e) => saveButton.disabled = !e.detail.dirty);

await element.designer.save();
element.designer.load(reportDefinition); // replace the open report with your own JSON
```

Events: `designer-ready`, `report-saved`, `report-dirty`, `report-error`.

### Keep report JSON in the host application

For application integrations, keep each customer's report definition in the host application's storage and configure the designer to return edits there. The host decides how to authorize, version, and persist the JSON. It can then render that exact definition without creating an Open Reports template record:

```ts
import { createDesigner, renderReport } from "@reporting/embed";

const designer = createDesigner(document.querySelector("#designer")!, {
  server: OPEN_REPORTS_URL,
  definition: await reportStore.get(tenantId, "invoice"),
  data: { invoice: safeSampleInvoice, client: safeSampleBranding },
  parameters: { language: "en" },
  saveMode: "host",
  onSaveDefinition: async (nextDefinition) => {
    await reportStore.save(tenantId, "invoice", nextDefinition);
  },
});

// Later, from your backend, load the host-owned definition and render it with authorized data.
const pdf = await renderReport({ server: OPEN_REPORTS_URL, apiKey: OPEN_REPORTS_API_KEY }, {
  report: await reportStore.get(tenantId, "invoice"),
  format: "pdf",
  data: { invoice: authorizedInvoice },
});
```

In host mode, the designer's Save action waits for `onSaveDefinition` to finish. Resolve only after your backend confirms persistence, and throw if the response is unsuccessful. Synchronous errors and rejected promises show an error and keep edits available for retry. Repeated SDK Save requests share the pending save. If the user edits while saving, the result contains the snapshot actually saved, and newer edits remain dirty. The default save timeout is 30 seconds; set `saveTimeout` in milliseconds if your backend needs longer.

`data` and `parameters` supply the designer's preview. They do not become embedded sample values in the saved report JSON. Only send data that the editor user is allowed to see. Embedded reports and preview data are not written into the standalone designer's local draft storage. A reload reopens the latest host-confirmed saved definition (or the latest successfully loaded definition); unsaved edits do not survive a frame reload.

`designer-ready` and `onReady` fire after the initial definition has been loaded. In host mode, the UI offers Save and Open file; server Publish, server template selection, and server version controls are omitted. Your host manages deployment/versioning. Users can export a `.json` definition and reopen it through **Open file**.

Do not put a privileged API key in browser code; use your authenticated backend or trusted proxy for rendering and saving. For a custom element, assign properties before connecting it:

```js
const element = document.createElement("open-report-designer");
element.setAttribute("server", OPEN_REPORTS_URL);
element.setAttribute("save-mode", "host");
element.definition = await reportStore.get(tenantId, "invoice");
element.data = { invoice: safeSampleInvoice };
element.onSaveDefinition = (nextDefinition) => reportStore.save(tenantId, "invoice", nextDefinition);
document.querySelector("#designer").append(element);
```

To switch the active customer/report, load the authorized definition and its preview together:

```js
designer.load(nextDefinition, {
  data: { invoice: nextSampleInvoice, client: nextSampleBranding },
  parameters: { language: "en" },
});
```

Supply new `data` when switching customers; omitted preview options retain the current preview. Invalid definitions report an error and leave the last valid report open. Destroy the designer when its host screen unmounts so listeners and pending saves are cleaned up.

### Shared headers, footers, and other subreports

Choosing a subreport JSON file in the designer attaches its definition under the parent report's `subreports` property. This bundled JSON can be saved in your host app and sent unchanged to `POST /api/v1/render` or assigned to `createViewer({ report })`. The engine resolves bundled children recursively; no template ID or Open Reports storage is needed.

For request-specific replacements, pass `subreports` separately. Explicit request resources override children with the same key in the report JSON:

```js
createViewer(document.querySelector("#report"), {
  server: OPEN_REPORTS_URL,
  report: invoiceDefinition,
  data: { invoice: safeInvoice },
  subreports: {
    "client-header": { report: clientHeaderDefinition, data: { client: safeBranding } },
  },
});
```

For a custom viewer element, assign its `subreports` property. Child report IDs must match the parent component's `reportId`. Child datasets still need supplied data (or a parent dataset binding); bundled definitions do not grant access to the host database. See [subreport rendering](API.md) for the full request contract.

The existing `template` option and default `saveMode: "server"` continue to use Open Reports' optional template store. Use that for standalone deployments where you want Open Reports to own drafts and published versions.

## Without custom elements

```js
import { createViewer, createDesigner } from "https://reports.example.com/embed/open-reports.js";

createViewer(document.getElementById("report"), { server: "https://reports.example.com", template: "invoice", parameters: { invoiceId: 1042 } });
createDesigner(document.getElementById("editor"), { server: "https://reports.example.com", template: "invoice", onSave: ({ version }) => notify(version) });
```

The same API is available in this repository's `@reporting/embed` workspace package for bundlers. The hosted module URL above works without installing a package.

## Security

- The designer frame and your page talk with `postMessage`. Both sides check the sender's window and origin, and the designer only answers the origin that embedded it. The API key is sent in a message, never in the frame's URL.
- The viewer and designer run in the browser and make API requests to the report server. A key supplied in an attribute or JavaScript is visible to browser users. The current API keys are not scope-limited, so keep them on the host server and use an authenticated backend/reverse proxy for private reports and editing.
- Only expose direct browser rendering when the report and its data are intentionally public. For application-owned data, have the host authorize and prepare the data before calling the render API.
- The rendered report is shown in a sandboxed frame without scripts.

See the [integration guide](INTEGRATION_GUIDE.md) for recommended host/backend and plugin patterns.
