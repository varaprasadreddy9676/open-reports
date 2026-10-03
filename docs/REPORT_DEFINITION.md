# Report definition reference

The authoritative, machine-readable description is the JSON Schema at `GET /api/v1/schema` (use it for editor autocomplete). This page is the human summary.

```jsonc
{
  "schemaVersion": "1.0",
  "id": "invoice", "name": "Invoice", "locale": "en-IN",
  "theme": { "currency": "INR", "fonts": { "body": "Noto Sans" } },
  "page": { "size": "A4", "orientation": "portrait", "unit": "mm", "margin": {"top":15,"right":15,"bottom":18,"left":15} },
  "parameters": [{ "id": "invoiceId", "type": "string", "required": true }],
  "datasets": [{ "id": "invoice", "source": "inline|json|rest|sql|plugin:<name>", "query": { } }],
  "variables": [{ "id": "total", "scope": "report", "expression": "sumProduct(data.invoice.items, \"quantity\", \"rate\")" }],
  "fragments": [{ "id": "letterhead", "children": [ ] }],
  "watermark": { "text": "CONFIDENTIAL", "opacity": 0.18, "pages": "all" },
  "print": { "printerType": "label", "language": "zpl", "dpi": 203, "safeMargin": 1.5 },
  "sections": [ { "type": "pageHeader", "appliesTo": "first", "children": [ ] }, { "type": "detail", "children": [ ] } ]
}
```
Units are **points** for component sizes (1 pt = 1/72 in) and `page.unit` for the page. Label-sheet sizes are in **mm**.

`watermark` stamps diagonal text on every page (PDF, HTML). Any component can set `bookmark: true` (use its own text) or a string, plus `bookmarkLevel` 1–4, to create PDF outline entries.

For ZPL labels, `print.calibration` can contain `{ "scaleX": 1.008, "scaleY": 1, "offsetXmm": 0.5, "offsetYmm": 0 }`. Scale factors multiply ZPL element positions and dimensions; offsets move the content in millimetres. The declared media width/length and the PDF output stay unchanged. The designer's **Print & labels → Calibrate ZPL printer** control downloads an uncorrected measurement box and derives scale from the measured length. A saved printer profile copies these values into reports when selected.

## Sections
`reportHeader`, `pageHeader`, `groupHeader`, `detail`, `groupFooter`, `pageFooter`, `reportFooter`, `background` (among other section types in the schema). Page headers, page footers, and backgrounds take `appliesTo`: `first | last | odd | even | standard | all`. The standard/all or unspecified band is the fallback. A variant can copy it and then edit its own `children`, dimensions, and `style` independently. A variant with empty `children` suppresses the fallback for that slot. Background bands are positioned behind page content; their section `style` (for example a fill) and child elements are rendered on the canvas and in the PDF. The report's page size, margins, and orientation remain global.

Bands also accept `hidden: true` to omit them from rendered output while keeping them in the designer's structure view. `locked: true` is a designer layout guard: it prevents moving, resizing, duplicating, or deleting a band; its visibility, name, and print rules can still be edited. Both flags default to false.

A band with no `height` hugs its content; `height` fixes the band's height in points. `layout: "flow"` stacks children, `"row"` places them side by side, `"grid"` uses `columns`, and `"absolute"` uses each child's coordinates. `gap`, `style.padding`, `alignItems`, and row `justifyContent` control the space between and around children. In a row, children without a width fill remaining space according to `grow`; text with `width: "auto"` hugs its measured longest line, while an explicit dimension fixes its width. `wrap: true` moves children onto additional lines when their preferred widths cannot fit together. A child's `shrink` weight allows its assigned width to decrease toward `minWidth` when a line is crowded. Text reflows within the assigned width.

## Expressions
Reference data as `data.<dataset>.<path>`, `params.x`, `vars.x`, `row.x` (inside tables/repeaters), `parent.x`, `page.number`, `page.total`, `report.name`. Operators: `+ - * / %`, comparison, `&& || !`, `a ? b : c`. Functions include `upper lower trim concat substring replace contains startsWith endsWith round ceil floor abs min max formatDate addDays difference now formatCurrency formatNumber formatPercent sum avg count first last sumBy avgBy minBy maxBy sumProduct`. Unknown names fail with a suggestion. No assignment, no statements, no arbitrary calls.

## Components
Common props: `id`, `name`, `width`, `height`, `x`/`y` (free position), `style`, `visibleWhen`, `hidden`, `locked`, `keepTogether`, `keepWithNext`, `pageBreakBefore/After`, `grow`, `gap`, `alignItems`, `justifyContent`, `minWidth/maxWidth/minHeight/maxHeight`. Spacing lives in `style.margin` / `style.padding`.

| Type | Key props |
|---|---|
| `text`, `richText`, `field` | `value` \| `binding` \| `expression`, `format` (`currency`, `date:dd MMM yyyy`, `number`, `percent`), `minLinesAtTop/Bottom`; auto-height flow text continues across pages unless `allowSplit: false` or `keepTogether: true` |
| `table` | `dataset`, `columns[{id, header, binding\|expression, width, align, format, footer:{aggregate}}]`, optional `headerRows[[{column, text, colSpan?, rowSpan?, align?}]]` for a complete multi-level header grid, optional `cellSpans[{row, column, colSpan?, rowSpan?}]` for body merges, `showHeader/Footer`, `repeatHeaderOnPageBreak`, `rowStyleWhen`, `emptyState`, `minRowsBeforeBreak/AfterBreak`, `filterWhen`, `sortBy` |
| `container`, `row`, `column`, `grid` | `children`, `layout` (`flow\|row\|grid\|absolute`), `columns` |
| `repeater`, `group` | `dataset`, `groupBy`, group header/footer |
| `image`, `qrcode`, `barcode`, `chart`, `line`, `rectangle`, `spacer`, `pageBreak` | `src`/`value`/`symbology`/`series` … |
| `labelSheet` | `columns`, `rows`, `labelWidth`, `labelHeight` (mm), `gapX`, `gapY`, `startPosition`, `dataset` \| `copies`, `outlines`, `children` = **one label** |
| `fragment` | `ref` to `fragments[]` (reusable blocks) |
| `custom` | `kind`, `props` — provided by a plugin |

### Text overflow and strict output

Auto-height text in a flow band continues onto later pages. A fixed `height` or `maxHeight` prevents that split. If the measured text exceeds the box, the designer shows `TEXT_EXCEEDS_HEIGHT` as an error and the render API returns HTTP 422 with the affected component in `error.details.warnings`. Set a larger height, remove the height, or choose `style.overflow: "clip"` or `"ellipsis"` when shortening is intentional. `ellipsis` fits one measured line; `clip` keeps the box height. Intentional shortening appears as the warning `TEXT_TRUNCATED_BY_POLICY` in analysis. Fixed-height containers whose descendants extend past the box raise `CONTAINER_CONTENT_EXCEEDS_HEIGHT`.

For `layout: "row"`, an item that extends beyond its row gets `ROW_CONTENT_EXCEEDS_WIDTH`. If it also passes the printable right edge, `CONTENT_EXCEEDS_PRINTABLE_WIDTH` replaces that warning and strict PDF/HTML rendering fails. The warning identifies the item; reduce fixed widths or gaps, or leave a child flexible. When an auto-height row is taller than a page, the paginator continues its direct text children in aligned page fragments, retaining a short non-text child beside the first fragment. Each continuation records a `row-split` explanation. Fixed-height and other unsplittable row content still raises `CONTENT_OVERFLOWS_PAGE` and blocks strict output.

The render API applies this strict check by default to inline renders, template renders and jobs. Existing callers that explicitly accept the risk can send `"strict": false`; the renderer still constrains fixed-height PDF text and reports warnings. `/api/v1/analyze` sets `valid: false` for data-loss warnings and returns the full warning list.

### Image sources

An image `src` can be an embedded PNG/JPEG/WebP data URL, a file path readable by the reporting server, a `file://` URL, or an HTTP(S) image URL. The designer's **Embed image from file** action stores a copy in the report. Entering a path or URL stores only that reference; the server reads it again on every render, so replacing the image at the same location updates later output without editing the report. A path on a designer user's computer works only if the reporting server can access that same path. Relative paths are relative to the server's working directory; `~/` uses the server user's home directory.

Linked files and URLs are limited to 5 MB and must contain PNG, JPEG, or WebP image bytes. Public URLs work by default. Private/internal URL hosts require `REPORT_IMAGE_ALLOWED_HOSTS`, a comma-separated list of permitted hostnames; when this is set, other URL hosts are rejected. Redirect targets are checked again. The preview endpoint requires the same API authentication as rendering.

## Datasets
- `inline`: `{ "data": [...] }`
- `json`: sandboxed file read.
- `rest`: `{ url, method, headers, query, body, resultPath }`; `{{params.x}}` and `{{secrets.NAME}}` are substituted; SSRF-guarded.
- `sql`: `{ connectionId, sql, params: ["{{params.id}}"] }` — parameterised; `connectionId` is registered by the server.
- Nested lists are addressed with a dotted dataset path, e.g. `"dataset": "invoice.items"`.

An optional dataset `schema` records field names and types for authoring when sample rows are empty or unavailable. For example: `"schema": { "kind": "array", "fields": [{ "path": "patient.name", "kind": "string" }, { "path": "amount", "kind": "number" }] }`. Paths are dot-separated; field kinds are `string`, `number`, `boolean`, `date`, `object`, or `array`. This metadata drives the designer's field tree, binding choices, and generated table/card fields. It does not fabricate runtime records or change source responses. Reports without it continue to infer fields from sample values.

The designer compares declared fields with a bounded preview sample and reports shape, missing-field, and type mismatches. Null values and empty nested lists are counted as unchecked. The comparison does not change source data or reject rendering; absence of warnings only covers the values actually checked.

See `examples/` for complete, working definitions of each feature.

Table merge coordinates are zero-based. Body `row` positions refer to resolved rows **after** filtering and sorting. The top-left cell supplies the merged value; covered values are suppressed and a warning is emitted when they differ. Vertical body merges move as a unit at page breaks; a merge taller than one printable page fails explicitly.

## Conditional appearance

Any component may use `styleWhen: [{ "when": "data.patient.flag == \"H\"", "style": { "color": "#b91c1c", "fontWeight": "bold" } }]`. A table may use `rowStyleWhen` with the same rule shape; its expressions can read `row.<field>` and style each matching row. Rules run in array order, with later matching styles overriding earlier values for the same property. The designer provides visual field/operator/value controls, a formula editor for complex expressions, and ordered rule controls. Invalid rule formulas are reported by validation at their rule path. These are appearance rules evaluated while resolving data; the broader conditional layout, pagination, output, and print rule model is not yet implemented.
