# `@reporting/client`

Optional, thin server-side TypeScript helper for the Open Reports REST API. Open Reports is an HTTP service; use `fetch` or your language's HTTP client if you prefer. This package only saves a little boilerplate for rendering and has no runtime dependencies (Node 18+).

```sh
pnpm add @reporting/client
```

```ts
import { OpenReportsClient } from "@reporting/client";

const reports = new OpenReportsClient({
  server: process.env.OPEN_REPORTS_URL!,
  apiKey: process.env.OPEN_REPORTS_API_KEY,
});

const pdf = await reports.renderTemplate("invoice", {
  format: "pdf",
  version: 3, // Pin output to a reviewed version.
  data: { invoice: invoiceDto },
});

await fs.promises.writeFile("invoice.pdf", pdf.bytes);
```

The helper only wraps inline and saved-template rendering. For template management, publishing, jobs, validation, analysis, and every other capability, call the REST endpoints directly. `OpenReportsError` preserves the HTTP status, API error code, and details.

Keep API credentials on the application server. For browser rendering or an embedded designer, use the host application's authenticated backend or reverse proxy; do not put a server key in frontend code.

Keep the API key on the host backend. The host application owns authentication, authorization, business rules, and data access; Open Reports receives the report and data to render. See [the integration guide](../../docs/INTEGRATION_GUIDE.md) and [REST API reference](../../docs/API.md).
