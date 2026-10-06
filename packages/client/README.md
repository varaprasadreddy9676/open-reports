# `@reporting/client`

Optional, thin server-side TypeScript helper for the Open Reports REST API. Open Reports is an HTTP service; use `fetch` or your language's HTTP client if you prefer. This package only saves a little boilerplate for rendering and has no runtime dependencies (Node 18+). It currently lives in this repository and is not published to npm; external applications should call the REST API directly unless they have made the package available through their own workspace or registry.

```sh
pnpm add @reporting/client@workspace:*
```

The workspace command above applies only to a pnpm workspace that includes this package.

```ts
import { OpenReportsClient } from "@reporting/client";

const reports = new OpenReportsClient({
  server: process.env.OPEN_REPORTS_URL!,
  apiKey: process.env.OPEN_REPORTS_API_KEY,
});

// Resolve this mapping on the host backend after authenticating the user.
const { templateId, version } = await tenantReports.get(user.tenantId, "invoice");
const pdf = await reports.renderTemplate(templateId, {
  format: "pdf",
  version, // Pin output to a reviewed version.
  data: { invoice: invoiceDto },
});

await fs.promises.writeFile("invoice.pdf", pdf.bytes);
const base64 = Buffer.from(pdf.bytes).toString("base64"); // Only when the receiver requires Base64.
```

`tenantReports.get(...)` is your host application's tenant-to-template configuration lookup; it is not an Open Reports endpoint. Example IDs like `invoice` are not built-in templates. The helper only wraps inline and saved-template rendering. For template management, publishing, jobs, validation, analysis, and every other capability, call the REST endpoints directly. `OpenReportsError` preserves the HTTP status, API error code, and details.

The render call returns PDF bytes in `pdf.bytes`, not a Base64 string. Prefer bytes for files, downloads, and email attachments because Base64 is larger. Convert with `Buffer.from(pdf.bytes).toString("base64")` only when another API specifically requires it.

Keep API credentials on the application server. For browser rendering or an embedded designer, use the host application's authenticated backend or reverse proxy; do not put a server key in frontend code.

Keep the API key on the host backend. The host application owns authentication, authorization, business rules, and data access; Open Reports receives the report and data to render. Open Reports currently uses instance-wide API keys and does not enforce tenant-level access to templates. The host must authorize the user and select a permitted template ID and published version on the backend. Do not trust a template ID supplied by browser input; use separate instances if customers require isolation at the report-server boundary. See [the integration guide](../../docs/INTEGRATION_GUIDE.md) and [REST API reference](../../docs/API.md).
