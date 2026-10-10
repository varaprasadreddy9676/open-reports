import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'apps/designer/package.json'));
const { chromium } = require('@playwright/test');
const videos = path.join(root, 'apps/designer/public/demo-videos');
const work = '/tmp/open-reports-training-posters';
const catalog = [
  ['open-reports-intro', 'Open Reports in one minute', 'Turn report data into a polished document, then preview and share it.', 59],
  ['sections-explained', 'Sections and bands explained', 'Learn what runs once, repeats on each page, groups records and prints for each row.', 48],
  ['data-sources', 'Connect data from JSON, CSV and REST', 'Test an API request, pass a report parameter and bind a returned field.', 60],
  ['formulas-conditions', 'Use formulas and conditions', 'Transform a value, format a date, and control element visibility with a rule.', 99],
  ['long-report-pagination', 'Keep long reports readable across pages', 'Inspect page breaks, repeat table headings, and choose first, normal, and last page masters.', 110],
  ['output-formats', 'Choose the right report output', 'Compare printable documents, structured data and printer-ready files.', 30],
  ['publish-review', 'Review and publish a report version', 'Run real checks, inspect the PDF and compare the next draft.', 105],
  ['interactive-viewer', 'Use the interactive report viewer', 'Drill into regional sales, open a linked order detail report, and explore the host-owned viewer.', 52],
  ['api-rendering', 'Render a report from your application API', 'Send host-owned report JSON and data; receive the actual PDF bytes.', 105],
  ['designer-embedding', 'Embed the designer in your application', 'Edit a host-owned report and save its JSON through the host callback.', 25],
  ['settings-security', 'Connect the designer and protect API keys', 'Test a reporting server and keep privileged API keys behind your host backend.', 80],
  ['reusable-blocks', 'Save and reuse report components', 'Save a shared brand element and choose how it follows future updates.', 80],
  ['async-render-jobs', 'Handle a long render as a background job', 'Queue a real report, poll job status, and collect its finished PDF.', 90],
  ['plugin-workflow', 'Extend the server with a trusted plugin', 'Inspect real plugin capabilities and render a report through a custom renderer.', 78],
  ['shared-header-subreport', 'Reuse a client header with a subreport', 'Choose one child report file and attach its branded header to parent reports.', 68],
  ['crosstab-workflow', 'Build a sales crosstab', 'Change a calculation and compare grouped totals.', 98],
  ['table-designer-workflow', 'Edit an invoice table', 'Resize columns, add a grouped heading and verify totals.', 85],
  ['table-merges-rules', 'Merge table cells and highlight rows', 'Merge repeated transaction dates and inspect a conditional low-balance style.', 90],
  ['grouped-report-workflow', 'Group records and calculate subtotals', 'Read nested department and doctor groups, inspect subtotal bands, and verify the report total.', 80],
  ['group-create-workflow', 'Create a group and add subtotals', 'Group fictional sales by region, label each group and calculate its revenue total.', 76],
  ['page-master-variants', 'Customize first, normal and last page bands', 'Give an account statement a distinct opening and final page footer, then review the real PDF.', 105],
  ['sticker-sheet-workflow', 'Print a sheet of address or inventory labels', 'Choose A4 label stock, set a starting position and check the alignment preview.', 76],
  ['supermarket-receipt', 'Build and print a long supermarket receipt', 'Inspect a 45-item thermal roll, compare PDF and ESC/POS, and download the printer bytes.', 105],
  ['barcode-label-zpl', 'Design a barcode label and export ZPL', 'Check a 50 × 30 mm label, its safe area and barcode, then download printer-ready ZPL.', 94],
  ['printer-profiles', 'Calibrate and reuse a printer profile', 'Calibrate ZPL output, save label stock and reuse it in another report.', 86],
  ['designer-tour', 'Find your way around the designer', 'A quick tour of Home, Design, Data, Code, Sections, Pages and Preview.', 53],
  ['first-report', 'Build your first report from data', 'Connect sample data, add a table and formula, then preview the PDF.', 55],
  ['layout-precision', 'Set up a page and place elements precisely', 'Choose A4, A5 or A6 and orientation, then align and resize on the canvas.', 53],
  ['client-letterhead', 'Customize a client letterhead and footer', 'Replace logo sources, update organization details, and compare a pre-printed page.', 23],
  ['invoice-to-pdf', 'Create an invoice and preview the PDF', 'Edit a working invoice and inspect the printable result.', 27],
  ['invoice-application-walkthrough', 'From a blank page to Print: integrate an invoice report', 'Build the invoice, render it in a host app, switch client branding, and save edits through the embedded designer.', 540],
  ['hospital-letterhead', 'Build a hospital letterhead with logos', 'Arrange separate left and right logos or use pre-printed stationery.', 55],
  ['sales-crosstab', 'Summarize sales with a crosstab', 'Compare regions and services with grouped totals.', 27],
  ['word-to-report', 'Turn a Word template into an editable report', 'Review DOCX counts and warnings, edit the draft, and compare its PDF.', 19],
  ['jasper-folder-migration', 'Review a JasperReports folder migration', 'Convert JRXML into JSON drafts, inspect notes and preview the result.', 32],
];

const requested = process.argv.slice(2);
const selected = requested.length ? catalog.filter(([id]) => requested.includes(id)) : catalog;
if (selected.length !== (requested.length || catalog.length)) throw new Error(`Unknown ID. Choose: ${catalog.map(([id]) => id).join(', ')}`);
await mkdir(work, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 }, deviceScaleFactor: 1 });
  for (const [id, title, description, second] of selected) {
    const frame = path.join(work, `${id}.jpg`);
    const videoPath = path.join(videos, `${id}.mp4`);
    const metadata = JSON.parse((await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', videoPath])).stdout);
    const duration = Number(metadata.format?.duration);
    if (!Number.isFinite(duration) || duration <= 2) throw new Error(`Cannot select a poster frame: ${id} has no readable video duration.`);
    const posterTime = Math.min(second, duration - 2);
    if (posterTime !== second) console.warn(`Poster time for ${id} was clamped to ${posterTime.toFixed(1)}s (video is ${duration.toFixed(1)}s).`);
    await run('ffmpeg', ['-y', '-ss', posterTime.toFixed(1), '-i', videoPath, '-frames:v', '1', '-vf', 'scale=800:450:force_original_aspect_ratio=increase,crop=800:450', frame]);
    const image = (await readFile(frame)).toString('base64');
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      *{box-sizing:border-box}html,body{margin:0;width:800px;height:450px;overflow:hidden;background:#10213b;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .cover{position:relative;width:800px;height:450px;overflow:hidden;color:white;background:#10213b}
      .cover img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:brightness(.88) saturate(.9)}
      .cover:before{content:"";position:absolute;z-index:1;inset:0;background:linear-gradient(180deg,rgba(10,22,39,.28),transparent 32%,rgba(8,20,38,.12) 56%,rgba(8,20,38,.94) 100%)}
      .cover:after{content:"";position:absolute;z-index:1;left:0;bottom:0;width:7px;height:166px;background:#69a5ff}
      .brand{position:absolute;z-index:2;left:30px;top:26px;display:flex;align-items:center;gap:10px;font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;text-shadow:0 1px 8px #10213b}
      .mark{display:grid;place-items:center;width:27px;height:27px;border:1px solid #a8caff;border-radius:8px;background:#152e50d9;color:#d8e8ff;font-size:12px;letter-spacing:0}
      .copy{position:absolute;z-index:2;left:34px;right:34px;bottom:27px}
      h1{max-width:720px;margin:0 0 8px;font-size:30px;line-height:1.08;letter-spacing:-.025em;text-shadow:0 2px 12px #07152a}
      p{max-width:700px;margin:0;color:#dce8f7;font-size:16px;line-height:1.4;text-shadow:0 1px 8px #07152a}
    </style><div class="cover"><img id="frame"><div class="brand"><span class="mark">OR</span>Open Reports · Training</div><div class="copy"><h1 id="title"></h1><p id="description"></p></div></div>`);
    await page.evaluate(({ imageData, heading, summary }) => {
      (document.querySelector('#frame')).src = `data:image/jpeg;base64,${imageData}`;
      document.querySelector('#title').textContent = heading;
      document.querySelector('#description').textContent = summary;
    }, { imageData: image, heading: title, summary: description });
    await page.locator('#frame').evaluate((img) => (img).decode());
    await page.screenshot({ path: path.join(videos, `${id}-poster.jpg`), type: 'jpeg', quality: 91 });
    console.log(`POSTER ${id}`);
  }
  await page.close();
} finally {
  await browser.close();
}
