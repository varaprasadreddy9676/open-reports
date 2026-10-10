# Flagship product video: from a blank page to Print in a real application

Status: **approved scope, 10 October 2026**; build work not started. This supersedes the scope of [invoice-to-application-video-plan.md](invoice-to-application-video-plan.md) and the 10-minute *invoice application walkthrough* now in the Learning Studio. That walkthrough stays as a shorter lesson; this film is the one that represents the whole product.

## The film in one sentence

A billing team builds a branded invoice from a blank page, saves it as a file, and two real-looking applications use it: a hospital system prints patient invoices with it and lets staff edit it in place, and a fintech dashboard downloads the same kind of document from a stored template.

## Format

- **Length:** 18–22 minutes, in 9 chapters. Long enough to build everything on camera, short enough to watch in one sitting. Chapters let developers jump straight to integration.
- **Also cut from the master:** a 90-second trailer (landing page, YouTube, social) and one clip per chapter for the Learning Studio.
- **Picture:** 1920 × 1080, light theme, real recordings of the real product and real HTTP traffic. Motion graphics only for titles, chapter cards and the request-flow explainer.
- **Sound:** narration with the existing macOS voice, quiet music under the intro, chapter cards and outro only.
- **Captions, transcript and chapter markers** ship with the video.

## The two host applications (fictional, built for the film)

| | **CareDesk HIMS** (primary) | **Ledgerline** (fintech, short) |
|---|---|---|
| Who | Northstar Medical Center billing desk | A payments platform's merchant dashboard |
| Screens | Patient search, OPD visit, bill/invoice detail with **Print**, **Download PDF**, **Design invoice** | Transactions list, invoice detail with **Download PDF** and a statement viewer |
| How it uses Open Reports | **Host-owned JSON**: the HIMS stores the invoice definition (file path or database row) and sends it with the data | **Stored template**: the definition is published in Open Reports once; Ledgerline renders it by template ID |
| Shows | Print, download, embedded designer, editing, saving, reopening | That a second, unrelated product can use the same engine a different way in a few lines |

Both use fictional patients, merchants, amounts and logos. They look like finished products (real navigation, tables, status chips, loading states), are built as fixtures beside the existing Acme Orders host in `marketing/training-videos/fixtures/`, and call the real local Open Reports server. Nothing in them imitates a real company.

## What "click Print" must make obvious

Every Print/Download moment in the film uses the same three-layer treatment so the viewer sees cause and effect:

1. **The click** in the host app, at normal speed.
2. **A request-flow overlay** (motion graphic, timed to the real requests): Browser → CareDesk backend → `POST /api/v1/render` on Open Reports → PDF bytes → back to the browser. Each hop lights up as its real request starts and completes.
3. **A request inspector panel** inside the fixture (developer view, toggled for the film), fed by the actual requests: method, URL, the JSON body (collapsed `report`, readable `data`), status, content type, size, render ID, timing.

Then the result: the downloaded file in the browser, the PDF open, and for Print the browser's print dialog. We never claim a physical print happened.

## Ways to integrate, shown accurately

| # | Way | When to use it | Shown in |
|---|---|---|---|
| 1 | Host resolves a **report path** (file or folder it controls), reads the JSON, sends `{ report, format, data }` to `POST /api/v1/render` | The app owns templates and versions; simplest to start | CareDesk Print / Download |
| 2 | Host loads the definition from its **database** (per hospital/tenant) and sends it the same way | Multi-tenant apps; per-customer layouts | CareDesk, switching branch/tenant |
| 3 | Open Reports **stores and publishes** the template; the app renders by **template ID** via `POST /api/v1/templates/:id/render` | Teams that want Open Reports to own drafts and immutable versions | Ledgerline |
| 4 | Drop in the **viewer** (`<open-report-viewer>`): parameters, find, sort, drill-down, print and download built in | Read-only screens with no backend code for rendering | Ledgerline statement screen |
| 5 | Embed the **designer** in host mode; edits come back to the app's save callback | Letting staff/customers edit their own layouts | CareDesk "Design invoice" |

Called out in one line each, not demonstrated: async jobs for very large exports, Base64 when a downstream system needs it, API keys stay on the backend.

The film says plainly that Open Reports receives the **definition**, not a file path. The path or key is the host's own reference, resolved on the host. No unsupported `{ reportPath }` request appears anywhere.

## Chapter plan

| Time | Chapter | What is actually recorded |
|---|---|---|
| 0:00–1:00 | **Cold open** | CareDesk: open a patient's bill, click Print, the flow overlay plays, the branded PDF appears. Then Ledgerline downloads a merchant invoice. Title card: *Your data. Beautifully on paper.* |
| 1:00–2:00 | **What you'll build** | The three ingredients in one diagram: definition (JSON), data (JSON), engine (Open Reports). The landing page in 10 seconds: open source, where to try it. |
| 2:00–7:30 | **Build the invoice from a blank page** | Blank A4. Page header with the hospital **logo** (image element, URL the server can reach) and address. Bill-to block bound to `data.invoice.patient`. Line-item table with quantity × rate, subtotal, tax, total. Footer with page X of Y. Real data bound from a sample JSON. Preview the actual PDF. Cut repetitive typing, never the meaningful clicks. |
| 7:30–9:00 | **Reusable header as a subreport** | Build (or open) a small `northstar-header.report.json` with both logos and contact details. Insert a **Subreport** in the invoice, choose that file, show it attached in Code view, preview. Explain: every document (invoice, receipt, lab report) can share the header. |
| 9:00–10:15 | **Save to your computer, open it again** | Export → Report file (`hospital-invoice.report.json`) into a visible project folder. Start fresh, then **Open file** and pick it from the file browser. The report returns intact. Show the JSON briefly: it is readable and reviewable in Git. |
| 10:15–14:00 | **Print and download from CareDesk HIMS** | Copy the file into CareDesk's `reports/` folder; show the backend config `INVOICE_REPORT_PATH` and the 15 lines that load it and call `/api/v1/render`. Click **Download PDF** with the request inspector and flow overlay. Click **Print** → browser print dialog. Switch to another branch/tenant: same code, different stored definition and logo (way 2). |
| 14:00–17:30 | **Edit the invoice inside CareDesk** | Click **Design invoice**: the real designer opens in an iframe inside CareDesk's own page. Show the 10-line `createDesigner` setup (`definition`, preview `data`, `saveMode: "host"`, `onSaveDefinition`). Edit the footer text and table colour, Save → CareDesk confirms → show the stored JSON changed. Reprint: the new PDF shows the edit. Show a failed save keeping the edits (brief). |
| 17:30–19:30 | **Same engine, another product: Ledgerline** | Publish the invoice as a stored template in Open Reports (one call). Ledgerline renders by template ID (way 3), then shows a statement with the drop-in viewer: search, sort, download (way 4). |
| 19:30–21:00 | **Recap and where to start** | Five ways on one card. Links: live demo, GitHub, docs, this sample code. A short, honest note on what is early (PDF/A, signatures not yet). End card with a GitHub star prompt. |

## Production approach

Built on the existing pipeline (`marketing/use-case-videos/record.mjs`: scripted Chromium actions, synchronized captions, H.264 encode), with these upgrades for flagship quality:

- **Voice:** the existing macOS voice (decided). Make it sound as natural as it can: short sentences, written for speech; numbers and code spoken as words (“slash A P I slash v one slash render”); deliberate pauses between steps; no narration over code the viewer must read. Generate narration per chapter so a script change re-renders only that chapter. The voice can be swapped later without re-recording the picture.
- **Motion graphics:** title and chapter cards, the request-flow overlay and the recap card as HTML/CSS animations rendered with the same pipeline (consistent with the new landing page palette), not stock templates.
- **Camera:** smooth zoom-and-pan to the active area (property panel, request body, PDF detail), cursor emphasis and click pulses already in the recorder; hold each readable moment long enough to read.
- **File browser shots:** Playwright sets files without showing the operating system's dialog. For the "open from your computer" shots, record a headed browser with macOS screen capture so the real file dialog appears, then cut it into the master.
- **Music:** one licensed or royalty-free track, ducked under speech.
- **Data and branding:** Northstar Medical Center (already used in the samples) and Ledgerline, with generated logos and synthetic people and amounts only.

## Build work before recording

1. CareDesk HIMS fixture: patient search, visit/bill detail, Print, Download PDF, Design invoice, tenant switch; backend that reads `INVOICE_REPORT_PATH` or a tenant JSON store and saves designer edits.
2. Ledgerline fixture: transactions, invoice download by template ID, statement viewer.
3. Request inspector component shared by both fixtures, fed by real fetch calls.
4. Request-flow overlay animation and title/chapter/recap cards.
5. Assets: hospital logos, `northstar-header.report.json`, sample invoice JSON (short bill and a long multi-page bill).
6. `record.mjs` scenario for each chapter, plus the headed-capture steps for the file dialog.
7. Narration script, timed against a rough cut before the final voice.

Rough effort: fixtures and overlays first (they are reusable for future lessons), then scripting, then recording and edit passes.

## Decisions (10 October 2026)

1. **Host apps:** CareDesk HIMS carries the story; a short Ledgerline fintech segment shows the stored-template and viewer routes.
2. **Voice:** the current macOS voice, written and paced for it (see Production approach).
3. **Length:** about 20 minutes, plus a 90-second trailer and per-chapter clips.
4. **Publishing:** YouTube, the in-app Learning Studio (chapters) and the landing page (trailer).

## Acceptance checks

- Everything happens on camera in the current product: the invoice is built from a blank page, not swapped for a prebuilt file.
- Every request shown in the inspector is real; the code on screen is the code that ran.
- Print, Download, designer load, save and reprint are real operations in the host app; the reprinted PDF shows the edit.
- The film never shows an unsupported request (such as rendering by file path or URL).
- PDFs contain the right identity, all line items, totals, logos, header subreport and page setup; the long bill paginates with repeated headings.
- Narration, captions, on-screen code and actions agree; no private data, keys or misleading success states.
- A reviewer can reproduce the whole film from the published sample code on a clean checkout.
