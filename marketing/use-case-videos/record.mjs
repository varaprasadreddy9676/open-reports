import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const run = promisify(execFile);
const require = createRequire('/Users/sai/Documents/GitHub/open-reports/apps/designer/package.json');
const { chromium } = require('@playwright/test');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'apps/designer/public/demo-videos');
const work = '/tmp/open-reports-use-case-recordings';
await mkdir(out, { recursive: true }); await mkdir(work, { recursive: true });
const demos = [
  { id:'invoice-to-pdf', title:'Create an invoice and preview the PDF', summary:'Start from a working invoice, change the business name, and preview the printable result.', narration:['Start with a working invoice instead of a blank page.','Change the company name directly on the report canvas.','Run Preview to inspect the actual PDF, including line items, tax, totals and the QR code.','The same editable report is ready to adjust for your own data and brand.'] },
  { id:'word-to-report', title:'Turn a Word template into an editable report', summary:'Import a DOCX letter template, review what was recognized, then open and preview the draft.', narration:['Already have a Word template? Bring it in as a starting point.','Open Import Word document and choose the clinic discharge letter.','Open the editable draft, then review the layout and sample output before using it.'] },
  { id:'jasper-folder-migration', title:'Migrate a JasperReports folder', summary:'Convert a small JRXML folder into editable drafts, inspect conversion notes, and open a report for review.', narration:['Bring a JasperReports project over as a folder of JRXML sources.','Open the folder importer and choose the parent report and its header subreport.','Open Reports converts the files into editable drafts and links recognized child reports.','Review the migration note for features that need attention before using the converted report.'] },
  { id:'supermarket-receipt', title:'Build a long 58 mm supermarket receipt', summary:'Load realistic grocery items into a continuous thermal receipt and preview the full roll output.', narration:['A narrow receipt can still contain a long basket of supermarket items.','Edit the sample sale data with a realistic grocery basket.','Switch to the continuous roll view and confirm the items and totals fit the 58 millimeter receipt.','Preview the ESC POS output before sending it to a thermal printer.'] },
  { id:'sales-crosstab', title:'Summarize sales with a crosstab', summary:'Open a pivot-style report, inspect the row and column dimensions, and preview the totals.', narration:['Turn row-level sales into a quick regional comparison.','Open the Sales by region and service example and select the crosstab.','The report arranges regions down the side and services across the top.','Run Preview to check the grouped values and totals in the finished report.'] },
  { id:'hospital-letterhead', title:'Create a polished hospital letterhead', summary:'Prepare a discharge summary with a hospital masthead, repeating patient details and a signed page footer.', narration:['A clinical report needs clear hospital identity, patient context and a proper sign-off.','Start with a fictional discharge summary that already separates the opening letterhead, the repeating patient banner and the closing signature footer.','Preview the report to check the branded first page, patient details, medicines and footer together.','The same page structure keeps the report easy to recognize and ready to print.'] },
];
const requestedIds = process.argv.slice(2);
const selectedDemos = requestedIds.length ? demos.filter((demo) => requestedIds.includes(demo.id)) : demos;
if (selectedDemos.length !== (requestedIds.length || demos.length)) throw new Error(`Unknown demo ID. Choose one of: ${demos.map((demo) => demo.id).join(', ')}`);
const cssOverlay = `
(() => {
 const style=document.createElement('style'); style.textContent=`+
JSON.stringify(`
#video-brand{position:fixed;z-index:99999;top:18px;right:22px;background:#111827df;color:white;border:1px solid #ffffff2c;border-radius:20px;padding:8px 14px;font:600 13px system-ui;letter-spacing:.03em;box-shadow:0 4px 16px #0002;pointer-events:none}
#video-caption{position:fixed;z-index:99999;left:50%;bottom:28px;transform:translateX(-50%);max-width:75vw;background:#101827ed;color:white;border-radius:10px;padding:12px 20px;font:600 20px/1.35 system-ui;text-align:center;box-shadow:0 4px 20px #0004;pointer-events:none}
#video-slate{position:fixed;inset:0;z-index:100000;background:linear-gradient(135deg,#101b2b,#233e61);color:white;display:flex;align-items:center;justify-content:center;font:600 25px/1.5 system-ui;transition:opacity .45s}
#video-slate>div{width:min(980px,80vw);border-left:4px solid #68a3ff;padding:18px 0 18px 34px}#video-slate small{display:block;font-size:13px;letter-spacing:.22em;color:#a9c9fb;margin-bottom:18px}#video-slate strong{font-size:48px;line-height:1.1;display:block;max-width:900px}#video-slate p{font-weight:400;font-size:20px;color:#d0dced}
`)+`;
 document.head.append(style); const brand=document.createElement('div'); brand.id='video-brand'; brand.textContent='OPEN REPORTS   ·   PRACTICAL DEMO'; document.body.append(brand);
 const cursor=document.createElement('div'); cursor.id='video-cursor'; cursor.innerHTML='<svg width="30" height="36" viewBox="0 0 30 36"><path d="M3 2L4 28l7-7 6 12 5-3-6-11 10-1z" fill="white" stroke="#16345c" stroke-width="2"/></svg>'; cursor.style='position:fixed;left:20px;top:20px;z-index:100001;pointer-events:none;filter:drop-shadow(0 2px 2px #0007);transition:left .22s ease,top .22s ease'; document.body.append(cursor);
 const cap=document.createElement('div'); cap.id='video-caption'; document.body.append(cap);
 window.__videoTools={caption(t){cap.textContent=t},slate(t,s){const el=document.createElement('div');el.id='video-slate';el.innerHTML='<div><small>OPEN REPORTS · PRACTICAL USE CASE</small><strong>'+t+'</strong><p>'+s+'</p></div>';document.body.append(el);return el},cursor(x,y){cursor.style.left=x+'px';cursor.style.top=y+'px'}};
})();`;
const sleep = ms => new Promise(r=>setTimeout(r,ms));
async function createVideo(demo){
 const raw=path.join(work,`${demo.id}.webm`); const audios=[]; const cues=[]; const ctx=await browser.newContext({viewport:{width:1600,height:900},deviceScaleFactor:1,colorScheme:'light',recordVideo:{dir:work,size:{width:1600,height:900}}});
 const page=await ctx.newPage(); page.setDefaultTimeout(12000); page.on('pageerror',e=>console.log('PAGEERROR',demo.id,e.message));
 const start=Date.now();
 const sec=()=>((Date.now()-start)/1000);
 async function say(text){
   const audio=path.join(work,`${demo.id}-${audios.length}.aiff`); await run('say',['-v','Samantha','-r','178','-o',audio,text]);
   const {stdout}=await run('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',audio]); const duration=Number(stdout.trim()); const at=sec(); audios.push({audio,at}); cues.push({at,end:at+duration,text}); await page.evaluate(t=>window.__videoTools.caption(t),text); await sleep(duration*1000+250); await page.evaluate(()=>window.__videoTools.caption('')); await sleep(250);
 }
 async function aim(locator){ const b=await locator.boundingBox(); if(b){await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:14}); await page.evaluate(({x,y})=>window.__videoTools.cursor(x,y),{x:b.x+b.width/2,y:b.y+b.height/2}); await sleep(350);} }
 async function click(locator){await aim(locator); await locator.click(); await sleep(800);}
 await page.goto('http://localhost:3000'); await page.waitForLoadState('networkidle').catch(()=>{}); await page.evaluate(cssOverlay); await sleep(400);
 const slate=await page.evaluate(({title,summary})=>window.__videoTools.slate(title,summary),{title:demo.title,summary:demo.summary}); await sleep(2300); await page.evaluate(()=>{const el=document.querySelector('#video-slate');el.style.opacity='0';setTimeout(()=>el.remove(),500)}); await sleep(550);
 await say(demo.narration[0]);
 if(demo.id==='invoice-to-pdf'){
   await click(page.getByTestId('home-try-invoice')); await say(demo.narration[1]);
   const company=page.getByText('ACME HEALTH',{exact:true}).last(); await aim(company); await company.dblclick(); await sleep(400); const editor=page.getByTestId('inline-editor'); await editor.fill('NORTHSTAR CLINIC'); await page.keyboard.press('Enter'); await sleep(1200);
   await say(demo.narration[2]); await click(page.getByTestId('btn-preview')); await page.getByTestId('pdf-info').waitFor(); await sleep(2400); await say(demo.narration[3]);
 } else if(demo.id==='word-to-report'){
   await click(page.getByTestId('starter-docx')); const docx=path.join(root,'marketing/use-case-videos/fixtures/clinic-discharge-template.docx'); await aim(page.getByTestId('docx-file')); await page.getByTestId('docx-file').setInputFiles(docx); await page.getByTestId('docx-review').waitFor(); await sleep(1800); await say(demo.narration[1]);
   await click(page.getByTestId('apply-docx')); await sleep(1200); await click(page.getByTestId('btn-preview')); await sleep(1800); await say(demo.narration[2]);
 } else if(demo.id==='jasper-folder-migration'){
   await click(page.getByTestId('starter-jrxml')); await click(page.getByRole('button',{name:'Folder',exact:true})); const folder=path.join(root,'marketing/use-case-videos/fixtures/jrxml'); await aim(page.getByTestId('jrxml-folder')); await page.getByTestId('jrxml-folder').setInputFiles(folder); await page.getByTestId('jrxml-folder-review').waitFor(); await sleep(1800); await say(demo.narration[1]);
   await click(page.getByTestId('save-jrxml-folder')); await page.getByText(/2 drafts saved/).waitFor(); await sleep(1300); await say(demo.narration[2]); await page.getByRole('searchbox',{name:'Find JRXML file'}).fill('parent'); await sleep(800); await click(page.locator('.jrxml-review-list .migration-row').getByRole('button',{name:'Open'})); await sleep(1500); await click(page.getByTestId('toggle-migration')); await page.getByTestId('migration-panel').waitFor(); await sleep(900); await say(demo.narration[3]);
 } else if(demo.id==='supermarket-receipt'){
   await click(page.getByTestId('starter-receipt-58mm')); await click(page.getByTestId('left-tab-data')); await click(page.getByRole('button',{name:'Edit sale'})); const input=page.getByTestId('dataset-json'); const items=['Milk 1L','Whole wheat bread','Free range eggs 12pk','Basmati rice 5kg','Sunflower oil 1L','Tomatoes 1kg','Bananas 1kg','Coffee ground 250g','Green tea 25 bags','Pasta penne 500g','Pasta sauce 500g','Cheddar cheese 400g','Greek yogurt 1kg','Butter 200g','Chicken breast 1kg','Potatoes 2kg','Onions 1kg','Spinach 250g','Apples 1kg','Orange juice 1L','Breakfast cereal 500g','Oats 1kg','Lentils 1kg','Chickpeas 500g','Coconut milk 400ml','Dish soap 500ml','Laundry detergent 2L','Paper towels 6pk','Toothpaste 100g','Shampoo 400ml','Biscuits assorted','Dark chocolate 100g','Mineral water 2L','Frozen peas 1kg','Ice cream 500ml','Olive oil 500ml','Honey 250g','Peanut butter 340g','Tortilla wraps 8pk','Avocado 2pk','Bell peppers 3pk','Carrots 1kg','Cucumber','Ground coffee 500g','Cheese crackers']; const rows=items.map((name,i)=>({name,qty:1+(i%3===0?1:0),price:[2.49,3.29,4.79,6.99,8.49][i%5]})); const sale={store:'Northstar Market',number:'SM-20841',date:'2026-10-06 17:42',items:rows}; await input.fill(JSON.stringify(sale,null,2)); await sleep(900); await say(demo.narration[1]); await click(page.getByTestId('dataset-save')); await click(page.getByTestId('left-tab-layers')); await click(page.getByTestId('btn-more')); await page.getByTestId('target-select').selectOption('escpos'); await click(page.getByTestId('view-pages')); await sleep(1800); await say(demo.narration[2]); await click(page.getByTestId('btn-preview')); await sleep(1000); await click(page.getByTestId('preview-tab-escpos')); await sleep(2400); await say(demo.narration[3]);
 } else if(demo.id==='hospital-letterhead'){
   await click(page.getByTestId('starter-discharge-summary')); await sleep(1300);
   await say(demo.narration[1]);
   await click(page.getByTestId('btn-preview')); await page.getByTestId('pdf-info').waitFor(); await sleep(2400);
   await say(demo.narration[2]);
   await say(demo.narration[3]);
 } else {
   await click(page.getByTestId('starter-crosstab')); await sleep(1200); await say(demo.narration[1]); const crosstab=page.getByTestId('layer-sales-crosstab'); await click(crosstab); await sleep(1500); await say(demo.narration[2]); await click(page.getByTestId('btn-preview')); await page.getByTestId('pdf-info').waitFor(); await sleep(2200); await say(demo.narration[3]);
 }
 await page.evaluate(()=>window.__videoTools.caption('Open Reports  ·  Start with an example. Make it yours.')); await sleep(1800);
 const v=page.video(); await ctx.close(); await v.saveAs(raw);
 const vtt=['WEBVTT','']; for(const c of cues){const fmt=n=>{const ms=Math.max(0,Math.round(n*1000));const h=Math.floor(ms/3600000),m=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60,x=ms%1000;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(x).padStart(3,'0')}`};vtt.push(`${fmt(c.at)} --> ${fmt(c.end)}`,c.text,'');}
 await writeFile(path.join(out,`${demo.id}.vtt`),vtt.join('\n'));
 const args=['-y','-i',raw]; for(const a of audios) args.push('-i',a.audio);
 const filters=audios.map((a,i)=>`[${i+1}:a]adelay=${Math.round(a.at*1000)}|${Math.round(a.at*1000)},volume=1.2[a${i}]`).join(';')+`;${audios.map((_,i)=>`[a${i}]`).join('')}amix=inputs=${audios.length}:duration=longest:normalize=0,alimiter=limit=0.93[aout]`;
 args.push('-filter_complex',filters.replace('alimiter=limit=0.93[aout]','alimiter=limit=0.93,apad=pad_dur=3[aout]'),'-map','0:v','-map','[aout]','-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart','-shortest',path.join(out,`${demo.id}.mp4`));
 await run('ffmpeg',args,{maxBuffer:1024*1024*8});
 const posterSecond = { 'invoice-to-pdf': 30, 'word-to-report': 23, 'jasper-folder-migration': 24, 'supermarket-receipt': 42, 'sales-crosstab': 30, 'hospital-letterhead': 33 }[demo.id] ?? 18;
 await run('ffmpeg',['-y','-ss',String(posterSecond),'-i',path.join(out,`${demo.id}.mp4`),'-frames:v','1','-vf','scale=800:-2',path.join(out,`${demo.id}-poster.jpg`) ]);
 console.log('DONE',demo.id, 'captions',cues.length,'voiceSegments',audios.length);
}
const browser=await chromium.launch({headless:true});
try { for(const demo of selectedDemos) await createVideo(demo); }
finally { await browser.close(); }
