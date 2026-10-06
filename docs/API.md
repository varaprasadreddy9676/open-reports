# REST API

Base URL: `http://localhost:4000` · Interactive reference: `GET /openapi.json` · Auth: `x-api-key: <key>` (or `Authorization: Bearer <key>`) whenever the server has `API_KEYS` set.
Errors are JSON: `{ "error": { "code": "VALIDATION_FAILED", "message": "…", "details": [...] } }` with a 4xx status for caller mistakes (invalid report, unknown format, missing version), 422 when rendering/data fails.

## Endpoints

| Method & path | Purpose |
|---|---|
| `POST /api/v1/render` | Render an **inline** report: `{ report, format, parameters?, data? }` → file |
| `POST /api/v1/templates` | Create a template `{ id, name, definition }` (version 1, draft) |
| `PUT /api/v1/templates/:id` | New draft version `{ definition }` |
| `POST /api/v1/templates/:id/versions/:n/publish` | Publish (immutable from then on) |
| `POST /api/v1/templates/:id/render` | Render the latest **published** version (or `version: n`): `{ format, parameters?, data?, viewerState? }`. `viewerState` carries viewer choices applied before layout: `{ sort: [{ component, column, direction }], toggle: [{ component, keys }] }` |
| `GET /api/v1/templates` · `/:id` · `/:id/versions` · `/:id/versions/:n` · `DELETE /:id` | Browse and manage |
| `POST /api/v1/render/jobs` → `GET /api/v1/render/jobs/:id` → `GET …/output` · `DELETE …/:id` | Async render: poll status, download, cancel |
| `POST /api/v1/validate` | Schema + semantic validation |
| `POST /api/v1/analyze` | Validate **and paginate** without rendering: page count, pagination decisions, warnings |
| `POST /api/v1/datasets/test` | Run one dataset (with parameters) and preview rows |
| `GET /api/v1/schema` · `/capabilities` · `/plugins` · `/examples[/:name]` · `/blocks` | Metadata (schema is public) |
| `GET /health` | Liveness |

**Formats:** `pdf`, `html`, `docx`, `xlsx`, `csv`, `zpl` (labels), `escpos` (receipt printers), plus any plugin format. The response `content-type` matches; `x-render-id` and `x-render-warnings` headers are set.

**`data` vs. the template:** `data` is `{ "<datasetId>": <json> }`. It replaces the dataset with that id for this one render (or adds an inline dataset) — so one template serves any record. **`parameters`** feed `params.x` and `{{params.x}}` in REST/SQL datasets.

## Examples

### curl
```bash
curl -X POST "$URL/api/v1/templates/$TEMPLATE_ID/render" \
  -H "x-api-key: $KEY" -H 'content-type: application/json' \
  -d '{"format":"pdf","data":{"adm":{"patient":{"name":"Asha"}}}}' -o discharge.pdf
```

`TEMPLATE_ID` is the ID assigned when the template was created; `invoice` or `discharge` in examples is not a special built-in name. Use the template ID your application selected for this render. A published version can be pinned with the optional `"version": 3` request property. The response body is the PDF bytes (`Content-Type: application/pdf`), not JSON or Base64.

### Node 18+ with the client SDK

For a TypeScript or Node backend, you can use the optional thin [`@reporting/client`](../packages/client/README.md) helper for rendering. The hosted REST API is the integration contract; this package does not wrap every endpoint:

```ts
import { OpenReportsClient } from "@reporting/client";

const reports = new OpenReportsClient({
  server: process.env.OPEN_REPORTS_URL!,
  apiKey: process.env.OPEN_REPORTS_API_KEY,
});
const { bytes, mimeType } = await reports.renderTemplate(templateId, {
  format: "pdf",
  version: templateVersion,
  data: { invoice },
});
await fs.promises.writeFile("invoice.pdf", bytes);

// If an integration specifically needs a Base64 string:
const base64 = Buffer.from(bytes).toString("base64");
```

### Node 18+ with `fetch`
```js
const res = await fetch(`${URL}/api/v1/templates/${encodeURIComponent(templateId)}/render`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-api-key": KEY },
  body: JSON.stringify({ format: "pdf", version: templateVersion, data: { invoice } }),
});
if (!res.ok) throw new Error((await res.json()).error.message);
const pdfBytes = Buffer.from(await res.arrayBuffer());
await fs.promises.writeFile("invoice.pdf", pdfBytes);
const base64 = pdfBytes.toString("base64"); // Only if the caller needs Base64.
```

Base64 encodes the same bytes in a larger text representation (roughly one-third larger). Keep the raw response for downloads, file storage, or email attachments when possible. If an API contract requires Base64, encode it in the host application; the REST render endpoint does not have a Base64 response mode. The separate MCP `render_report` tool includes a `base64` field for binary results up to its inline-size limit (512 KiB by default); that is an MCP tool response feature, not a REST API option.

### Python
```python
import base64
import requests
from urllib.parse import quote

# Look this up in host-owned config after authorizing the current tenant/user.
template_id, template_version = "northstar-invoice", 3
r = requests.post(f"{URL}/api/v1/templates/{quote(template_id, safe='')}/render",
                  headers={"x-api-key": KEY},
                  json={"format": "pdf", "version": template_version,
                        "data": {"invoice": invoice}}, timeout=120)
r.raise_for_status()
pdf_bytes = r.content
open("invoice.pdf", "wb").write(pdf_bytes)
base64 = base64.b64encode(pdf_bytes).decode("ascii")  # only if required
```

### Java 11+
```java
ObjectMapper mapper = new ObjectMapper();
ObjectNode body = mapper.createObjectNode().put("format", "pdf");
String templateId = "northstar-invoice"; // selected from host-owned tenant config
int templateVersion = 3;
body.put("version", templateVersion);
body.set("data", mapper.valueToTree(Map.of("invoice", invoiceDto)));
var req = HttpRequest.newBuilder(URI.create(url + "/api/v1/templates/" + templateId + "/render"))
    .header("content-type", "application/json").header("x-api-key", key)
    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body))).build();
var res = HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.ofByteArray());
if (res.statusCode() < 200 || res.statusCode() >= 300) throw new RuntimeException("Open Reports returned " + res.statusCode());
Files.write(Path.of("invoice.pdf"), res.body());
```

### C#
```csharp
using System.Text.Json;

using var http = new HttpClient { BaseAddress = new Uri(url) };
http.DefaultRequestHeaders.Add("x-api-key", key);
var templateId = "northstar-invoice"; // selected from host-owned tenant config
var templateVersion = 3;
var requestJson = JsonSerializer.Serialize(new { format = "pdf", version = templateVersion, data = new { invoice } });
var res = await http.PostAsync($"/api/v1/templates/{Uri.EscapeDataString(templateId)}/render",
    new StringContent(requestJson, Encoding.UTF8, "application/json"));
res.EnsureSuccessStatusCode();
var pdfBytes = await res.Content.ReadAsByteArrayAsync();
await File.WriteAllBytesAsync("invoice.pdf", pdfBytes);
var base64 = Convert.ToBase64String(pdfBytes); // only if required
```

### Go
```go
import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	neturl "net/url"
)

templateID := "northstar-invoice" // selected from host-owned tenant config
templateVersion := 3
// invoice is the authorized DTO loaded by the host application.
payload, _ := json.Marshal(map[string]any{"format": "pdf", "version": templateVersion, "data": map[string]any{"invoice": invoice}})
body := bytes.NewReader(payload)
req, _ := http.NewRequest("POST", openReportsURL+"/api/v1/templates/"+neturl.PathEscape(templateID)+"/render", body)
req.Header.Set("content-type", "application/json"); req.Header.Set("x-api-key", key)
resp, err := http.DefaultClient.Do(req)
if err != nil { panic(err) }
defer resp.Body.Close()
if resp.StatusCode < 200 || resp.StatusCode >= 300 { panic("Open Reports render failed") }
pdfBytes, _ := io.ReadAll(resp.Body)
base64PDF := base64.StdEncoding.EncodeToString(pdfBytes) // only if required
```

### Labels straight to a Zebra printer
```bash
curl -s -X POST $URL/api/v1/templates/pharmacy-label/render -H "x-api-key: $KEY" -H 'content-type: application/json' \
  -d '{"format":"zpl","data":{"rx":{"drug":"Amoxicillin 500 mg","patient":"Asha Rao"}}}' | nc 192.168.1.50 9100
```

### Async job for a big export
```bash
JOB=$(curl -s -X POST $URL/api/v1/render/jobs -H "x-api-key: $KEY" -H 'content-type: application/json' \
  -d '{"report":'"$(cat big.report.json)"',"format":"xlsx"}' | jq -r .jobId)
until [ "$(curl -s $URL/api/v1/render/jobs/$JOB -H "x-api-key: $KEY" | jq -r .status)" = completed ]; do sleep 1; done
curl -s $URL/api/v1/render/jobs/$JOB/output -H "x-api-key: $KEY" -o big.xlsx
```
Job states: `queued → running → completed | failed | cancelled`; results are kept for a limited time.

### Check a report before shipping it
```bash
curl -s -X POST $URL/api/v1/analyze -H 'content-type: application/json' -H "x-api-key: $KEY" \
  -d "{\"report\":$(cat my.report.json)}" | jq '{valid, pageCount, decisions: [.decisions[].message]}'
```

## Tips
- Keep API keys on your backend. Browsers should call *your* backend.
- Store templates once (`POST /templates` + publish); render with `data` — cheaper and versioned.
- `invoice` in examples is an ordinary template ID. For multiple customers, map the authenticated tenant and report purpose to an allowed template ID and published version in the host backend. Open Reports currently does not enforce tenant-level template access; see the [multi-customer integration guidance](INTEGRATION_GUIDE.md#choose-a-template-for-each-customer).
- Render endpoints return file bytes directly. Convert to Base64 in the host only when a downstream interface requires it; the API has no Base64 response mode.
- Re-use the JSON Schema (`/api/v1/schema`) for editor autocomplete when generating reports in code.
- See the [integration guide](INTEGRATION_GUIDE.md) for host/backend boundaries, dataset choices, plugin guidance, and browser embedding.
