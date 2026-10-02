# User guide

Open the designer (`http://localhost:3000`). Everything you do edits one JSON document; you can see and edit it any time in **Code**.

## 1. Your first invoice (no documentation needed)
1. **New report → Invoice** (or **From sample JSON**: paste a response from your API and the report is generated with fields and tables).
2. Click any text on the page. The right panel shows its content as **Text · Field · Formula** — pick **Field** to bind to data.
3. In **Data**, search by field name, path, or type. Check the sample value, then drag a field onto the intended report band. Drag a *list* (e.g. `items`) and choose **Table** or **Repeater**.
4. Changing a total? Choose **fx Formula → Builder**: pick *Quantity × Rate* from dropdowns. Switch to **Formula** for the raw expression; autocomplete and errors appear as you type.
5. **Preview** shows the real PDF. **Export ▾** gives PDF, HTML, Excel, CSV or a ZPL label. **Save** keeps a version; **Publish** freezes it (published versions never change).

## 2. The workspace
| Area | What it does |
|---|---|
| Top modes | **Design · Data · Code · Preview**. ◫ shows Design and Code side by side. |
| Left | **Structure** (bands, layers, lock 🔒, hide 👁) · **Data** (searchable fields and samples) · **Components** (incl. *My Components* and *Plugins*) · **Pages** (thumbnails) |
| Canvas | Smart guides with distances in mm, 8 resize handles, marquee select, Alt-drag to duplicate, double-click to edit text, floating format bar, right-click menu, zoom to selection |
| Right | Properties for the selection — content, typography, layout (margin, padding, gap, grow, min/max), page-break rules, Advanced (visibility conditions) |
| Bottom | **Problems** (with one-click *Fix*) · **Pagination** (why content moved to the next page) · **History** (labelled steps, restore) |
| **View ▾** | Grid, rulers, smart guides, margins & safe area, boundaries, diagnostics, "design with first N rows" |
| **Target** | Choose PDF / HTML / Excel / CSV / ZPL — the designer warns about anything that format cannot express |

Shortcuts: `Ctrl+K` command palette · `Ctrl+S` save · `Ctrl+Z/Y` undo/redo · `Ctrl+C/V/D` copy/paste/duplicate · `Ctrl+G` group · `Ctrl+Shift+G` ungroup · `Ctrl+L` lock · `Ctrl+Shift+H` hide · `F2` rename · arrows nudge (Shift = ×10).

For free-positioned elements inside the same absolute layout, select two or more and use the right panel to align or match widths and heights. Match-size actions use the first selected element as the source. Flow content is arranged by its container, so coordinate actions are disabled for it.

## 3. Data
**Data mode** lists datasets: JSON, REST API, database (PostgreSQL/MySQL via server-side connections), or CSV upload. **Test request** shows a Table / Raw JSON / Schema view and hints (row counts, nested lists, dates). For API keys use `{{secrets.NAME}}`; the real value lives on the server as `REPORT_SECRET_NAME` and never enters the report. Add **parameters** (e.g. `invoiceId`) and use them as `{{params.invoiceId}}`.

## 4. Pagination for long documents
- Tables: **Repeat header on every page**; set *Min rows after break* to avoid a lone row on a page.
- Headings: **Keep with next**. Blocks that must not split: **Keep together** (Page breaks section).
- Long paragraphs are not yet split under the pagination engine's control; check the rendered PDF and overflow warnings before publishing long narrative reports.
- **Page → Headers & footers**: add a different first-page header, a last-page footer (signatures/totals) or odd/even masters.
- Open **Pagination** at the bottom to inspect recorded page-break decisions; click one to jump to it, or apply a suggested fix when available.

## 5. Printing and labels
- **Page → Print & labels**: choose a preset (80/58 mm receipt, 50×30 or 100×50 mm label, wristband…). The panel shows the physical size and the dot size at the printer's DPI, and the safe area is drawn on the canvas.
- QR/barcodes are checked for scannable size; **Fix** enlarges them.
- **Preview → ZPL** (or *Export → ESC/POS receipt* for thermal receipt printers) shows the label program and warnings (for example non-Latin text needs a PDF/image label, since Zebra's built-in fonts are Latin). **Download .zpl** to send to a printer.
- **Sticker sheets**: insert **Label sheet**, pick a stock (e.g. A4 2×4), design **one** label inside it, fill from a dataset (one label per record) or repeat the same label. *Start at position* reuses a partly used sheet. Print at **Actual size**; use *Draw label outlines* on plain paper to check alignment.

## 5b. Watermarks, bookmarks, highlighting
**Page → Watermark** (DRAFT/CONFIDENTIAL…), element *Advanced → PDF bookmark*, table → **Highlight rows** (e.g. out-of-range results in red) and **When there is no data** (headers / message / hide).

## 6. Reuse
Select elements → right-click → **Save as reusable component**. They appear under *My Components* for every report on that server.

## 7. API
`POST /api/v1/render` `{ report | templateId, format, parameters, data }` returns the file. Long jobs: `POST /api/v1/render/jobs`. Full list at `/openapi.json`. Authenticate with `x-api-key` or `Authorization: Bearer`.
