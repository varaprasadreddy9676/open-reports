# User guide

Open the designer (`http://localhost:3000`). Everything you do edits one JSON document; you can see and edit it any time in **Code**.

## 1. Your first invoice (no documentation needed)
1. **New report → Invoice** (or **From sample JSON**: paste a response from your API and the report is generated with fields and tables).
2. Click any text on the page. The right panel shows its content as **Text · Field · Formula** — pick **Field** to bind to data.
3. In **Data**, search by field name, path, or type. Check the sample value, then drag a field onto the intended report band. Drag a *list* (e.g. `items`) and choose **Table**, **Repeater**, or **Cards**. Leave **Create fields automatically** on to bind columns or card fields from the sample; turn it off to start with a blank editable field.
4. Changing a total? Choose **fx Formula → Builder**: pick *Quantity × Rate* from dropdowns. Switch to **Formula** for the raw expression; autocomplete and errors appear as you type.
5. **Preview** shows the real PDF. **Export ▾** gives PDF, HTML, Excel, CSV or a ZPL label. **Save** keeps a version. **Publish** opens a review: run validation and boundary-data checks, inspect the generated PDF, review warnings, and enter version notes. Critical errors block publishing; published versions never change.

## 2. The workspace
| Area | What it does |
|---|---|
| Top modes | **Design · Data · Code · Preview**. ◫ shows Design and Code side by side. |
| Left | **Structure** (bands, layers, lock 🔒, hide 👁) · **Data** (searchable fields and samples) · **Components** (incl. *My Components* and *Plugins*) · **Pages** (thumbnails) |
| Canvas | Smart guides with distances in mm, 8 resize handles, marquee select, hold Alt/Option to move without snapping, Shift+Alt/Option-drag to duplicate, double-click to edit text, floating format bar, right-click menu, zoom to selection |
| Right | Properties for the selection — content, typography, layout (margin, padding, gap, grow, min/max), page-break rules, Advanced (visibility conditions) |
| Bottom | **Problems** (with one-click *Fix*) · **Pagination** (why content moved to the next page) · **History** (labelled steps, restore) |
| **View ▾** | Grid, rulers, smart guides, margins & safe area, boundaries, diagnostics, "design with first N rows" |
| **Target** | Choose PDF / HTML / Excel / CSV / ZPL / ESC/POS — the designer warns about anything that format cannot express |

On a laptop, the properties panel starts closed and opens over the canvas when requested. Below 980 px the left workspace panel also starts closed; use the side arrows to open it and the close button in its header to return to the canvas. The canvas **Fit** control scales a full page into the available width.

Shortcuts: `Ctrl+K` command palette · `Ctrl+S` save · `Ctrl+Z/Y` undo/redo · `Ctrl+C/V/D` copy/paste/duplicate · `Ctrl+G` group · `Ctrl+Shift+G` ungroup · `Ctrl+L` lock · `Ctrl+Shift+H` hide · `F2` rename · arrows nudge (Shift = ×10).

For free-positioned elements inside the same absolute layout, select two or more and use the right panel to align or match widths and heights. With three or more, **Space horizontally/vertically** makes the gaps equal while keeping the outer elements in place. Match-size actions use the first selected element as the source. Flow content is arranged by its container, so coordinate actions are disabled for it. A selected element shows its X, Y, width, and height beside the canvas selection.

To arrange a band's contents, select its label in Structure and open **Size and layout**. Choose **Stack vertically**, **Side by side**, **Grid**, or **Free position**. Gap and padding use points; empty fixed height lets the band grow with its contents. Drag a child within a flow layout to reorder it. The inspector shows alignment and distribution controls only for layouts that use them.

For precise alignment, click the top ruler to place a vertical guide or the left ruler to place a horizontal guide. Open **Canvas settings → Guides** to add guides by keyboard, name them, enter exact positions, lock them against changes, or remove them. Positions use the selected ruler unit and zero point; switching to **Inside margins** changes the displayed origin without moving a guide. Guides are saved with the report and can also be dragged or double-clicked on the canvas.

While moving an element in a free-position layout, smart guides compare it with sibling edges and centres. Matching gaps between neighbours appear as blue paired measurements. Resizing from a handle snaps the active edge to nearby sibling edges, centres, page bounds, or saved guides, and shows the remaining gap. Grid snapping still applies on an axis without a nearby smart-guide match. Hold **Alt/Option** during the drag or resize to place freely; hold **Shift+Alt/Option** while dragging to make a copy.

In **Canvas settings → Ruler zero**, choose **Selected band** in Structure view to measure vertically from that band's top. Choose **Selection bounds** to measure from the upper-left corner of the selected element(s) visible on the first page. Clearing the selection temporarily returns the ruler to the page edge; it does not move any report content or guides.

For several elements in one **Free position** layout, the inspector's **Arrange** controls align edges, centres, and equal spacing. **Text baseline** aligns the first visible line of selected text using the canvas font measurements. **Tidy up** groups selected elements by their current rows, then places each row from the left with an 8 pt gap. It is disabled when that arrangement would overlap another visible element in the same layout. Both actions change report coordinates and can be undone. Flow items, locked elements, and items in different parents cannot be arranged together.

## 3. Data
**Data mode** lists datasets: JSON, REST API, database (PostgreSQL/MySQL via server-side connections), or CSV upload. **Test request** shows a Table / Raw JSON / Schema view and hints (row counts, nested lists, dates). For API keys use `{{secrets.NAME}}`; the real value lives on the server as `REPORT_SECRET_NAME` and never enters the report. Add **parameters** (e.g. `invoiceId`) and use them as `{{params.invoiceId}}`.

When a source has no preview rows, open its dataset editor and add **Fields**. Enter paths such as `name`, `amount`, or `patient.name`, choose each type, and set **Data shape** to a list or single object. Save the dataset; the fields appear in the Data rail and can be bound immediately. If a preview is available, **Use fields from preview** copies its inferred fields into the report definition. Declared fields describe the data shape; they do not create sample records.

Run **Preview** or **Test request** to compare declared fields with returned values. The result shows missing fields, mismatched types, and example row locations. A zero-row result keeps declared fields visible but cannot check their values. The check samples up to 20 records and a bounded number of nested values; **Problems** links any saved mismatch back to its dataset. It is an authoring warning, not a runtime rejection of source data.

Open **Data → Test data** to run disposable 0, 1, 10, 31, 32, 100, or 1,000 record scenarios against an array. You can add long text, nulls, negative values, multilingual text, and many groups. The lab runs the designer's layout checks and can compare its page count with an actual generated PDF. It leaves the report and saved sample intact. A passing page-count comparison does not prove that every value appears correctly in the PDF, so inspect the output before publishing.

For a grouped list such as `clinical.investigations`, create the group from that list, then drag the list into an otherwise empty Detail band and choose **Table**. The table prints once for each group using only that group's records. Add a field such as `row.department` to the Group Header, then select the table and choose **Edit table** (or double-click it) to remove a redundant Department column. Table Designer contains columns, multi-level headers, merged cells, groups, totals, pagination, conditions, and the no-data behavior; the normal inspector stays focused on the dataset and overall layout.

The selected element or band's **⋯** menu contains its code, lock, duplicate, and delete actions, as applicable.

For a custom hospital header, add Image components to the Page Header. **Embed image from file** stores a copy in the report. Alternatively, enter an **Image path or URL** to read the current logo on each render without editing the report; the rendering server must be able to access that path or URL. The repository's `apps/designer/tests/fixtures/letterheads/` folder includes separately cropped left brand artwork, left symbols, and right accreditation marks from the four supplied samples. Place editable Text components between the images, then preview the PDF to check spacing and legibility.

## 4. Pagination for long documents
- Tables: **Repeat header on every page**; set *Min rows after break* to avoid a lone row on a page.
- Headings: **Keep with next**. Blocks that must not split: **Keep together** (Page breaks section).
- Long paragraphs are not yet split under the pagination engine's control; check the rendered PDF and overflow warnings before publishing long narrative reports.
- **Page → Headers & footers**: add a different first-page header, a last-page footer (signatures/totals) or odd/even masters.
- Open **Pagination** at the bottom to inspect recorded page-break decisions; click one to jump to it, or apply a suggested fix when available.

## 5. Printing and labels
- **Page → Print & labels**: choose a preset (80/58 mm receipt, 50×30 or 100×50 mm label, wristband…). Small media fit the canvas when selected. The panel shows physical size and dot count at the printer's DPI, and the safe area is drawn on the canvas. In **Canvas settings**, choose **Printer dots** to read the ruler at that DPI; **Ruler zero → Inside margins** measures from the printable page margin. Set the correct DPI before positioning elements by dots.
- QR/barcodes are checked for scannable size; **Fix** enlarges them.
- **Preview → ZPL** shows the label program and warnings (for example non-Latin text needs a PDF/image label, since Zebra's built-in fonts are Latin). **Download .zpl** to send to a printer.
- For thermal bills, choose a 58 mm or 80 mm receipt preset, set the target to **ESC/POS**, then open **Preview → ESC/POS**. The continuous roll shows decoded printer output, line and cut counts, and renderer warnings. **Download .bin** saves those exact bytes. Check paper feed, character set, and cutting on the target printer before using it at a checkout.
- **Sticker sheets**: insert **Label sheet**, pick a stock (e.g. A4 2×4), design **one** label inside it, fill from a dataset (one label per record) or repeat the same label. *Start at position* reuses a partly used sheet. Print at **Actual size**; use *Draw label outlines* on plain paper to check alignment.

## 5b. Watermarks, bookmarks, highlighting
**Page → Watermark** (DRAFT/CONFIDENTIAL…), element *Advanced → PDF bookmark*, **Table Designer → Conditions** (e.g. out-of-range results in red), and **Table Designer → Rows & cells → When there is no data** (headers / message / hide).

For band visibility, element visibility, and conditional appearance, choose **Builder** for a simple field/operator/value rule or **Code** to type a JavaScript-style expression such as `row.quantity > 0 && row.status == "Ready"`. Both tabs edit the same report expression. Code offers field suggestions and syntax errors; it supports expressions and built-in functions, not arbitrary JavaScript statements. A condition too complex for the simple Builder stays editable in Code.

## 6. Reuse
Select elements → right-click → **Save as reusable component**. They appear under *My Components* for every report on that server.

## 6b. Publishing
**Publish** checks the current draft and every available array with 0, 1, 31, 32, and 100 records, plus a long/null/multilingual stress scenario. It renders a PDF from the current sample for review. A report change after the checks makes the results stale, so run them again. Acknowledge the PDF and any warnings, add version notes, then publish. The notes appear in **Compare versions**. The server independently refuses to publish a saved version with critical validation errors, including direct API requests. For REST/SQL reports, load sample data before running publish checks; this review does not prove that future live data will have the same shape.

## 7. API
`POST /api/v1/render` `{ report | templateId, format, parameters, data }` returns the file. Long jobs: `POST /api/v1/render/jobs`. Full list at `/openapi.json`. Authenticate with `x-api-key` or `Authorization: Bearer`.
