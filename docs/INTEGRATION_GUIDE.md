# Integrate Open Reports with an application

Open Reports is the report designer and rendering engine. The host application owns its users, permissions, business rules, and database. The host chooses a template, prepares the data it is allowed to expose, sends the render request, and handles the resulting file.

```text
Host application ── report definition or template ID + data + parameters ──▶ Open Reports
Host application ◀──────────────── PDF / HTML / XLSX / other output ────── Open Reports
```

## Choose an integration

| Need | Use |
|---|---|
| Render a document from an application workflow | Call the REST API from the host backend. Node/TypeScript hosts may use the optional thin [`@reporting/client`](../packages/client/README.md); other languages use their normal HTTP client. |
| Let a user view a published report in a web page | Use [`<open-report-viewer>`](EMBEDDING.md#show-a-report-open-report-viewer). |
| Let a user edit a report in a web page | Use [`<open-report-designer>`](EMBEDDING.md#let-users-design-open-report-designer). |
| Add a renderer, data source, expression function, or component to the report server | Write an in-process [plugin](PLUGIN_DEVELOPMENT.md). |

For application-owned data, the simplest path is usually to have the host load and authorize the record, build a small report DTO, and send it as `data`. Use a configured REST/JSON/SQL source when the report server should fetch that data itself. Use a plugin when the engine needs a new reusable capability—not just to move host business logic into Open Reports.

## Quick start for an application team

1. Deploy Open Reports and note its base URL, such as `https://reports.example.com`.
2. Configure `API_KEYS` on the server if requests must be authenticated. Keep that value in your host application's secret store.
3. Create a report in the designer, save it, and publish a version.
4. In the host backend, authenticate the current user and load only records that user may access.
5. Send the template ID, output format, parameters, and a JSON data object to the render endpoint.
6. Return the response bytes from your own application route, or store the generated file according to your existing workflow.

The designer's **Settings → Server connection** configures this browser's connection for editing. It is not the production integration point for your application. The API key entered there is stored in browser local storage and is visible to that browser; use a backend secret for application rendering.

### What to configure on the host

Set the Open Reports base URL and API key in the host application's server-side environment or secret manager, for example:

```text
OPEN_REPORTS_URL=https://reports.example.com
OPEN_REPORTS_API_KEY=<secret-managed-value>
```

Do not commit the key to source control. Keep the base URL configurable per environment so local development, test, and production can point to different report servers. Open Reports currently uses instance-wide API keys, so the host must authorize the user's report action before calling the API.

### Request and response contract

```http
POST /api/v1/templates/{templateId}/render
Content-Type: application/json
X-API-Key: <server-side-key>

{
  "format": "pdf",
  "version": 3,
  "parameters": { "locale": "en-IN" },
  "data": { "invoice": { "number": "INV-1042", "total": 15340 } }
}
```

On success, the response body is the generated file bytes. Read `content-type` to identify the output, `x-render-id` for tracing, and `x-render-warnings` for the warning count. Errors use `{ "error": { "code", "message", "details" } }` with an HTTP error status. See the [API reference](API.md) for endpoint coverage and copy-ready examples in cURL, Node, Python, Java, C#, and Go.

`data` maps dataset IDs from the report definition to the objects or row arrays for this render. Keep this payload to the fields the report needs. `parameters` are separate and are intended for report parameters and configured data-source queries. Use a published template version when an application's output must stay stable; update the host's template/version mapping when you choose to roll forward.

### Use one template with per-client logos and text

You do not need to save a separate report for every client. Add an inline dataset with the ID `client`, then bind the reusable template's image and text components to its fields:

```json
{ "id": "client", "source": "inline", "query": { "data": { "logoUrl": "", "headerText": "", "footerText": "" } } }
{ "type": "image", "binding": "data.client.logoUrl", "width": "28mm", "height": "16mm", "whenMissing": "hide" }
{ "type": "text", "binding": "data.client.headerText" }
{ "type": "text", "binding": "data.client.footerText" }
```

Then send that client's branding alongside the business data for each render:

```json
{
  "format": "pdf",
  "data": {
    "client": {
      "logoUrl": "https://assets.example.com/client-logo.png",
      "headerText": "Northstar Medical Center",
      "footerText": "Care with clarity · northstar.example"
    },
    "invoice": { "number": "INV-1042", "total": 15340 }
  }
}
```

For the logo, `logoUrl` can also be a `data:image/png;base64,...` value generated by the host backend; this sends the bytes as part of the JSON request and avoids a second fetch. For a URL, the reporting server must be able to reach it. Private hosts need an explicit `REPORT_IMAGE_ALLOWED_HOSTS` entry. A local file path is resolved on the reporting server and must be inside a configured `REPORT_IMAGE_ROOTS` folder, so a path from an end user's laptop will not work on a separate hosted server. Linked remote/local images are read again for every render, allowing the same stored template to show an updated logo later.

For a first end-to-end check, render the published `invoice` example using `examples/invoice.report.json` and sample data. Then try a bad API key and an unknown template ID to confirm the host handles errors without exposing its server secrets.

| Result | Check |
|---|---|
| `401 UNAUTHORIZED` | The server is protected; check `API_KEYS` and send the matching key in `x-api-key` or `Authorization: Bearer`. |
| Network/CORS error | Confirm the base URL is reachable from the host backend. Browser embedding across origins also needs the deployment's CORS/proxy configuration; do not solve this by exposing a server key. |
| `404` template/version error | Check the template ID and published version configured in the host. |
| `422` render/data error | Inspect the structured error and validate the report against the dataset shape sent by the host. |

## Server-side rendering with TypeScript

Install the client in the host backend:

```sh
pnpm add @reporting/client
```

```ts
import { OpenReportsClient } from "@reporting/client";

const reports = new OpenReportsClient({
  server: process.env.OPEN_REPORTS_URL!,
  apiKey: process.env.OPEN_REPORTS_API_KEY,
});

// The host application performs its normal authentication and authorization first.
const invoice = await invoiceService.getAuthorizedInvoice(user, invoiceId);
const pdf = await reports.renderTemplate("invoice", {
  format: "pdf",
  version: 3,
  data: { invoice },
});

response.type(pdf.mimeType).send(Buffer.from(pdf.bytes));
```

Pin a version when output must remain stable. Omit `version` only when the application intentionally follows the latest published version. Handle `OpenReportsError` by status/code and preserve the host application's normal error and audit behavior.

## Java application example

The REST API needs no Jasper or Open Reports Java runtime dependency. The example uses Jackson to serialize the application's DTO safely instead of assembling JSON strings by hand:

```java
ObjectMapper mapper = new ObjectMapper();
ObjectNode body = mapper.createObjectNode();
body.put("format", "pdf");
body.put("version", 3);
body.set("data", mapper.valueToTree(Map.of("invoice", authorizedInvoiceDto)));

HttpRequest request = HttpRequest.newBuilder(
        URI.create(openReportsUrl + "/api/v1/templates/invoice/render"))
    .header("content-type", "application/json")
    .header("x-api-key", openReportsApiKey)
    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
    .build();

HttpResponse<byte[]> result = HttpClient.newHttpClient().send(
    request, HttpResponse.BodyHandlers.ofByteArray());
if (result.statusCode() < 200 || result.statusCode() >= 300) {
    throw new OpenReportsException(result.statusCode(), result.body());
}
byte[] pdf = result.body();
```

Keep the key in server configuration. The caller should authorize the invoice before building `authorizedInvoiceDto`; Open Reports only lays out and renders the data it receives.

## Data and plugins

- **Inline `data`:** host has already loaded and authorized the record. Use named datasets whose IDs match the report definition.
- **REST/JSON/SQL data source:** Open Reports fetches data using server configuration. Keep credentials in server-side secrets and restrict accessible endpoints, hosts, and directories.
- **Plugin:** add a capability that should be installed with the report engine, such as a company-specific renderer, custom component, or datasource connector. Plugins execute inside the Open Reports server process and must be trusted. See [plugin development](PLUGIN_DEVELOPMENT.md).

Do not give the browser a database credential. Do not use a plugin as a substitute for the host application's per-user authorization logic.

## Embed the designer or viewer

The browser embed package is a UI convenience; rendering is still backed by the hosted HTTP API. The optional Node helper just reduces boilerplate for two render calls. A server API key in a browser attribute or JavaScript bundle can be copied by users. For private reports and editing, put the embed server behind the host application's authenticated backend/reverse proxy, which can enforce the host's existing access rules and keep the Open Reports key server-side. Direct public viewer access is only appropriate when the report data is intentionally public.

See [embedding](EMBEDDING.md) for custom elements, events, and lifecycle methods.

## Move templates between environments

Report definitions are JSON. Export/import a definition or use the template/version API, then map the host application's report purpose to a template ID and a published version in its own configuration. Keep the mapping in the host application; Open Reports does not need to know what an “invoice”, “receipt”, or “discharge summary” means to the host.

For Jasper migration, import `.jrxml` sources using the [JRXML migration workflow](JRXML_MIGRATION.md), review its conversion issues, and verify output before switching a host workflow.
