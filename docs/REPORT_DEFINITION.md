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

## Sections
`reportHeader`, `pageHeader`, `groupHeader`, `detail`, `groupFooter`, `pageFooter`, `reportFooter`. Headers/footers take `appliesTo`: `first | last | odd | even | standard | all` (page masters).

Bands also accept `hidden: true` to omit them from rendered output while keeping them in the designer's structure view. `locked: true` is a designer layout guard: it prevents moving, resizing, duplicating, or deleting a band; its visibility, name, and print rules can still be edited. Both flags default to false.

## Expressions
Reference data as `data.<dataset>.<path>`, `params.x`, `vars.x`, `row.x` (inside tables/repeaters), `parent.x`, `page.number`, `page.total`, `report.name`. Operators: `+ - * / %`, comparison, `&& || !`, `a ? b : c`. Functions include `upper lower trim concat substring replace contains startsWith endsWith round ceil floor abs min max formatDate addDays difference now formatCurrency formatNumber formatPercent sum avg count first last sumBy avgBy minBy maxBy sumProduct`. Unknown names fail with a suggestion. No assignment, no statements, no arbitrary calls.

## Components
Common props: `id`, `name`, `width`, `height`, `x`/`y` (free position), `style`, `visibleWhen`, `hidden`, `locked`, `keepTogether`, `keepWithNext`, `pageBreakBefore/After`, `grow`, `gap`, `alignItems`, `justifyContent`, `minWidth/maxWidth/minHeight/maxHeight`. Spacing lives in `style.margin` / `style.padding`.

| Type | Key props |
|---|---|
| `text`, `richText`, `field` | `value` \| `binding` \| `expression`, `format` (`currency`, `date:dd MMM yyyy`, `number`, `percent`), `minLinesAtTop/Bottom` |
| `table` | `dataset`, `columns[{id, header, binding\|expression, width, align, format, footer:{aggregate}}]`, optional `headerRows[[{column, text, colSpan?, rowSpan?, align?}]]` for a complete multi-level header grid, optional `cellSpans[{row, column, colSpan?, rowSpan?}]` for body merges, `showHeader/Footer`, `repeatHeaderOnPageBreak`, `rowStyleWhen`, `emptyState`, `minRowsBeforeBreak/AfterBreak`, `filterWhen`, `sortBy` |
| `container`, `row`, `column`, `grid` | `children`, `layout` (`flow\|row\|grid\|absolute`), `columns` |
| `repeater`, `group` | `dataset`, `groupBy`, group header/footer |
| `image`, `qrcode`, `barcode`, `chart`, `line`, `rectangle`, `spacer`, `pageBreak` | `src`/`value`/`symbology`/`series` … |
| `labelSheet` | `columns`, `rows`, `labelWidth`, `labelHeight` (mm), `gapX`, `gapY`, `startPosition`, `dataset` \| `copies`, `outlines`, `children` = **one label** |
| `fragment` | `ref` to `fragments[]` (reusable blocks) |
| `custom` | `kind`, `props` — provided by a plugin |

## Datasets
- `inline`: `{ "data": [...] }`
- `json`: sandboxed file read.
- `rest`: `{ url, method, headers, query, body, resultPath }`; `{{params.x}}` and `{{secrets.NAME}}` are substituted; SSRF-guarded.
- `sql`: `{ connectionId, sql, params: ["{{params.id}}"] }` — parameterised; `connectionId` is registered by the server.
- Nested lists are addressed with a dotted dataset path, e.g. `"dataset": "invoice.items"`.

See `examples/` for complete, working definitions of each feature.

Table merge coordinates are zero-based. Body `row` positions refer to resolved rows **after** filtering and sorting. The top-left cell supplies the merged value; covered values are suppressed and a warning is emitted when they differ. Vertical body merges move as a unit at page breaks; a merge taller than one printable page fails explicitly.
