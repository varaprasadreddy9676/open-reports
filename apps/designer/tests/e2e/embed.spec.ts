import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

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

test("the embedded designer ignores messages from other origins", async ({ page }) => {
  await hostPage(page, `<open-report-designer height="600px"></open-report-designer>`);
  const frame = page.frameLocator("open-report-designer >> iframe");
  await expect(frame.getByTestId("canvas").or(frame.getByTestId("app"))).toBeVisible();
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
