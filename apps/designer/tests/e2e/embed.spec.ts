import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";

const report = {
  schemaVersion: "1.0",
  id: "embed-greeting",
  name: "Embedded greeting",
  page: { size: "A4" },
  parameters: [
    { id: "name", type: "string", label: "Customer", default: "Alex Morgan" },
    { id: "plan", type: "enum", label: "Plan", enumValues: ["Basic", "Pro"], default: "Basic" },
  ],
  datasets: [],
  sections: [{ type: "detail", children: [{ type: "text", expression: '"Hello " + params.name + " on " + params.plan' }] }],
};

async function publishTemplate(request: APIRequestContext, id: string) {
  await request.delete(`/api/v1/templates/${id}`);
  const created = await request.post("/api/v1/templates", { data: { id, name: report.name, definition: { ...report, id } } });
  expect(created.ok()).toBe(true);
  const published = await request.post(`/api/v1/templates/${id}/versions/1/publish`);
  expect(published.ok()).toBe(true);
}

/** A host page on the same origin as the server, as a customer app would serve it. */
async function hostPage(page: Page, body: string) {
  await page.route("**/host.html", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><body>${body}<script type="module" src="/embed/open-reports.js"></script></body></html>` }));
  await page.goto("/host.html");
}

test("<open-report-viewer> renders a published report with a parameter form, refresh and downloads", async ({ page, request }) => {
  await publishTemplate(request, "embed-viewer");
  await hostPage(page, `<open-report-viewer server="" template="embed-viewer" parameters='{"plan":"Pro"}' style="height:600px"></open-report-viewer>`);
  const viewer = page.locator("open-report-viewer");
  const frame = page.frameLocator("open-report-viewer >> iframe");
  await expect(frame.locator("body")).toContainText("Hello Alex Morgan on Pro");

  await viewer.getByLabel("Customer").fill("Sam Lee");
  await viewer.getByLabel("Plan").selectOption("Basic");
  await viewer.getByRole("button", { name: "Refresh" }).click();
  await expect(frame.locator("body")).toContainText("Hello Sam Lee on Basic");

  const download = page.waitForEvent("download");
  await viewer.getByRole("button", { name: "↓ PDF" }).click();
  expect((await download).suggestedFilename()).toBe("embed-viewer.pdf");
});

test("<open-report-viewer> explains a template that has no published version", async ({ page, request }) => {
  await request.delete("/api/v1/templates/embed-draft");
  await request.post("/api/v1/templates", { data: { id: "embed-draft", name: "Draft", definition: { ...report, id: "embed-draft" } } });
  await hostPage(page, `<open-report-viewer template="embed-draft"></open-report-viewer>`);
  await expect(page.locator("open-report-viewer").getByRole("status")).toContainText(/no published version/i);
});

test("<open-report-viewer> can render an inline report definition owned by the host", async ({ page }) => {
  await hostPage(page, `<open-report-viewer server="" style="height:600px"></open-report-viewer>
    <script>
      const viewer = document.querySelector("open-report-viewer");
      viewer.report = ${JSON.stringify({ ...report, id: "inline-viewer", name: "Inline host report" })};
    </script>`);
  const frame = page.frameLocator("open-report-viewer >> iframe");
  await expect(frame.locator("body")).toContainText("Hello Alex Morgan on Basic");
  const download = page.waitForEvent("download");
  await page.locator("open-report-viewer").getByRole("button", { name: "↓ PDF" }).click();
  expect((await download).suggestedFilename()).toBe("inline-viewer.pdf");
});

test("<open-report-designer> embeds the designer without its home screen and reports saves to the host", async ({ page, request }) => {
  await publishTemplate(request, "embed-designer");
  await hostPage(page, `<open-report-designer template="embed-designer" height="700px"></open-report-designer>
    <script>
      window.events = [];
      for (const name of ["designer-ready", "report-saved", "report-dirty"]) document.addEventListener(name, (e) => window.events.push({ name, detail: e.detail }));
    </script>`);
  await expect.poll(() => page.evaluate(() => (window as any).events.map((e: any) => e.name))).toContain("designer-ready");
  const designer = page.frameLocator("open-report-designer >> iframe");
  await expect(designer.getByTestId("canvas")).toBeVisible();
  await expect(designer.getByTestId("btn-home")).toHaveCount(0);
  await expect(designer.locator(".page")).toContainText("Hello");

  const saved = await page.evaluate(() => (document.querySelector("open-report-designer") as any).designer.save());
  expect(saved).toMatchObject({ templateId: "embed-designer" });
  expect(saved.version).toBeGreaterThanOrEqual(1);
  await expect.poll(() => page.evaluate(() => (window as any).events.some((e: any) => e.name === "report-saved"))).toBe(true);
});

test("the embedded designer can save report JSON to the host without creating a server template", async ({ page, request }) => {
  const hostDefinition = { ...report, id: "host-owned-invoice", name: "Host-owned invoice" };
  await request.delete("/api/v1/templates/host-owned-invoice");
  await hostPage(page, `<open-report-designer save-mode="host" height="700px"></open-report-designer>
    <script>
      window.hostDefinition = ${JSON.stringify(hostDefinition)};
      window.savedDefinition = null;
      const element = document.querySelector("open-report-designer");
      element.definition = window.hostDefinition;
      element.onSaveDefinition = async (definition) => { window.savedDefinition = definition; };
    </script>`);
  await expect.poll(() => page.evaluate(() => Boolean((document.querySelector("open-report-designer") as any)?.designer))).toBe(true);
  const frame = page.frameLocator("open-report-designer >> iframe");
  await expect(frame.locator(".page")).toContainText("Hello Alex Morgan on Basic");

  const result = await page.evaluate(() => (document.querySelector("open-report-designer") as any).designer.save());
  expect(result.definition).toMatchObject({ id: "host-owned-invoice", name: "Host-owned invoice" });
  await expect.poll(() => page.evaluate(() => (window as any).savedDefinition?.id)).toBe("host-owned-invoice");
  const serverLookup = await request.get("/api/v1/templates/host-owned-invoice");
  expect(serverLookup.status()).toBe(404);
});

test("the embedded designer ignores messages from other origins", async ({ page }) => {
  await hostPage(page, `<open-report-designer height="600px"></open-report-designer>`);
  const frame = page.frameLocator("open-report-designer >> iframe");
  await expect(frame.getByTestId("app")).toBeVisible();
  // A message in the right format but from a window other than the host page (here the iframe itself) is ignored.
  const docBefore = await page.evaluate(() => (document.querySelector("open-report-designer iframe") as HTMLIFrameElement).contentWindow!.eval("JSON.stringify(window.__designer.getState().doc.name)"));
  await page.evaluate(() => {
    const win = (document.querySelector("open-report-designer iframe") as HTMLIFrameElement).contentWindow!;
    win.eval(`window.postMessage({ protocol: "open-reports/1", type: "load", definition: { schemaVersion: "1.0", id: "x", name: "Injected", page: { size: "A4" }, datasets: [], sections: [] } }, "*")`);
  });
  await page.waitForTimeout(300);
  const docAfter = await page.evaluate(() => (document.querySelector("open-report-designer iframe") as HTMLIFrameElement).contentWindow!.eval("JSON.stringify(window.__designer.getState().doc.name)"));
  expect(docAfter).toBe(docBefore);
});

test("the host page can replace the open report", async ({ page }) => {
  await hostPage(page, `<open-report-designer height="600px"></open-report-designer>`);
  await expect.poll(() => page.evaluate(() => Boolean((document.querySelector("open-report-designer") as any)?.designer))).toBe(true);
  const frame = page.frameLocator("open-report-designer >> iframe");
  await expect(frame.getByTestId("app")).toBeVisible();
  await page.evaluate(() => (document.querySelector("open-report-designer") as any).designer.load({ schemaVersion: "1.0", id: "from-host", name: "From the host", page: { size: "A4" }, datasets: [], sections: [{ type: "detail", children: [{ type: "text", value: "Loaded by the host" }] }] }));
  await expect(frame.locator(".page")).toContainText("Loaded by the host");
});

let hostServer: Server | undefined;
test.afterEach(async () => {
  if (hostServer) { const server=hostServer; hostServer=undefined; await new Promise<void>(resolve=>server.close(()=>resolve())); }
});

async function crossOriginHost(page: Page, script: string) {
  const server = 'http://127.0.0.1:3100';
  const body = `<!doctype html><html><body><div id="editor"></div><script type="module">
    import { createDesigner } from '${server}/embed/open-reports.js';
    window.events = [];
    document.addEventListener('report-saved', e => window.events.push(e.detail));
    ${script}
  </script></body></html>`;
  hostServer=createServer((_request,response)=>{response.setHeader('content-type','text/html');response.end(body);});
  await new Promise<void>(resolve=>hostServer!.listen(0,'127.0.0.1',resolve));
  const address=hostServer.address() as {port:number};
  await page.goto(`http://127.0.0.1:${address.port}/host.html`);
  await expect.poll(() => page.evaluate(() => Boolean((window as any).ready))).toBe(true);
  return page.frameLocator('iframe[title="Report designer"]');
}

for (const failure of ['sync', 'async']) {
  test(`a cross-origin host ${failure} save failure rejects and can be retried without losing edits`, async ({ page, request }) => {
    const frame = await crossOriginHost(page, `
      window.fail = true;
      window.designer = createDesigner(document.querySelector('#editor'), {
        server: 'http://127.0.0.1:3100', definition: ${JSON.stringify(report)}, saveMode: 'host',
        onReady: () => window.ready = true,
        onSaveDefinition: ${failure === 'async' ? 'async' : ''} (definition) => { if (window.fail) throw new Error('Host storage unavailable'); window.stored = definition; },
      });`);
    await frame.getByLabel('Report name').fill('Retained host edit');
    const failureResult = await page.evaluate(() => (window as any).designer.save().then(() => 'saved', (e: Error) => e.message));
    expect(failureResult).toContain('Host storage unavailable');
    await expect(frame.getByTestId('save-state')).toHaveText('Save failed');
    await expect(frame.getByLabel('Report name')).toHaveValue('Retained host edit');
    await expect(frame.getByTestId('btn-publish')).toHaveCount(0);
    await page.evaluate(() => { (window as any).fail = false; });
    const result = await page.evaluate(() => (window as any).designer.save());
    expect(result.definition.name).toBe('Retained host edit');
    await expect(frame.getByTestId('save-state')).toContainText('Saved in your application');
    expect((await request.get('/api/v1/templates/embed-greeting')).status()).toBe(404);
  });
}

test('slow host saves return the stored snapshot, keep newer edits dirty, and coalesce repeated Save requests', async ({ page }) => {
  const frame = await crossOriginHost(page, `window.calls=0;
    window.designer=createDesigner(document.querySelector('#editor'), {server:'http://127.0.0.1:3100',definition:${JSON.stringify(report)},saveMode:'host',onReady:()=>window.ready=true,
    onSaveDefinition:async definition=>{window.calls++;await new Promise(resolve=>window.finish=resolve);window.stored=definition;}});`);
  await frame.getByLabel('Report name').fill('First edit');
  await page.evaluate(() => { (window as any).saving = Promise.all([(window as any).designer.save(), (window as any).designer.save()]); });
  await expect.poll(() => page.evaluate(() => (window as any).calls)).toBe(1);
  await frame.getByLabel('Report name').fill('Newer edit');
  await expect(frame.getByTestId('btn-save')).toBeDisabled();
  await page.evaluate(() => (window as any).finish());
  const results = await page.evaluate(() => (window as any).saving);
  expect(results.map((r: any) => r.definition.name)).toEqual(['First edit', 'First edit']);
  await expect(frame.getByTestId('save-state')).toHaveText('Unsaved changes');
  await expect(frame.getByLabel('Report name')).toHaveValue('Newer edit');
});

test('host preview data and parameters work, stay outside saved JSON, and reload restores the saved definition', async ({ page }) => {
  const definition = { ...report, sections: [{ type: 'detail', children: [{ type: 'text', expression: 'data.client.name + ": " + params.name' }] }] };
  const frame = await crossOriginHost(page, `window.designer=createDesigner(document.querySelector('#editor'), {server:'http://127.0.0.1:3100',definition:${JSON.stringify(definition)},data:{client:{name:'Acme Tenant'}},parameters:{name:'Sam Lee'},saveMode:'host',onReady:()=>window.ready=true,onSaveDefinition:definition=>window.stored=definition});`);
  await expect(frame.locator('.page')).toContainText('Acme Tenant: Sam Lee');
  await frame.getByLabel('Report name').fill('Saved customer report');
  const result = await page.evaluate(() => (window as any).designer.save());
  expect(JSON.stringify(result.definition)).not.toContain('Acme Tenant');
  await page.evaluate(() => { (window as any).ready=false; const f=(window as any).designer.frame; f.src=f.src; });
  await expect.poll(() => page.evaluate(() => (window as any).ready)).toBe(true);
  await expect(frame.getByLabel('Report name')).toHaveValue('Saved customer report');
  await expect(frame.locator('.page')).toContainText('Acme Tenant: Sam Lee');
});

test('the host can load a new definition and preview data, and invalid input leaves the previous report intact', async ({ page }) => {
  const frame = await crossOriginHost(page, `window.errors=[];window.designer=createDesigner(document.querySelector('#editor'), {server:'http://127.0.0.1:3100',definition:${JSON.stringify(report)},onReady:()=>window.ready=true,onError:m=>window.errors.push(m)});`);
  const definition={...report,name:'New host report',sections:[{type:'detail',children:[{type:'text',expression:'data.client.name'}]}]};
  await page.evaluate((definition) => (window as any).designer.load(definition, {data:{client:{name:'New tenant preview'}}}), definition);
  await expect(frame.locator('.page')).toContainText('New tenant preview');
  await page.evaluate(() => (window as any).designer.load({id:'invalid'}));
  await expect.poll(() => page.evaluate(() => (window as any).errors.join())).toContain('Invalid report');
  await expect(frame.getByLabel('Report name')).toHaveValue('New host report');
});

test('a host-managed designer opens a JSON file without accessing the server template list', async ({ page }) => {
  const frame=await crossOriginHost(page,`window.designer=createDesigner(document.querySelector('#editor'),{server:'http://127.0.0.1:3100',definition:${JSON.stringify(report)},saveMode:'host',onReady:()=>window.ready=true,onSaveDefinition:()=>{}});`);
  let templateLookups=0;
  page.on('request',request=>{if(request.url().endsWith('/api/v1/templates'))templateLookups++;});
  await frame.getByTestId('btn-open').click();
  await expect(frame.getByRole('dialog',{name:'Open report file'})).toBeVisible();
  await frame.getByLabel('Open report JSON file').setInputFiles({name:'broken.report.json',mimeType:'application/json',buffer:Buffer.from('{bad json')});
  await expect(frame.getByRole('alert')).toContainText('not valid JSON');
  const next={...report,name:'Opened report file'};
  await frame.getByLabel('Open report JSON file').setInputFiles({name:'valid.report.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(next))});
  await expect(frame.getByLabel('Report name')).toHaveValue('Opened report file');
  await expect(frame.getByTestId('save-state')).toHaveText('Unsaved changes');
  expect(templateLookups).toBe(0);
});

test('the viewer can retry after its first template lookup fails', async ({ page, request }) => {
  await publishTemplate(request,'viewer-retry');
  await page.route('**/api/v1/templates/viewer-retry/versions',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Temporarily unavailable'}})}));
  await hostPage(page,'<open-report-viewer template="viewer-retry"></open-report-viewer>');
  const viewer=page.locator('open-report-viewer');
  await expect(viewer.getByRole('status')).toContainText('Temporarily unavailable');
  await page.unroute('**/api/v1/templates/viewer-retry/versions');
  await viewer.getByRole('button',{name:'Refresh',exact:true}).click();
  await expect(page.frameLocator('open-report-viewer >> iframe').locator('body')).toContainText('Hello Alex Morgan');
});

test('the host viewer renders a JSON file with its bundled shared header and accepts a client override', async ({ page }) => {
  const child={...report,id:'shared-header',name:'Shared header',parameters:[],sections:[{type:'detail',children:[{type:'text',value:'Bundled client header'}]}]};
  const parent={...report,id:'bundled-invoice',subreports:{'shared-header':child},sections:[{type:'pageHeader',children:[{type:'subreport',reportId:'shared-header'}]},{type:'detail',children:[{type:'text',value:'Invoice body'}]}]};
  await hostPage(page,`<open-report-viewer></open-report-viewer><script>document.querySelector('open-report-viewer').report=${JSON.stringify(parent)};</script>`);
  const frame=page.frameLocator('open-report-viewer >> iframe');
  await expect(frame.locator('body')).toContainText('Bundled client header');
  await expect(frame.locator('body')).toContainText('Invoice body');
  await page.evaluate((child)=>{(document.querySelector('open-report-viewer') as any).subreports={'shared-header':{report:{...child,sections:[{type:'detail',children:[{type:'text',value:'Tenant header override'}]}]}}};},child);
  await expect(frame.locator('body')).toContainText('Tenant header override');
  await expect(frame.locator('body')).not.toContainText('Bundled client header');
});

test('host saving times out visibly and a subsequent save can succeed',async({page})=>{
  const frame=await crossOriginHost(page,`window.fail=true;window.designer=createDesigner(document.querySelector('#editor'),{server:'http://127.0.0.1:3100',definition:${JSON.stringify(report)},saveMode:'host',saveTimeout:150,onReady:()=>window.ready=true,onSaveDefinition:()=>window.fail?new Promise(()=>{}):undefined});`);
  await frame.getByLabel('Report name').fill('Retained after timeout');
  const error=await page.evaluate(()=>(window as any).designer.save().then(()=>'',(error:Error)=>error.message));
  expect(error).toMatch(/timed out|did not confirm/);
  await expect(frame.getByTestId('save-state')).toHaveText('Save failed');
  await expect(frame.getByLabel('Report name')).toHaveValue('Retained after timeout');
  await page.evaluate(()=>(window as any).fail=false);
  const result=await page.evaluate(()=>(window as any).designer.save());
  expect(result.definition.name).toBe('Retained after timeout');
});

test('the custom element uses the latest host save callback and reconnects with its last saved JSON',async({page})=>{
  await hostPage(page,`<open-report-designer save-mode="host"></open-report-designer><script>
    const element=document.querySelector('open-report-designer');element.definition=${JSON.stringify(report)};
    element.onSaveDefinition=()=>{throw new Error('Old callback must not run');};
  </script>`);
  const frame=page.frameLocator('open-report-designer >> iframe');
  await expect(frame.getByLabel('Report name')).toHaveValue(report.name);
  await page.evaluate(()=>{(document.querySelector('open-report-designer') as any).onSaveDefinition=(definition:any)=>(window as any).stored=definition;});
  await frame.getByLabel('Report name').fill('Reconnected report');
  await page.evaluate(()=>(document.querySelector('open-report-designer') as any).designer.save());
  await page.evaluate(()=>{const element=document.querySelector('open-report-designer')!;element.remove();document.body.append(element);});
  await expect(frame.getByLabel('Report name')).toHaveValue('Reconnected report');
});

test('hosted embed modules revalidate after deployment',async({request})=>{
  const response=await request.get('/embed/open-reports.js');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('max-age=0');
  expect(response.headers().etag).toBeTruthy();
});
