import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'apps/designer/package.json'));
const { chromium } = require('@playwright/test');
const run = promisify(execFile);
const assets = path.join(root, 'apps/designer/public/demo-videos/letterhead-assets');
const examples = path.join(root, 'examples');
const assetBase = (process.env.LETTERHEAD_ASSET_BASE ?? 'https://open-reports-demo.onrender.com/demo-videos/letterhead-assets').replace(/\/$/, '');
await mkdir(assets, { recursive: true });

const [primaryPng, sealPng] = await Promise.all([
  readFile(path.join(root, 'marketing/use-case-videos/assets/northstar-primary-logo.png')),
  readFile(path.join(root, 'marketing/use-case-videos/assets/northstar-accreditation-mark.png')),
]);
const primaryName = 'northstar-primary-logo.png';
const sealName = 'northstar-accreditation-mark.png';
const paperName = 'northstar-preprinted-letterhead.png';
await Promise.all([
  copyFile(path.join(root, 'marketing/use-case-videos/assets', primaryName), path.join(assets, primaryName)),
  copyFile(path.join(root, 'marketing/use-case-videos/assets', sealName), path.join(assets, sealName)),
]);
await Promise.all([primaryName, sealName].map((name) => run('sips', ['-Z', '384', path.join(assets, name)])));
const primary = `${assetBase}/${primaryName}`;
const seal = `${assetBase}/${sealName}`;
const paper = `${assetBase}/${paperName}`;
const primaryData = `data:image/png;base64,${primaryPng.toString('base64')}`;
const sealData = `data:image/png;base64,${sealPng.toString('base64')}`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2480" height="3508" viewBox="0 0 2480 3508">
<rect width="2480" height="3508" fill="#fff"/>
<rect width="2480" height="20" fill="#143753"/><rect y="20" width="2480" height="7" fill="#cba45d"/>
<image href="${primaryData}" x="140" y="92" width="285" height="285" preserveAspectRatio="xMidYMid meet"/>
<text x="470" y="184" fill="#143753" font-family="Arial,sans-serif" font-weight="700" font-size="54" letter-spacing="1">NORTHSTAR MEDICAL CENTER</text>
<text x="473" y="239" fill="#167c80" font-family="Arial,sans-serif" font-weight="600" font-size="22" letter-spacing="3">CARE WITH CLARITY · COMPASSION IN EVERY STEP</text>
<text x="473" y="302" fill="#526575" font-family="Arial,sans-serif" font-size="24">123 Meridian Avenue · Bengaluru 560001</text>
<text x="473" y="341" fill="#526575" font-family="Arial,sans-serif" font-size="22">+91 80 4567 8900 · care@northstar.example · northstar.example</text>
<image href="${sealData}" x="2070" y="97" width="265" height="265" preserveAspectRatio="xMidYMid meet"/>
<rect x="140" y="413" width="2200" height="4" rx="2" fill="#143753"/><rect x="140" y="421" width="380" height="5" rx="2.5" fill="#167c80"/>
<text x="141" y="490" fill="#143753" font-family="Arial,sans-serif" font-weight="700" font-size="22" letter-spacing="3">DISCHARGE SUMMARY</text>
<rect x="140" y="3252" width="2200" height="5" rx="2.5" fill="#167c80"/><rect x="1900" y="3260" width="440" height="4" rx="2" fill="#cba45d"/>
<text x="140" y="3331" fill="#143753" font-family="Arial,sans-serif" font-weight="700" font-size="23">NORTHSTAR MEDICAL CENTER</text>
<text x="140" y="3374" fill="#526575" font-family="Arial,sans-serif" font-size="19">123 Meridian Avenue · Bengaluru 560001 · +91 80 4567 8900</text>
<text x="2340" y="3331" text-anchor="end" fill="#526575" font-family="Arial,sans-serif" font-size="19">care@northstar.example</text>
<text x="2340" y="3374" text-anchor="end" fill="#526575" font-family="Arial,sans-serif" font-size="19">northstar.example</text>
</svg>`;

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 2 });
  await page.setContent(`<style>html,body{margin:0;width:1240px;height:1754px;overflow:hidden}svg{width:1240px;height:1754px;display:block}</style>${svg}`);
  await page.screenshot({ path: path.join(assets, paperName), fullPage: true, scale: 'device' });
} finally { await browser.close(); }

const base = JSON.parse(await readFile(path.join(examples, 'discharge-summary.report.json'), 'utf8'));
const editable = structuredClone(base);
editable.id = 'hospital-letterhead';
editable.name = 'Hospital Letterhead · Editable Logos';
editable.description = 'A fictional discharge summary with separately positioned left and right logos, editable hospital details, a patient continuation banner, and a signed footer.';
editable.sections = editable.sections.filter((section) => section.type !== 'pageHeader' && section.type !== 'pageFooter');
editable.sections.unshift(
  { type: 'pageHeader', appliesTo: 'first', children: [
    { type: 'row', gap: 4, children: [
    { type: 'image', id: 'northstar-primary-logo', src: primary, width: 58, height: 58, alt: 'Northstar Medical Center compass and care mark' },
      { type: 'column', width: '*', gap: 1, children: [
        { type: 'text', value: 'NORTHSTAR MEDICAL CENTER', style: { fontSize: 16, fontWeight: 'bold', color: '#143753' } },
        { type: 'text', value: 'CARE WITH CLARITY · COMPASSION IN EVERY STEP', style: { fontSize: 7, fontWeight: 'bold', color: '#167c80' } },
        { type: 'text', value: '123 Meridian Avenue · Bengaluru 560001 · +91 80 4567 8900', style: { fontSize: 7, color: '#526575' } },
      ] },
      { type: 'image', id: 'northstar-accreditation-mark', src: seal, width: 52, height: 52, alt: 'Northstar Medical Center quality seal' },
    ] },
    { type: 'line', style: { color: '#143753' } },
    { type: 'text', value: 'DISCHARGE SUMMARY', style: { fontSize: 8, fontWeight: 'bold', color: '#526575' } },
  ] },
  { type: 'pageHeader', appliesTo: 'standard', children: [
    { type: 'row', children: [
      { type: 'text', expression: 'data.adm.patient.name + " · UHID " + data.adm.patient.uhid', width: '*', style: { fontSize: 8, color: '#526575' } },
      { type: 'text', value: 'DISCHARGE SUMMARY', style: { align: 'right', fontSize: 8, fontWeight: 'bold', color: '#143753' } },
    ] },
    { type: 'line', style: { color: '#9aabb7' } },
  ] },
);
editable.sections.push(
  { type: 'pageFooter', appliesTo: 'first', children: [
    { type: 'line', style: { color: '#167c80' } },
    { type: 'text', id: 'northstar-first-footer-contact', value: 'NORTHSTAR MEDICAL CENTER · +91 80 4567 8900', style: { fontSize: 7, color: '#526575' } },
  ] },
  { type: 'pageFooter', appliesTo: 'standard', children: [
    { type: 'line', style: { color: '#167c80' } },
    { type: 'row', children: [
      { type: 'text', value: 'NORTHSTAR MEDICAL CENTER · +91 80 4567 8900', width: '*', style: { fontSize: 7, color: '#526575' } },
      { type: 'text', expression: '"Page " + page.number + " of " + page.total', style: { align: 'right', fontSize: 8, color: '#143753' } },
    ] },
  ] },
  { type: 'pageFooter', appliesTo: 'last', children: [
    { type: 'line', style: { color: '#167c80' } },
    { type: 'row', children: [
      { type: 'column', width: '*', children: [
        { type: 'text', expression: 'data.adm.doctor', style: { fontSize: 9, fontWeight: 'bold', color: '#143753' } },
        { type: 'text', value: 'Attending physician · Signature and stamp', style: { fontSize: 7, color: '#526575' } },
      ] },
      { type: 'text', expression: '"Page " + page.number + " of " + page.total', style: { align: 'right', fontSize: 8, color: '#143753' } },
    ] },
  ] },
);

const preprinted = structuredClone(base);
preprinted.id = 'preprinted-letterhead';
preprinted.name = 'Hospital Letterhead · Pre-printed Page';
preprinted.description = 'A fictional hospital letterhead printed as a page background, with the discharge content flowing in the open area and page numbering added separately.';
preprinted.page.margin = { top: 55, right: 18, bottom: 32, left: 18 };
preprinted.sections = preprinted.sections.filter((section) => section.type !== 'pageHeader' && section.type !== 'pageFooter' && section.type !== 'background');
preprinted.sections.unshift({ type: 'background', appliesTo: 'standard', children: [
  { type: 'image', id: 'northstar-preprinted-stationery', src: paper, width: 595, height: 842, fit: 'fill', alt: 'Pre-printed Northstar Medical Center letterhead and footer' },
] });
preprinted.sections.push({ type: 'pageFooter', appliesTo: 'standard', children: [
  { type: 'text', expression: '"Page " + page.number + " of " + page.total', style: { align: 'right', fontSize: 8, color: '#143753' } },
] });

await Promise.all([
  writeFile(path.join(examples, 'hospital-letterhead.report.json'), `${JSON.stringify(editable, null, 2)}\n`),
  writeFile(path.join(examples, 'preprinted-letterhead.report.json'), `${JSON.stringify(preprinted, null, 2)}\n`),
]);
console.log('Built hospital logo and pre-printed letterhead examples.');
