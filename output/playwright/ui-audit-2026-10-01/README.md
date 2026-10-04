# Open Reports UI audit capture set

Captured 2026-10-01 from the locally built app at `http://localhost:4000/`.

The set contains 39 viewport screenshots. `01` and `02` use the browser CLI's initial 1280×720 viewport; `03`–`37` use 1600×1000; `38` and `39` use 390×844. Images show the actual browser UI at each interaction step. The report used for the workspace screenshots is the bundled Invoice starter with its sample data. The API uses a temporary SQLite database at `/tmp/open-reports-ui-audit.sqlite`; the saved/published Invoice exists only in that temporary local database.

## Screenshots

| # | File | Screen / feature |
|---|---|---|
| 01 | `01-new-report-starters.png` | New report starter gallery and category browsing |
| 02 | `02-design-invoice.png` | Invoice canvas at the initial viewport and zoom |
| 03 | `03-design-invoice-fit-width.png` | Invoice canvas fit-to-width at desktop size |
| 04 | `04-design-layers.png` | Design mode with layer tree |
| 05 | `05-design-data-panel.png` | Design mode data field browser |
| 06 | `06-design-page-panel.png` | Design mode page navigation panel |
| 07 | `07-properties-headers-footers.png` | Report properties: page masters, headers, and footers |
| 08 | `08-properties-print-labels.png` | Print profile and label settings |
| 09 | `09-properties-locale-theme.png` | Locale, currency, and theme settings |
| 10 | `10-bottom-problems.png` | Problems panel |
| 11 | `11-bottom-pagination.png` | Pagination decision panel |
| 12 | `12-bottom-history.png` | Edit history panel |
| 13 | `13-data-mode.png` | Data mode and dataset selection |
| 14 | `14-code-editor.png` | JSON code editor |
| 15 | `15-preview-pdf.png` | PDF preview |
| 16 | `16-preview-html.png` | HTML preview |
| 17 | `17-preview-xlsx.png` | XLSX preview |
| 18 | `18-preview-csv.png` | CSV preview |
| 19 | `19-preview-zpl.png` | ZPL preview |
| 20 | `20-view-options-menu.png` | View controls: grid, rulers, guides, margins, diagnostics, sample rows, snapping |
| 21 | `21-export-options-menu.png` | Export formats and report-definition export |
| 22 | `22-ai-assistant.png` | AI editing bar |
| 23 | `23-ai-settings.png` | AI provider/model/key settings (key left blank) |
| 24 | `24-command-palette.png` | Command palette |
| 25 | `25-more-menu.png` | More menu: new/open/duplicate/compare/settings/delete |
| 26 | `26-saved-template-state.png` | Saved template state |
| 27 | `27-open-saved-reports.png` | Open saved reports dialog |
| 28 | `28-published-template.png` | Published template state |
| 29 | `29-server-settings.png` | API base URL and server connection settings |
| 30 | `30-dataset-editor-inline.png` | Existing inline dataset editor and inferred schema |
| 31 | `31-new-dataset-json.png` | New JSON dataset setup |
| 32 | `32-new-dataset-rest.png` | New REST dataset setup |
| 33 | `33-new-dataset-sql.png` | New SQL dataset setup |
| 34 | `34-new-dataset-csv.png` | New CSV dataset setup |
| 35 | `35-table-properties.png` | Selected table properties, pagination and row options |
| 36 | `36-design-code-split.png` | Split design and code view |
| 37 | `37-generate-from-json.png` | Generate a report from sample JSON |
| 38 | `38-mobile-390x844.png` | New report gallery at mobile width |
| 39 | `39-mobile-designer-390x844.png` | Invoice designer at mobile width |

## Capture notes

- The application was served from the server's bundled designer build; the clinic-pack example plugin loaded successfully.
- Browser console: zero errors and zero warnings. It emitted two browser-level verbose notices that the password field is not inside a form.
- The design canvas screenshot at 1280×720 and the mobile screenshots are included for responsive/layout review; they are not cropped or post-processed.
- This is a first-pass screen inventory, not the UX audit itself. Interactions requiring external credentials or live backend resources were not submitted; the AI provider key and database/REST connections remain blank.
