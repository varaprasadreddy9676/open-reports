# Use-case recipes

Every recipe starts from a ready-made example (**New report →** pick it, or `examples/<name>.report.json`). Replace the sample data with yours in **Data** mode, or pass `data` at render time ([API guide](API.md)).

- [Invoices, purchase orders, statements](#invoices-purchase-orders-statements)
- [Long reports with repeating headers (clinical, financial)](#long-reports)
- [Thermal receipts (58 / 80 mm)](#thermal-receipts)
- [Zebra labels and wristbands](#zebra-labels-and-wristbands)
- [A sheet of stickers (N per A4)](#a-sheet-of-stickers)
- [Excel / CSV exports of big tables](#excel--csv-exports)
- [Reports from your database](#reports-from-your-database)
- [Multiple languages](#multiple-languages)
- [Watermarks, bookmarks, confidential copies](#watermarks-and-bookmarks)
- [Batch generation / scheduled jobs](#batch-generation)
- [Embedding in your product](#embedding-in-your-product)

## Invoices, purchase orders, statements
**Start:** `invoice`, `purchase-order`, `account-statement`.
1. Open **Data** and replace the sample with your invoice JSON (or point a REST dataset at your billing API with `{{params.invoiceId}}`).
2. Bind fields (click text → *Field*). Totals use **variables** (*Data → Variables*), e.g. `subtotal = sumProduct(data.invoice.items, "quantity", "rate")`, `tax = vars.subtotal * 0.18`.
3. Formats: pick *Currency / Date / Number* from the dropdown — the report's `theme.currency` and `locale` decide symbols and separators.
4. Statements with hundreds of lines: select the table → **Repeat header on every page** and **Footer total**. Check **Pagination** at the bottom.

## Long reports
**Start:** `lab-report`, `discharge-summary`, `radiology-report`.
- Different first page (letterhead) and compact continuation header: *Page → Headers & footers → First page → + Copy* (then edit the first-page header).
- Signature/stamp only on the last page: *Last page* footer.
- Headings never alone at the bottom: **Keep with next**. Results table with at least 2 rows after a break: *Min rows after break = 2*.
- Paragraphs: *Min lines at top/bottom = 2* stops one stray line.
- Page numbers: add text with the formula `"Page " + page.number + " of " + page.total`.
- Abnormal values in red: table → *Highlight rows when…* (`row.value < row.low || row.value > row.high`).

## Thermal receipts
**Start:** `receipt` (80 mm), `receipt-58mm`.
- *Page → Print & labels →* preset **Thermal receipt 80 mm / 58 mm**; the printable width and dots are shown.
- Export **PDF** (print through the OS driver) or **ESC/POS** (raw bytes for Epson-compatible printers): *Export → ESC/POS receipt*, then send the file to the printer (e.g. `cat out.bin > /dev/usb/lp0`, or via your POS software's raw-print API).
- ESC/POS notes: 58 mm ≈ 32 columns, 80 mm ≈ 48; `₹` prints as `Rs.`; non-Latin scripts and charts are skipped with warnings (use PDF for those); a label/value `row` prints as left text + right-aligned value.

## Zebra labels and wristbands
**Start:** `specimen-label`, `pharmacy-label`, `blood-bag-label`, `wristband`, `label-50x30`, `label-100x50`, `patient-id-card`.
1. Choose the media in *Print & labels* (size, 203/300 dpi, safe margin). The canvas shows the physical size and the safe area.
2. Add **Barcode** (Code 128) / **QR**. The Problems panel warns if a code is too small to scan and offers **Fix**.
3. **Preview → ZPL** shows the program and warnings; **Download .zpl** and send it to the printer, e.g. `cat label.zpl | nc 192.168.1.50 9100` (Zebra raw port) or `lp -d zebra -o raw label.zpl`.
4. Per-patient labels: render with `data` for each patient, or loop in your app.
5. Non-Latin text on ZPL: Zebra's built-in fonts are Latin only — print those labels as **PDF** instead.

## A sheet of stickers
**Start:** `sticker-sheet` (A4, 2×4 of 99.1×67.7 mm).
1. Select the **Label sheet** element; choose your **label stock** (A4 2×4, 3×7, 3×8 …) or type columns, rows, label size and gaps in mm.
2. Design **one label** inside it. Fill: *One label per record* (pick the dataset) or *Repeat the same label* (number of labels).
3. Partly used sheet? **Start at position** = the first free slot (left→right, top→bottom).
4. Tick **Draw label outlines** and print on plain paper to check alignment, then print on stock at **Actual size / 100 %** (no "fit to page").
5. The panel warns if the sheet doesn't fit the page; fix margins in *Page*.

## Excel / CSV exports
**Start:** `large-dataset`.
- XLSX and CSV export the report's **table** (CSV: raw values, RFC 4180). Choose the table via the component's `exports` settings if you have several.
- Tested to 100 000 rows (≈ 8 s XLSX / 5 s CSV). For million-row exports, use async jobs (`/api/v1/render/jobs`) and CSV.
- Text cells starting with `= + - @` get a leading `'` so spreadsheets can't run them as formulas.

## Reports from your database
```bash
REPORT_SQL_HMS=postgres://reporting_ro:secret@db.internal:5432/hms   # server env, restart
```
Designer → *Data → Add dataset → Database (SQL)* → connection `hms`:
```sql
SELECT p.name, v.visit_date, v.amount FROM visits v JOIN patients p ON p.id = v.patient_id WHERE v.id = $1
```
Params: `["{{params.visitId}}"]` (MySQL uses `?`). Use a **read-only** DB user. Parameters are always bound, never concatenated.

## Multiple languages
**Start:** `multilingual`. Latin, Devanagari (Hindi), Telugu, Kannada, Tamil and Arabic (right-to-left) use the matching Noto fonts automatically; mixed text in one cell works. The **Problems** panel warns if the server lacks a font for a script in your report. Install `fonts-noto-core` (included in the Docker image).

## Watermarks and bookmarks
- *Page → Watermark*: `CONFIDENTIAL`, `DRAFT`, `COPY` — every page or first page only (PDF, HTML).
- Select a heading → *Advanced → PDF bookmark* for a navigable outline in the PDF viewer; use `bookmarkLevel` in the JSON for nesting.

## Batch generation
Render one template for many records from a script:
```js
for (const p of patients) {
  const res = await fetch(`${URL}/api/v1/templates/discharge/render`, { method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY },
    body: JSON.stringify({ format: "pdf", data: { adm: p } }) });
  await fs.writeFile(`out/${p.uhid}.pdf`, Buffer.from(await res.arrayBuffer()));
}
```
For hundreds of heavy documents use `POST /api/v1/render/jobs` and poll (see [API](API.md)). Run on a schedule with cron, a CI job or your workflow engine.

## Embedding in your product
- **Backend → API:** store templates once, render with `data`. Keep the API key on your server, never in a browser.
- **Let users edit templates:** link to the designer (same origin as the API when you run `pnpm start`/the Docker image), or build your own UI on the JSON + the [schema](REPORT_DEFINITION.md).
- **Custom needs:** [plugins](PLUGIN_DEVELOPMENT.md) add formats, formulas, data sources and components without forking.
