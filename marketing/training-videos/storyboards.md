# Training video storyboards and source index

The spoken script and real-browser action sequence are maintained together in [`marketing/use-case-videos/record.mjs`](../use-case-videos/record.mjs). The IDs below link each editable production source to its final MP4, selectable English captions, poster, audience, and chapter sequence. Chapter times are derived from the final WebVTT and MP4 metadata. All sample identities and amounts are fictional.
### 01. Open Reports in one minute (`open-reports-intro` · 1:15)

**Audience:** All new users

**Goal:** See how a report goes from data and design to a printable result.

**Storyboard:** 00:05 Open Reports turns application data into print-ready… → 00:17 Choose a starter that is close to your work, or begin with… → 00:29 In Design, arrange text, logos, tables and other report… → 00:43 Preview renders the actual PDF so you can check how the… → 00:56 Save keeps an editable draft. Publishing follows… → 01:07 Start with the designer tour and first-report lesson, then…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `open-reports-intro`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/open-reports-intro.mp4) · [captions](../../apps/designer/public/demo-videos/open-reports-intro.vtt) · [poster](../../apps/designer/public/demo-videos/open-reports-intro-poster.jpg)

### 02. Find your way around the designer (`designer-tour` · 2:02)

**Audience:** All new users

**Goal:** Start at Home, explore Design, Data, Code and Preview, then return home.

**Storyboard:** 00:04 Welcome to Open Reports. Home is your starting point for… → 00:14 Open Department Revenue. This three-page example lets us… → 00:23 Design is where you arrange the report. The Structure… → 00:45 Code shows the report definition as JSON. It is useful… → 00:55 Sections is the layout view: it shows where page headers,… → 01:05 Turn on Pagination to see the sample pages and where each… → 01:13 Select Why beside a page to see the available space and… → 01:33 Preview renders the actual output. This is the PDF people… → 01:43 The Home button returns you to the starting point. From… → 01:50 The quickest way to learn the interface is to start with a…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `designer-tour`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/designer-tour.mp4) · [captions](../../apps/designer/public/demo-videos/designer-tour.vtt) · [poster](../../apps/designer/public/demo-videos/designer-tour-poster.jpg)

### 03. Build your first report from data (`first-report` · 2:07)

**Audience:** All new users

**Goal:** Create a heading, connect sample JSON, add a bound field and table, calculate a total, and preview the PDF.

**Storyboard:** 00:04 In this lesson, we will build a small invoice from… → 00:18 Choose Blank report. It gives you a clean page while… → 00:28 Add a text element and enter a useful title. You can… → 00:42 Open Data and create a dataset called invoice. The example… → 00:57 The saved dataset exposes fields on the left. Drag… → 01:11 Drag the items list onto the page and choose Table. The… → 01:28 Open Edit table and add an Amount column. Set its formula… → 01:47 Preview renders the document with the sample data. Check… → 01:59 Save keeps an editable draft in this server. Publishing is…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `first-report`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/first-report.mp4) · [captions](../../apps/designer/public/demo-videos/first-report.vtt) · [poster](../../apps/designer/public/demo-videos/first-report-poster.jpg)

### 04. Edit an invoice table (`table-designer-workflow` · 2:01)

**Audience:** Authors and analysts

**Goal:** Resize columns, add a grouped header, inspect rows and set totals before previewing.

**Storyboard:** 00:04 A table repeats a set of columns for records in a dataset.… → 00:17 Open the invoice example, select its line-item table and… → 00:31 In Columns, rename Rate to Unit price and drag the… → 00:43 Multi-level headers let one heading span several columns.… → 01:01 Rows and cells shows actual sample records. Use this view… → 01:14 Totals controls the footer calculations. Sum the quantity… → 01:25 Pagination controls whether table headings repeat and… → 01:40 Done returns to the report. Preview the PDF to check the… → 01:49 A table stays part of the report definition. Save the…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `table-designer-workflow`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/table-designer-workflow.mp4) · [captions](../../apps/designer/public/demo-videos/table-designer-workflow.vtt) · [poster](../../apps/designer/public/demo-videos/table-designer-workflow-poster.jpg)

### 05. Merge table cells and highlight rows (`table-merges-rules` · 1:57)

**Audience:** Authors and analysts

**Goal:** Merge repeated transaction dates and inspect a conditional low-balance style in a real statement.

**Storyboard:** 00:05 Tables can combine repeated values and highlight records… → 00:18 Open the Account Statement example. The transaction list… → 00:34 Select the transactions table and open Edit table. Rows… → 00:47 Select the Date cells in the first two records and choose… → 00:59 Keep the merge attached to its data record when the row… → 01:14 For a whole column of adjacent duplicates, Columns also… → 01:27 In Conditions, this sample highlights balances below… → 01:45 Preview the PDF to check that the date merge and…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `table-merges-rules`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/table-merges-rules.mp4) · [captions](../../apps/designer/public/demo-videos/table-merges-rules.vtt) · [poster](../../apps/designer/public/demo-videos/table-merges-rules-poster.jpg)

### 06. Group records and calculate subtotals (`grouped-report-workflow` · 1:36)

**Audience:** Authors and analysts

**Goal:** Read nested department and doctor groups, inspect subtotal bands, and verify the report total.

**Storyboard:** 00:05 Grouping organizes a detail list into meaningful sections.… → 00:20 Open the fictional Department Revenue report. Its visits… → 00:30 A group header appears when its value changes. The outer… → 00:41 Select the Department group to see its grouping field and… → 00:53 A Doctor subtotal belongs in its group footer, so it… → 01:03 The Department footer adds a higher-level subtotal after… → 01:12 The data footer appears once after all groups and records,… → 01:22 Preview the PDF and follow the department headers, doctor…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `grouped-report-workflow`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/grouped-report-workflow.mp4) · [captions](../../apps/designer/public/demo-videos/grouped-report-workflow.vtt) · [poster](../../apps/designer/public/demo-videos/grouped-report-workflow-poster.jpg)

### 07. Create a group and add subtotals (`group-create-workflow` · 1:43)

**Audience:** Authors and analysts

**Goal:** Group fictional sales by region, label each group, and calculate its revenue total.

**Storyboard:** 00:05 A group collects neighboring records with the same value.… → 00:16 Open the fictional Regional Sales grouping practice… → 00:29 In the Structure explorer, choose Add, then Group. Pick… → 00:36 Name the group Region, sort it alphabetically, and repeat… → 00:53 The new group gets header and footer bands. Add a formula… → 01:13 In the group footer, calculate the total for only this… → 01:25 Preview the report. Verify that cities sit under the right… → 01:33 The same pattern works for customers, product families,…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `group-create-workflow`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/group-create-workflow.mp4) · [captions](../../apps/designer/public/demo-videos/group-create-workflow.vtt) · [poster](../../apps/designer/public/demo-videos/group-create-workflow-poster.jpg)

### 08. Design a barcode label and export ZPL (`barcode-label-zpl` · 2:08)

**Audience:** Retail and print operators

**Goal:** Check a 50 × 30 mm label, its safe area and barcode, then download printer-ready ZPL.

**Storyboard:** 00:04 A barcode label must match the physical stock and printer… → 00:18 Open the Label 50 by 30 example. It uses fictional item… → 00:29 Select the barcode to inspect its data expression, size… → 00:42 Open Report settings and Print. The preset sets this label… → 01:00 Preview the PDF to inspect the visual layout and the… → 01:15 Now open ZPL. This is the printer-language output, with… → 01:25 Download the ZPL file and send it only to a compatible… → 01:37 The same approach works for other label sizes, cards and… → 01:46 Before using labels in production, print a calibration… → 01:57 Confirm the printer language and model before sending ZPL.…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `barcode-label-zpl`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/barcode-label-zpl.mp4) · [captions](../../apps/designer/public/demo-videos/barcode-label-zpl.vtt) · [poster](../../apps/designer/public/demo-videos/barcode-label-zpl-poster.jpg)

### 09. Calibrate and reuse a printer profile (`printer-profiles` · 2:20)

**Audience:** Retail and print operators

**Goal:** Calibrate a thermal printer with a test label, save the stock and resolution profile, then reuse it for another label size.

**Storyboard:** 00:06 A label that looks right on screen can still shift on a… → 00:22 Open the fictional 50 by 30 millimeter barcode label. This… → 00:35 Choose the matching ZPL printer preset. Check its physical… → 00:48 Before printing a batch, open Calibrate ZPL printer and… → 01:06 For this walkthrough only, enter a sample measurement… → 01:23 Apply the correction and review its scale and position… → 01:38 Switch to a different label preset. Applying the saved… → 01:52 Confirm the print facts match the target media before… → 02:04 Print one calibration sample and scan or inspect it on the…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `printer-profiles`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/printer-profiles.mp4) · [captions](../../apps/designer/public/demo-videos/printer-profiles.vtt) · [poster](../../apps/designer/public/demo-videos/printer-profiles-poster.jpg)

### 10. Set up a page and place elements precisely (`layout-precision` · 1:49)

**Audience:** Report authors

**Goal:** Choose A4, A5 or A6 and orientation, then align and resize on the canvas.

**Storyboard:** 00:04 Print layout starts with the right paper size. Then use… → 00:14 Choose Blank report so we can set up the page before… → 00:22 Page size and orientation are separate settings. Choose… → 00:32 For this example choose A5 landscape. The canvas shows the… → 00:45 Add a heading and change its text. Select it to reveal its… → 00:55 Open Canvas settings, switch the ruler to millimeters, and… → 01:12 Drag the heading into position. It follows your cursor and… → 01:21 Add a rectangle as a simple shape, then drag it… → 01:28 Resize the rectangle while holding its corner handle. The… → 01:41 Preview the page to check how its paper size, orientation,…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `layout-precision`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/layout-precision.mp4) · [captions](../../apps/designer/public/demo-videos/layout-precision.vtt) · [poster](../../apps/designer/public/demo-videos/layout-precision-poster.jpg)

### 11. Sections and bands explained (`sections-explained` · 2:08)

**Audience:** Report authors

**Goal:** Learn what runs once, repeats on each page, groups records, and prints for each row.

**Storyboard:** 00:04 A report is made of sections, also called bands. They tell… → 00:22 Open Department Revenue. It is a fictional report with… → 00:34 The report header is printed once near the beginning. Put… → 00:42 The page header belongs to each printed page. Use it for a… → 00:52 A data header holds column labels above a repeating list.… → 01:11 Detail sections repeat for each matching record. Here,… → 01:22 A child section nests under its parent record. Use it for… → 01:32 Group footers can total one department or doctor. The data… → 01:41 A No Data section can show a helpful message when a… → 01:57 The page footer sits at the bottom of printed pages, while…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `sections-explained`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/sections-explained.mp4) · [captions](../../apps/designer/public/demo-videos/sections-explained.vtt) · [poster](../../apps/designer/public/demo-videos/sections-explained-poster.jpg)

### 12. Connect data from JSON, CSV and a REST API (`data-sources` · 2:09)

**Audience:** Authors and analysts

**Goal:** Test sample data, pass a report parameter to an API, and bind a returned field.

**Storyboard:** 00:04 A report can use inline JSON, a CSV file or a REST API.… → 00:19 Open a blank report and choose Data. The side panel holds… → 00:27 Add a parameter called userId with sample value 1. The… → 00:40 Create a REST dataset and add the parameter to the URL.… → 00:52 Preview data sends this sample request. Check the returned… → 01:04 Save the dataset, then drag the returned name field onto… → 01:18 Add a CSV dataset and preview its rows. The first row… → 01:30 Database sources use a named PostgreSQL or MySQL… → 01:47 Run Preview to check the report using the sample API… → 01:58 For production, validate the API response shape and…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `data-sources`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/data-sources.mp4) · [captions](../../apps/designer/public/demo-videos/data-sources.vtt) · [poster](../../apps/designer/public/demo-videos/data-sources-poster.jpg)

### 13. Use formulas and conditions (`formulas-conditions` · 2:09)

**Audience:** Authors and analysts

**Goal:** Transform a value, format a date, and control element visibility with a rule.

**Storyboard:** 00:06 Formulas let a report calculate or transform a displayed… → 00:20 Open the invoice example and select the customer name. In… → 00:33 This value formula accepts a safe if/return block. For… → 00:48 The canvas now shows N/A for this sample customer. Change… → 01:01 Select the invoice date. Its formula uses the built-in… → 01:31 Select the status text and open Rules. Turn on visibility,… → 01:43 The Code view shows the equivalent boolean expression. You… → 02:00 Preview the PDF to verify the transformed name, readable…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `formulas-conditions`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/formulas-conditions.mp4) · [captions](../../apps/designer/public/demo-videos/formulas-conditions.vtt) · [poster](../../apps/designer/public/demo-videos/formulas-conditions-poster.jpg)

### 14. Keep long reports readable across pages (`long-report-pagination` · 2:16)

**Audience:** Report authors

**Goal:** Inspect page breaks, repeat table headings, and choose first, normal, and last page masters.

**Storyboard:** 00:05 Long reports need clear page breaks, repeated column… → 00:19 Open the Account Statement example. It has many… → 00:32 Preview the PDF. Check that the transaction heading… → 00:46 Back in Design, open the Pagination panel. It counts… → 01:05 Select the transactions table and open Table Designer. Its… → 01:22 Minimum rows before and after a break can avoid awkward… → 01:45 In Pages, open Edit page masters. First, Normal and Last… → 02:03 Preview again after changes. Verify the page count,…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `long-report-pagination`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/long-report-pagination.mp4) · [captions](../../apps/designer/public/demo-videos/long-report-pagination.vtt) · [poster](../../apps/designer/public/demo-videos/long-report-pagination-poster.jpg)

### 15. Customize first, normal and last page bands (`page-master-variants` · 2:02)

**Audience:** Report authors

**Goal:** Give an account statement a distinct opening and final page footer, then review the real PDF.

**Storyboard:** 00:06 A report can use different headers, footers and… → 00:23 Open the Account Statement example. It spans several… → 00:34 Choose Pages, then Edit page masters. Select a page type… → 00:49 On First, choose Copy normal for the footer. The… → 00:59 Edit that footer to identify the opening statement. The… → 01:18 On Last, copy Normal and label it as the final account… → 01:32 For any band you can keep Normal, make an independent… → 01:44 Preview the full PDF. Check page one, a middle page and… → 01:53 Use page masters when a cover, repeated page identity and…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `page-master-variants`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/page-master-variants.mp4) · [captions](../../apps/designer/public/demo-videos/page-master-variants.vtt) · [poster](../../apps/designer/public/demo-videos/page-master-variants-poster.jpg)

### 16. Customize a client letterhead and footer (`client-letterhead` · 2:09)

**Audience:** Report authors

**Goal:** Replace logo sources, update organization details, and compare a pre-printed page.

**Storyboard:** 00:04 This fictional discharge summary shows two practical ways… → 00:21 The page header has a left logo, organization details, and… → 00:35 For a logo that rarely changes, embed a file so it travels… → 00:48 For a client-specific logo, use an image URL the rendering… → 01:01 Update the organization name in the header. This text is… → 01:09 This first-page footer has contact details. A report can… → 01:22 Preview the PDF to check both logos, the changed… → 01:32 Save an editable draft before sharing it. Keep… → 01:46 If your organization already prints on the paper, open the… → 01:59 The report content then uses the clear area below the…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `client-letterhead`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/client-letterhead.mp4) · [captions](../../apps/designer/public/demo-videos/client-letterhead.vtt) · [poster](../../apps/designer/public/demo-videos/client-letterhead-poster.jpg)

### 17. Reuse a client header with a subreport (`shared-header-subreport` · 1:45)

**Audience:** Report authors

**Goal:** Select a child report file and attach its logos and contact details to multiple parent reports.

**Storyboard:** 00:05 Use a subreport when the same report block, such as a… → 00:15 The parent report defines an invoice, receipt or lab… → 00:28 Start a blank parent report and add a Subreport from… → 00:34 The child JSON is attached to the parent. Set the… → 00:50 Switch to Code and see the child definition attached to… → 01:03 Preview the actual PDF to check the logo sources and… → 01:20 Start another blank parent and select the same source file… → 01:35 A host application can keep child JSON in its shared…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `shared-header-subreport`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/shared-header-subreport.mp4) · [captions](../../apps/designer/public/demo-videos/shared-header-subreport.vtt) · [poster](../../apps/designer/public/demo-videos/shared-header-subreport-poster.jpg)

### 18. Build a sales crosstab (`crosstab-workflow` · 2:01)

**Audience:** Authors and analysts

**Goal:** Compare regions and services, change the calculation, and review totals.

**Storyboard:** 00:05 A crosstab turns a list of records into a summary grid.… → 00:16 Open the fictional Sales by region and service report. Its… → 00:29 Regions run down the side, service types run across the… → 00:42 Change the row and column fields to switch the view: now… → 00:54 Change the measure from Sum to Average to compare the… → 01:06 Total row and total column are separate controls. Turn the… → 01:17 Rename the summary label so readers know this table shows… → 01:28 Preview the PDF to check the changed axes, average values… → 01:38 After changing row fields, column fields or the… → 01:50 A crosstab answers a summary question; keep the source…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `crosstab-workflow`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/crosstab-workflow.mp4) · [captions](../../apps/designer/public/demo-videos/crosstab-workflow.vtt) · [poster](../../apps/designer/public/demo-videos/crosstab-workflow-poster.jpg)

### 19. Choose the right report output (`output-formats` · 2:07)

**Audience:** Report authors and developers

**Goal:** Compare PDF, HTML, Excel, CSV and Word exports, then see where printer formats fit.

**Storyboard:** 00:07 Open Reports can turn one report into different outputs.… → 00:19 Open the invoice example. We will keep the same data and… → 00:31 PDF preserves the page layout for review, printing and… → 00:43 HTML keeps the report readable in a browser. It is useful… → 00:55 Excel creates a structured workbook from the report table,… → 01:10 CSV is a plain text export of table values. It is useful… → 01:27 Word export creates an editable DOCX when the recipient… → 01:44 For a printer-specific workflow, use the receipt or label… → 01:56 Use the output preview to inspect the result, then export…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `output-formats`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/output-formats.mp4) · [captions](../../apps/designer/public/demo-videos/output-formats.vtt) · [poster](../../apps/designer/public/demo-videos/output-formats-poster.jpg)

### 20. Review and publish a report version (`publish-review` · 1:49)

**Audience:** Authors and administrators

**Goal:** Run validation, inspect the PDF, publish an immutable version, and compare later edits.

**Storyboard:** 00:05 Saving keeps a report draft editable. Publishing runs… → 00:16 Open the invoice example, name this report, and save the… → 00:27 Choose Publish to open the review. Before publishing, the… → 00:47 Review the check results, then inspect the generated PDF.… → 00:57 Mark the PDF reviewed, add a short version note, and… → 01:11 Publish the version. Published definitions are immutable,… → 01:23 Now make a small draft edit and save it as a new version.… → 01:41 Use the review gate for each release, and keep notes that…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `publish-review`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/publish-review.mp4) · [captions](../../apps/designer/public/demo-videos/publish-review.vtt) · [poster](../../apps/designer/public/demo-videos/publish-review-poster.jpg)

### 21. Use the interactive report viewer (`interactive-viewer` · 2:01)

**Audience:** Report readers and web developers

**Goal:** Show a host-owned report in a portal, change a parameter, search, sort, and download.

**Storyboard:** 00:05 A report viewer lets people use a report inside the… → 00:16 The report renders directly from host-owned JSON. The… → 00:27 Change the reporting period and refresh. The viewer sends… → 00:38 Expand West to see its orders. The group subtotal stays… → 00:49 Choose order SO-1042. Its link opens a detail report and… → 01:13 Expand North, then search for Anita Rao. The viewer… → 01:23 Open Contents to jump to the bookmarked sales overview.… → 01:32 Sort the visible customer column. The viewer asks the… → 01:41 Download PDF for a fixed-page copy. CSV is useful when the… → 01:51 The host application still decides which user may see each…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `interactive-viewer`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/interactive-viewer.mp4) · [captions](../../apps/designer/public/demo-videos/interactive-viewer.vtt) · [poster](../../apps/designer/public/demo-videos/interactive-viewer-poster.jpg)

### 22. Render a report from your application API (`api-rendering` · 1:48)

**Audience:** Application developers

**Goal:** Send host-owned report JSON and authorized data, then use the rendered PDF bytes in your app.

**Storyboard:** 00:06 Open Reports can render a report directly from your… → 00:18 This Node request sends the report definition, a PDF… → 00:32 Render the invoice. This page sends a real request to the… → 00:45 The API returns raw PDF bytes with a content type and… → 00:57 If your host contract needs Base64, encode the returned… → 01:11 The request data should contain only fields the report… → 01:23 This server is unauthenticated for the local training… → 01:36 If you want Open Reports to own drafts and published…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `api-rendering`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/api-rendering.mp4) · [captions](../../apps/designer/public/demo-videos/api-rendering.vtt) · [poster](../../apps/designer/public/demo-videos/api-rendering-poster.jpg)

### 23. Embed the designer in your application (`designer-embedding` · 1:34)

**Audience:** Application developers

**Goal:** Load a host-owned report into the embedded designer, edit it, and save the JSON through your host callback.

**Storyboard:** 00:06 You can put the Open Reports designer inside an existing… → 00:21 This portal embeds the actual designer in a frame and… → 00:32 Update the heading for this customer. The user edits with… → 00:42 The change is marked unsaved. In host save mode, Open… → 00:55 Choose Save. The example host stores the returned… → 01:05 Your application should authorize who may edit each tenant… → 01:22 Use server-managed templates when you want Open Reports to…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `designer-embedding`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/designer-embedding.mp4) · [captions](../../apps/designer/public/demo-videos/designer-embedding.vtt) · [poster](../../apps/designer/public/demo-videos/designer-embedding-poster.jpg)

### 24. Connect the designer and protect API keys (`settings-security` · 1:27)

**Audience:** Application developers

**Goal:** Set the server URL, test the connection, and review safer backend integration patterns.

**Storyboard:** 00:05 Settings connects the designer to a reporting server and… → 00:19 The server URL is the base address of the Open Reports… → 00:29 Test connection checks that this server is reachable and… → 00:43 The integration tab shows real request examples for common… → 01:00 The browser stores this designer key locally, and browser… → 01:12 Keep private keys and data access on your authenticated…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `settings-security`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/settings-security.mp4) · [captions](../../apps/designer/public/demo-videos/settings-security.vtt) · [poster](../../apps/designer/public/demo-videos/settings-security-poster.jpg)

### 25. Extend the server with a trusted plugin (`plugin-workflow` · 2:06)

**Audience:** Application developers

**Goal:** Inspect a trusted server plugin and its capabilities, then render a host report with its custom renderer and expression helpers.

**Storyboard:** 00:04 A server plugin adds a capability that your application… → 00:17 This local training server starts with the built… → 00:28 The plugin registry shows whether the plugin is active and… → 00:40 The capability list includes a plain-text renderer, the… → 00:56 If a plugin is missing or failed, inspect the real… → 01:12 Render the fictional visit summary. This is a real request… → 01:20 The response is plain text produced by the plugin… → 01:29 A custom component can expand into ordinary report… → 01:42 The designer browser cannot execute trusted server plugin… → 01:52 Plugins run inside the report-server process, so install…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `plugin-workflow`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/plugin-workflow.mp4) · [captions](../../apps/designer/public/demo-videos/plugin-workflow.vtt) · [poster](../../apps/designer/public/demo-videos/plugin-workflow-poster.jpg)

### 26. Save and reuse report components (`reusable-blocks` · 1:37)

**Audience:** Report authors

**Goal:** Save a shared brand element and choose whether report copies follow, pin, or detach from updates.

**Storyboard:** 00:05 Save a useful block once and reuse it across reports. A… → 00:20 Start with a blank report and create a simple Northstar… → 00:32 Choose Save selection and give the block a name. It is… → 00:44 The new block appears under My Components. Choose how it… → 01:00 Remove the original and insert the linked version. There… → 01:11 Pinned blocks keep the version they were inserted from,… → 01:24 An editable copy can change independently. Use blocks for…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `reusable-blocks`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/reusable-blocks.mp4) · [captions](../../apps/designer/public/demo-videos/reusable-blocks.vtt) · [poster](../../apps/designer/public/demo-videos/reusable-blocks-poster.jpg)

### 27. Handle a long render as a background job (`async-render-jobs` · 1:34)

**Audience:** Application developers

**Goal:** Queue a render, poll its status, download the completed file, and understand the current job store limits.

**Storyboard:** 00:06 For a larger export or a request that should not hold a… → 00:18 This is a real request to create a PDF job. The same… → 00:28 The API responds with HTTP 202 and a job ID. Keep that ID… → 00:40 Poll the job endpoint until it reports completed, failed,… → 00:52 When complete, fetch the output endpoint and handle its… → 01:04 Job output is retained only for a limited time. The… → 01:20 Keep API keys in the backend and authorize the report data…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `async-render-jobs`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/async-render-jobs.mp4) · [captions](../../apps/designer/public/demo-videos/async-render-jobs.vtt) · [poster](../../apps/designer/public/demo-videos/async-render-jobs-poster.jpg)

### 28. Create an invoice and preview the PDF (`invoice-to-pdf` · 0:36)

**Audience:** New report authors

**Goal:** Edit a working invoice, then inspect the finished PDF.

**Storyboard:** 00:05 Start with a working invoice instead of a blank page. → 00:11 Change the company name directly on the report canvas. → 00:17 Run Preview to inspect the actual PDF, including line… → 00:29 The same editable report is ready to adjust for your own…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `invoice-to-pdf`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/invoice-to-pdf.mp4) · [captions](../../apps/designer/public/demo-videos/invoice-to-pdf.vtt) · [poster](../../apps/designer/public/demo-videos/invoice-to-pdf-poster.jpg)

### 29. Build a hospital letterhead with logos (`hospital-letterhead` · 1:09)

**Audience:** New report authors

**Goal:** Align left and right logos, then compare editable headers with pre-printed stationery.

**Storyboard:** 00:06 A report header can combine a logo, an organization name,… → 00:18 Start with a fictional discharge summary. The hospital… → 00:33 Preview the editable version to review the two-sided logo… → 00:45 For stationery that is already printed, open the… → 00:57 Use either approach: arrange separate logos in the…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `hospital-letterhead`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/hospital-letterhead.mp4) · [captions](../../apps/designer/public/demo-videos/hospital-letterhead.vtt) · [poster](../../apps/designer/public/demo-videos/hospital-letterhead-poster.jpg)

### 30. Summarize sales with a crosstab (`sales-crosstab` · 0:36)

**Audience:** New report authors

**Goal:** Compare sales by region and service, then preview the totals.

**Storyboard:** 00:04 Turn row-level sales into a quick regional comparison. → 00:11 Open the Sales by region and service example and select… → 00:20 The report arranges regions down the side and services… → 00:29 Run Preview to check the grouped values and totals in the…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `sales-crosstab`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/sales-crosstab.mp4) · [captions](../../apps/designer/public/demo-videos/sales-crosstab.vtt) · [poster](../../apps/designer/public/demo-videos/sales-crosstab-poster.jpg)

### 31. Build and print a long supermarket receipt (`supermarket-receipt` · 2:00)

**Audience:** Retail and print operators

**Goal:** Edit a 45-item grocery basket, inspect the continuous roll, compare PDF with ESC/POS, and download printer bytes.

**Storyboard:** 00:05 A 58 millimeter receipt can hold a long basket, but the… → 00:22 Open the Receipt 58 mm example. It uses a continuous roll… → 00:39 Edit the sale with a realistic grocery basket. The line… → 00:50 Choose Roll to inspect the complete receipt as one strip.… → 01:01 Open the Print settings and check the 58 millimeter width,… → 01:17 Preview PDF to check its paper layout, then open ESC/POS… → 01:34 Download the .bin file to send the generated bytes to a… → 01:46 The same report can offer a paged PDF for email and a…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `supermarket-receipt`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/supermarket-receipt.mp4) · [captions](../../apps/designer/public/demo-videos/supermarket-receipt.vtt) · [poster](../../apps/designer/public/demo-videos/supermarket-receipt-poster.jpg)

### 32. Print a sheet of address or inventory labels (`sticker-sheet-workflow` · 1:36)

**Audience:** Retail and print operators

**Goal:** Choose A4 label stock, fill one label per record, use a start position and check print alignment.

**Storyboard:** 00:05 A label sheet prints one design repeatedly across a page.… → 00:20 Open the fictional A4 sticker sheet. The example has ten… → 00:29 Select the label sheet and choose the matching A4… → 00:40 One label per record fills each position from the selected… → 00:49 Set Start at position to five when the first four labels… → 01:03 Turn on Draw label outlines and inspect the PDF. Print… → 01:19 For production, turn outlines back off and print at Actual… → 01:29 Preview the complete sheet count and page layout before…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `sticker-sheet-workflow`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/sticker-sheet-workflow.mp4) · [captions](../../apps/designer/public/demo-videos/sticker-sheet-workflow.vtt) · [poster](../../apps/designer/public/demo-videos/sticker-sheet-workflow-poster.jpg)

### 33. Turn a Word template into an editable report (`word-to-report` · 2:17)

**Audience:** Report authors migrating existing files

**Goal:** Import a DOCX template, open the draft and review its output.

**Storyboard:** 00:05 Already have a Word form or letter? Import it as a… → 00:21 Choose the fictional clinic discharge template. Open… → 00:33 Review the counts for paragraphs, tables and images. These… → 00:46 Read every conversion warning before applying the draft.… → 01:07 Open the editable draft and inspect the section tree. The… → 01:20 Switch to Pages to check the whole sheet and its margins.… → 01:34 Edit the heading in place to identify this as a discharge… → 01:50 Preview the actual PDF and compare each important area… → 02:02 Once the layout is right, bind replaceable patient and…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `word-to-report`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/word-to-report.mp4) · [captions](../../apps/designer/public/demo-videos/word-to-report.vtt) · [poster](../../apps/designer/public/demo-videos/word-to-report-poster.jpg)

### 34. Review a JasperReports folder migration (`jasper-folder-migration` · 2:24)

**Audience:** Report authors migrating existing files

**Goal:** Convert JRXML files to drafts, then inspect the migration.

**Storyboard:** 00:05 Bring a JasperReports project into Open Reports from its… → 00:25 Choose the small fictional receipt project. It contains a… → 00:36 Review the conversion rows before saving. Check which… → 00:49 Save the converted files as editable report drafts. The… → 01:10 Open the parent receipt and inspect its migration notes.… → 01:23 JRXML SQL is not executed during import, and Java or… → 01:39 Open Code to inspect the converted JSON definition. It is… → 01:58 Preview the converted receipt to confirm the parent and… → 02:12 Import the whole folder again when related sources change,…

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `jasper-folder-migration`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/jasper-folder-migration.mp4) · [captions](../../apps/designer/public/demo-videos/jasper-folder-migration.vtt) · [poster](../../apps/designer/public/demo-videos/jasper-folder-migration-poster.jpg)

### 35. Build and integrate an invoice report (`invoice-application-walkthrough` · 10:23)

**Audience:** Application developers and report authors

**Goal:** Create an invoice from a blank A4 page, save its JSON to a host application, render with file, object and trusted URL sources, apply client branding, then edit, host-save, reload and verify the resulting PDF.

**Chapters:** 00:27 The host application owns the invoice → 00:53 Start with an empty A4 report → 02:18 Create the repeating page header → 03:49 Build the repeating invoice table → 05:10 Check the actual PDF output → 05:37 Save the JSON in Acme Orders → 05:59 Render from the host application → 08:59 Embed the designer and save edits.

The walkthrough uses fictional data and a local Acme Orders fixture. It demonstrates that the host resolves its own report path, object or trusted URL and sends the JSON definition and authorized data to `POST /api/v1/render`. It shows PDF download and print handoff, but does not claim a physical printer was used.

**Editable source:** [`record.mjs`](../use-case-videos/record.mjs), demo ID `invoice-application-walkthrough`.

**Assets:** [MP4](../../apps/designer/public/demo-videos/invoice-application-walkthrough.mp4) · [captions](../../apps/designer/public/demo-videos/invoice-application-walkthrough.vtt) · [transcript](../../apps/designer/public/demo-videos/invoice-application-walkthrough.transcript.txt) · [chapters](../../apps/designer/public/demo-videos/invoice-application-walkthrough.chapters.md) · [poster](../../apps/designer/public/demo-videos/invoice-application-walkthrough-poster.jpg)
