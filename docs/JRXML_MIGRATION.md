# JRXML migration pilot

## Objective and source

Import JasperReports source `.jrxml` into editable Open Reports definitions, with an explicit status for every encountered feature. A parsed XML file is not yet a migrated report. Rendering and pagination parity require the same data and Jasper-generated baseline PDF.

The feature inventory below is from `cloud-medics-implproj`, branch `medics_cloud`, commit `521b40cb67742092fab06264a1a2009a35143bbc`. The full receipt comparison uses the same branch at commit `ae0050d9c4853eef252f35149f96f4c800ec0b72`, from `reports-src/GHH/Receipt.jrxml` and `HospitalNameSubReport.jrxml`. The source repository stays outside this repository. Only a synthetic fixture and its generated PDFs are retained here; source JRXML, SQL, logos, credentials, and patient documents are not copied.

## Source inventory (2026-10-04)

The source tree contains 11,153 `.jrxml` files: 8,836 under `reports-src`, 2,261 under `Jaspers-rpt`, and 56 under `product`. Ten pilot files were inspected across OP bill, IP bill, receipt, discharge summary, laboratory result, radiology result, hospital header, and receipt subreport. The broader scan covers **975 files** in `Jaspers-rpt/{PRODUCT,STANDARD,AAH,BKG}` and `reports-src/{PRODUCT,GGIRHR}`. This is about 8.7% of the portfolio; it establishes implementation priorities, not a portfolio-wide conversion rate.

Of those 975, 973 are JasperReports 6 style XML. Two older AssetLabel reports use a DTD and are rejected by the safe parser. No JasperReports 7 style source appeared in this sample, so v7 support is tested with a fixture and a published JasperReports sample. The current importer produces schema-valid drafts for the 973 non-DTD files; one receipt-detail template has now had a synthetic-data PDF comparison, described below. This does not establish parity for the other drafts. Per-feature status counts overlap, so they are not a percentage of reports converted.

An additional published JasperReports 7 `TableReport.jrxml` sample from the JasperReports repository was imported separately. Its title text and literal image import; its nested table is a visible unsupported placeholder. This validates the modern XML shape for the first import slice, not full v7 report parity.

| Feature | Observed in pilot | Migration implication |
| --- | --- | --- |
| Fixed page and band geometry | All ten | Preserve page/band/element dimensions and manually compare PDF output. |
| Text and field expressions | All ten | Direct field/parameter references can convert; Java expressions need review. |
| SQL queries | Most of the ten | Map fields, but do not activate SQL or copy connection credentials. Rebind datasets. |
| Group bands | Bills and lab result | Convert grouping only where the expression is safe and the engine has equivalent behavior. |
| Subreports | Bills, receipt, discharge, lab | The engine and Designer can render reusable child definitions. JRXML folder import links unambiguous child `.jrxml` files; standalone Designer insertion selects an Open Reports `.json` definition. Rebind child datasets and parameters explicitly, then compare the output. |
| Images | Lab, radiology, hospital header | Many use Base64-decoding Java expressions. Convert only direct image path/URL parameters; flag encoded expressions. |
| Conditional visibility | Bills and lab | Translate safe expressions, report the rest. |
| Variables and totals | Bills, receipt, lab | Jasper aggregate/reset semantics require dedicated mapping and parity checks. |
| Column header/footer bands | Common | Page and column headers now stack for a single-column import; multi-column and footer semantics need further work. |

## Gaps found in the 975-file scan

Counts below are occurrences in the sample, not distinct reports. They are the feature inventory and the current Open Reports behavior as of this pilot.

| Priority | JRXML feature | Occurrences | Current import / engine gap | Suggested direction |
| --- | --- | ---: | --- | --- |
| P0 | Float, relative stretch, bottom positioning | 23,232 `Float`; 1,922 tallest-object stretch; 1,274 band-height stretch; 560 bottom-fixed | Coordinates import, but Jasper's movement/stretch/overflow rules are not equivalent. 2,936 elements also print on detail overflow. | Implement/test explicit stretch and anchoring semantics in the layout engine using bill/lab baselines. |
| P0 | Jasper variables and totals | 3,803 variables, including 3,179 `Sum` and 174 `Count` | Simple row-based `Sum`/`Count` definitions now map to running variables with optional group reset, marked `needs-review`. Other calculations and deferred values remain visible review text. | Check numeric/null semantics, implement remaining reset and late-evaluation behavior before parity claims. |
| P0 | Text/visibility expressions | 20,394 text fields; 4,190 print conditions; 4,940 text expressions and 1,956 conditions need review in current import | Safe field/parameter/operator expressions convert. Java methods, constructors, unknown variables, and complex conditions remain review items. | Add a limited explicit translation catalog for common safe idioms; keep arbitrary Java/Groovy out. |
| P0 | Subreports | 771 | Literal child names with safe parameter expressions import as editable links. Folder import links uniquely matched child JRXML files. The render API accepts child JRXML or imported JSON definitions with explicit data; nested child page headers, page footers, and backgrounds are scoped to the child frame. Missing/complex children remain visible review items. Full source-report parity still depends on data rebinding, expression coverage, and PDF comparison. | Keep source/data rebinding explicit; cover real bill and receipt templates with same-input PDF comparisons. |
| P0 | SQL-backed data | 906 nonempty SQL queries in sample | SQL is not activated or copied. Field metadata imports into an empty inline dataset. | Rebind via an approved Open Reports connection and parameter contract; compare with identical extracted data. |
| P1 | Repeating column bands and pagination | 905 column headers; 686 column footers; 74 last-page footers; 44 floating footer settings | Single-column page and column headers now stack in one repeated master; footers still map approximately to page bands. | Add native column-band rules and first/last/overflow page behavior. |
| P1 | Number/date format patterns | 13,853 text field patterns; 2,829 remain unmatched by current pattern mapper | Simple fixed-decimal and supported date patterns convert; other Jasper patterns use default formatting and a review issue. | Map common `DecimalFormat`/`SimpleDateFormat` forms with locale/timezone tests. |
| P1 | Linked and encoded images | 309 images: 154 path concatenations, 80 Java Base64 decodes, 23 direct parameters | Direct path/URL and parameter bindings convert; other expressions become visible review placeholders. | Support a safe path-template binding and deliberate Base64 parameter-to-data-URL conversion without running Java. |
| P1 | HTML text, deferred evaluation, null/blank behavior | 235 HTML markup, 332 deferred evaluations, 7,725 stretch-with-overflow fields | Marked for review; rendering/measurement can differ. | Validate rich text and evaluation phase against real PDFs. |
| P1 | PDF fonts and per-side borders | 23,195 PDF font names, 24,060 PDF encodings, 28,114 boxes with side pens | Standard PDF base-14 faces now import from `pdfFontName`; custom embedded fonts, encodings, metrics, and line joins can still differ. | Add custom font asset support and compare line wrapping and print geometry. |
| P2 | Tables, lists, barcodes, frames, breaks | 7 table components, 6 lists, 40 Barbecue barcodes, 15 frames, 13 breaks | Frames/children and breaks import approximately; other components remain visible placeholders. | Convert common table/list/barcode shapes after P0 report families. |
| P2 | Legacy DTD JRXML | 2 files | Rejected by the safe parser. | Add a tightly scoped DTD-stripping migration for known external Jasper DTDs if these reports are needed. |

No crosstab or chart component was found in this 975-file sample. That does not establish absence in the remaining 10,178 files.

For the 771 subreport uses, 573 legacy quoted compiled-name references have a matching `.jrxml` source in the same directory, 76 have a matching JRXML elsewhere in the repository, 112 have no literal filename to resolve statically, and 10 named references have no matching JRXML source in the repository. The importer reads the legacy name only to infer the child `.jrxml` filename. It never opens or executes a compiled report. Dynamic names and genuinely missing JRXML sources need explicit review.

Of those 771 uses, 734 pass a Jasper database connection, 31 pass a data-source expression, and 6 declare neither. This is why linking child layouts alone cannot migrate most bills: each connection-backed child needs an Open Reports dataset binding and its parameter contract. The import issue records the inferred `.jrxml` source name, source mode, and parameter count. A linked child renders only when its JRXML-derived definition and data are supplied; otherwise the renderer shows a placeholder and the strict API returns an error.

For a concrete full-bill readiness check, `Jaspers-rpt/PRODUCT/BillWithoutDiscount.jrxml` imports as a schema-valid editable draft with 156 converted, 237 needs-review, and 2 unsupported feature diagnostics. Its two nested links resolve to `HospitalNameSubReport.jrxml` and `PaymentModeDetails.jrxml`; the latter binds to the parent `PAYMENT_DETAIL_SUBREPORT` parameter. Both unsupported items are Jasper variable calculations/resets. This bill is **not** a PDF parity pass: the hospital header needs separately supplied child data, and its outstanding expressions and variable semantics require review.

For programmatic rendering, `POST /api/v1/render` accepts `subreports: { childName: { jrxml: childSource, data?: { datasetId: rows } } }` alongside the imported parent definition. An already imported child definition may be passed as `report` in place of `jrxml`. A child with one dataset may use the parent's `row.*` or `params.*` array through the imported `dataset` binding. Child saved queries and compiled report artifacts are not run. Nested child page headers repeat on pages occupied by the child; child page footers and backgrounds are also rendered in that child's page frame. The Designer's Subreport property accepts an Open Reports `.json` definition, attaches it to the parent JSON, and sends it for preview/export. JRXML folder import links uniquely matched child source files; ambiguous/missing children remain in the review list.

This implementation is not full Jasper parity. SQL/data-source connection behavior is never copied or run. The host must supply the child data and parameters, and source features that import as `needs-review` or `unsupported` must be corrected before the migrated definition is trusted.

The inventory command is `python3 scripts/jrxml-inventory.py /path/to/jrxml/files`. It reads a local corpus and emits feature counts only. It does not copy source report contents.

## Receipt PDF pilot (synthetic input)

The first PDF comparison uses `Jaspers-rpt/PRODUCT/ReceiptSubReport.jrxml` from the private source repository. It is a receipt-detail subreport with no nested subreport. Its SQL is bypassed in both engines; each receives the same synthetic rows and parameter values from [receipt-3.json](../scripts/fixtures/jrxml/receipt-3.json) and [receipt-20.json](../scripts/fixtures/jrxml/receipt-20.json). No patient data is included.

JasperReports 6.20.5 and Open Reports both generated a 288 x 288 pt PDF. For three rows, both yielded one page with the same 17 extracted words in order and the same 225.75 total. For 20 rows, both yielded two pages, broke after row 14, repeated the page and column headings, and printed the same 252.50 total. All 48 words on page 1 and 26 on page 2 matched in order. Before explicit font mapping, the maximum word-origin difference was 4.65 pt, concentrated in centered/right-aligned labels whose font widths differed.

The remaining horizontal offset was font-driven: the JRXML requests `Arial` without an explicit `pdfFontName`, while Jasper's PDF uses Helvetica metrics for this sample. The importer marks logical fonts without an explicit PDF face as `needs-review` so this substitution is visible during migration. After mapping all four Arial styles to the baseline's Helvetica face, both outputs still have two 288 x 288 pt pages and identical extracted words in order. Median word-origin shifts are 0.04 pt on both pages; maximum shifts are 0.18 pt on page 1 and 1.44 pt on page 2. At 96 dpi, 0.331% and 0.365% of page 1 and 2 pixels respectively differ at any RGB level. This is a strong geometry match for this synthetic receipt, not a claim of pixel-perfect parity or a guarantee that other Jasper installations resolve Arial the same way.

The importer accepts exact PDF-face overrides for these cases. For this comparison, every declared Arial style resolved to Helvetica in the Jasper baseline, so the same mapping was passed during import:

```ts
const imported = importJrxml(jrxmlSource, {
  fontMappings: { Arial: {
    regular: "Helvetica", bold: "Helvetica",
    italic: "Helvetica", boldItalic: "Helvetica",
  } },
});
```

Variants are `regular`, `bold`, `italic`, and `boldItalic`; mapping keys are matched case-insensitively. A mapped face is stored as a PDF-only style override, so the source bold/italic styling remains available to HTML and DOCX renderers. Folder imports accept the same `fontMappings` option. Values may name a PDF base-14 face or an exact family registered with the PDF renderer. Explicit mappings override a source `pdfFontName`; otherwise that JRXML face is preserved as the exact PDF face.

The comparison required fixes to report-footer running variables, unpadded `d/M/yyyy` dates, stacking page and column headers, absolute positioning inside page masters, and individual border pens. It does not exercise a full bill, real data, SQL binding, nested subreports, dynamic logos, or multi-column output.

For a local repeat, use [ReceiptBaseline.java](../scripts/jrxml-parity/ReceiptBaseline.java) with its [Maven dependencies](../scripts/jrxml-parity/pom.xml) to compile/fill the JRXML using `JRMapCollectionDataSource`; import the same JRXML in Open Reports and render with the `rows` as `data.main`. Then run `python3 scripts/jrxml-parity-compare.py jasper.pdf open-reports.pdf`. This comparator reports page count, size, word order, and word-position deltas without printing source text. Visual inspection of the two rendered PDF pages is still required.

## Import contract

- Accept well-formed JasperReports 6 and 7 source XML; reject DTDs, oversized documents, malformed XML, and non-JRXML roots.
- Designer's **Import JRXML → Folder** reads the selected folder locally, converts every `.jrxml`, links uniquely matched child sources, and saves each valid result as a separate draft JSON template. Invalid files and ambiguous or missing children appear in the folder review. Existing templates are not replaced. A saved parent still needs child data bindings and PDF comparison before production use.
- Folder conversion runs in a browser worker with live file counts, an ETA derived from observed throughput, and cancellation. Draft saving shows separate progress; stopping it keeps already saved drafts and allows retry. The review list can search and page through all files, with failures first.
- Produce an editable report and a per-feature issue list with `converted`, `needs-review`, or `unsupported` status, source location, and target component where applicable.
- Preserve geometry in point units. Convert basic bands, static text, simple fields, shapes, and direct images. Flag unsupported/approximate behavior at the exact source node.
- Never evaluate Java/Groovy or automatically run imported SQL. Unsupported visual elements need visible Designer placeholders so they cannot disappear unnoticed.
- Keep image sources as a literal path/URL or a parameter binding. Embedded assets remain a deliberate user choice.
- Review the issue list before replacing the open Designer document. Keep issues accessible after import.

## Verification gates

1. Schema validation and importer tests on JasperReports 6 and 7 fixtures.
2. Pilot import of real source files with counts of converted, review, and unsupported features.
3. Manual correction of highest-impact engine gaps, including nested page-footer/background behavior and aggregate/group behavior.
4. Jasper and Open Reports PDF renders with the same dataset and parameters; compare page count, text, images, layout, and breaks. Record every remaining difference.

The receipt-detail pilot and the full synthetic Medics receipt below have reached a comparative render. Neither uses live data or runs Jasper SQL, and the full receipt does **not** pass visual or content parity. The result identifies concrete remaining importer/layout work; it does not support a portfolio-wide parity or production-readiness claim.

## Full receipt comparison (synthetic input, 2026-10-07)

The comparison uses `reports-src/GHH/Receipt.jrxml` and its `HospitalNameSubReport.jrxml` child from the source snapshot above. Both engines receive the same one-row synthetic receipt and one synthetic hospital-header row. JasperReports 6.20.5 fills the report with `JRMapCollectionDataSource`; a local one-off harness removes the SQL queries and rebinds the connection-based hospital subreport to that synthetic row. Open Reports imports the original JRXML and receives the same rows and parameters. No database connection or patient data is used, and the temporary synthetic fixture was not retained in the project.

The initial baseline PDFs were one page with the same 1008 × 756 pt page size, but their extracted word sequences and visual layout differed. The initial Open Reports run showed a logo-expression placeholder, unsupported receipt-date and total expressions, extra field outlines, and five `TEXT_EXCEEDS_HEIGHT` warnings. These were the pre-fix results.

Follow-up importer/runtime work seeds report and page bands from the first row of the primary dataset, translates the common literal `SimpleDateFormat(...).format($F/$P/$V{...})` idiom, strips only safe `Double(...doubleValue())` wrappers, maps Jasper `Nothing` variables to current-row expressions, and preserves common numeric patterns such as `###0.00`. The `dueAmt` pattern can refer to an earlier aggregate and parameters. The five overflow warnings were false positives from blank 7 pt separator elements with 14 pt fonts; the paginator now ignores empty text for overflow checks. PDF border rendering now respects each imported side, removing the unintended full outlines.

The synthetic PDFs were rerendered after these fixes with one receipt row and one hospital-header row. Both render as one portrait page at 756 × 1008 pt, with the same 14 pt margins and content geometry. At 96 dpi both rasterize to 1008 × 1344 pixels. Jasper stores a 1008 × 756 pt media box with `/Rotate 90`; Open Reports stores a 756 × 1008 pt media box with no rotation. The importer now preserves the declared `pageWidth`/`pageHeight` when Jasper's `orientation` conflicts, and records that conflict for review. Receipt date, amounts, totals, and all extracted values match; Open Reports reports no layout warnings. The JRXML `pdfFontName` is honored, so both outputs use Times-Roman and Helvetica faces for the corresponding elements. A PDF-only baseline correction based on the source font size reduced the thresholded pixel difference from 2.71% to 1.55% (96 dpi, RGB channel difference >20). Across 89 text words matched by value, the median absolute vertical origin difference is 0.004 pt and the 95th percentile is 1.266 pt; horizontal font metrics still differ (median 0.12 pt, 95th percentile 3.326 pt). Text extraction order for the cashier colon also differs. The child image expression safely imports as a parameter path; the temporary comparison normalized the synthetic logo to a data URL because the direct PDF renderer expects the server to resolve linked paths first. **The effective printed page setup now matches for this sample, but its raw PDF box/rotation metadata and some glyph positions are still different. This does not verify real hospital branding or server-side linked-image resolution.** The current import summary is 104 converted, 79 needs-review, and 0 unsupported for the parent; the child is 43 converted, 11 needs-review, and 0 unsupported.

The source logo was replaced with a synthetic transparent image for this comparison; no private image asset was used.

This was a one-off local comparison against a private source repository. Its harness and generated PDFs are not checked into this project. The general PDF comparator remains available for future sanitized pilots.

Remaining migration gaps demonstrated by this post-fix receipt comparison:

1. Verify dynamic logo path resolution through the reporting server with an accessible local, server, or public image URL.
2. Compare and refine font metrics and small positioning differences against a sanitized branded source asset; decide whether to preserve Jasper's raw `/Rotate` PDF metadata in addition to the matching effective page setup.
3. Add a synthetic repeated-page receipt/bill parity fixture. This single-page fixture does not verify multi-page pagination or real logo assets.
