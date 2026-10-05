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
- **Refresh**, **Print** and **Download** buttons (`downloads` chooses the formats: `pdf`, `xlsx`, `csv`, `html`, `zpl`, `escpos`);
- **Find in report**, with every match highlighted and Enter / Shift+Enter (or ‹ ›) to step through them;
- **Contents**: a sidebar built from the report's bookmarks;
- **Click-to-sort columns**: click a table or crosstab heading to sort ascending, again for descending. The server re-lays the report, so page breaks and totals stay right, and downloads use the same order;
- **Drill-down**: groups with `drillDown` show ▸/▾ beside each group header to show or hide that group's rows (headers and subtotals stay);
- **Drill-through**: elements and table cells with a `report` link open that report in the viewer, with its parameters filled in, and **← Back** returns.

| Attribute | Meaning |
|---|---|
| `server` | Your Open Reports server. Defaults to the page's own origin. |
| `template` | Template id. Required. |
| `version` | A specific version instead of the latest published one. |
| `parameters` | JSON object of starting parameter values. |
| `downloads` | Comma-separated download formats. Default `pdf,xlsx,csv`. |
| `hide-parameters` | Hide the parameter form. |
| `api-key` | Sent as `X-API-Key` when the server has API keys enabled. Prefer a key limited to rendering. |

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

## Let users design: `<open-report-designer>`

```html
<open-report-designer server="https://reports.example.com" template="invoice" height="800px"></open-report-designer>
```

The full designer runs inside a frame without its home screen. Omit `template` to start with a blank report.

```js
const element = document.querySelector("open-report-designer");
element.addEventListener("report-saved", (e) => console.log("saved", e.detail.templateId, e.detail.version));
element.addEventListener("report-dirty", (e) => saveButton.disabled = !e.detail.dirty);

await element.designer.save();          // resolves with { templateId, version }
element.designer.load(reportDefinition); // replace the open report with your own JSON
```

Events: `designer-ready`, `report-saved`, `report-dirty`, `report-error`.

## Without custom elements

```js
import { createViewer, createDesigner } from "https://reports.example.com/embed/open-reports.js";

createViewer(document.getElementById("report"), { server: "https://reports.example.com", template: "invoice", parameters: { invoiceId: 1042 } });
createDesigner(document.getElementById("editor"), { server: "https://reports.example.com", template: "invoice", onSave: ({ version }) => notify(version) });
```

The same API is published as the `@reporting/embed` package for bundlers.

## Security

- The designer frame and your page talk with `postMessage`. Both sides check the sender's window and origin, and the designer only answers the origin that embedded it. The API key is sent in a message, never in the frame's URL.
- Rendering uses the server's normal API and API keys. For public pages, put the server behind your own authentication or give the page a key that can only render.
- The rendered report is shown in a sandboxed frame without scripts.
