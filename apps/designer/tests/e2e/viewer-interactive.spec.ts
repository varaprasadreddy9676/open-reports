import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const orders = {
  schemaVersion: "1.0", id: "orders", name: "Orders", page: { size: "A4" },
  datasets: [{ id: "orders", source: "inline", query: { data: [{ id: 1, customer: "Charlie", amount: 30 }, { id: 2, customer: "Alpha", amount: 10 }, { id: 3, customer: "Bravo", amount: 20 }] } }],
  sections: [{ type: "detail", children: [
    { type: "text", value: "Order list", bookmark: true },
    { id: "orders-table", type: "table", dataset: "orders", columns: [
      { id: "no", header: "No", binding: "row.id", link: { report: "order-detail", parameters: { orderId: "row.id" } } },
      { id: "customer", header: "Customer", binding: "row.customer" },
      { id: "amount", header: "Amount", binding: "row.amount" },
    ] },
  ] }],
};
const detail = {
  schemaVersion: "1.0", id: "order-detail", name: "Order detail", page: { size: "A4" },
  parameters: [{ id: "orderId", type: "number", label: "Order" }],
  datasets: [], sections: [{ type: "detail", children: [{ type: "text", expression: '"Details of order " + params.orderId' }] }],
};

async function publish(request: APIRequestContext, report: { id: string; name: string }) {
  await request.delete(`/api/v1/templates/${report.id}`);
  expect((await request.post("/api/v1/templates", { data: { id: report.id, name: report.name, definition: report } })).ok()).toBe(true);
  expect((await request.post(`/api/v1/templates/${report.id}/versions/1/publish`)).ok()).toBe(true);
}

async function open(page: Page) {
  await page.route("**/host.html", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><body><open-report-viewer template="orders" style="height:700px"></open-report-viewer><script type="module" src="/embed/open-reports.js"></script></body></html>` }));
  await page.goto("/host.html");
}

const firstCustomer = (page: Page) => page.frameLocator("open-report-viewer >> iframe").locator("tbody tr").first().locator("td").nth(1);

test("the viewer searches, shows contents, sorts by column and drills through to another report", async ({ page, request }) => {
  await publish(request, detail);
  await publish(request, orders);
  await open(page);
  const viewer = page.locator("open-report-viewer");
  const frame = page.frameLocator("open-report-viewer >> iframe");
  await expect(frame.locator("body")).toContainText("Charlie");

  // Find in report
  await viewer.getByLabel("Find in report").fill("bravo");
  await expect(viewer.getByText("1 of 1")).toBeVisible();
  await expect(frame.locator("mark.or-hit-current")).toHaveText("Bravo");

  // Contents from bookmarks
  await viewer.getByRole("button", { name: "☰ Contents" }).click();
  await expect(viewer.getByRole("complementary", { name: "Contents" }).getByRole("button", { name: "Order list" })).toBeVisible();

  // Click-to-sort: ascending, then descending; the order comes from the engine, so pages stay correct
  await frame.locator('th[data-column="customer"]').click();
  await expect(firstCustomer(page)).toHaveText("Alpha");
  await expect(frame.locator('th[data-column="customer"]')).toHaveAttribute("aria-sort", "ascending");
  await frame.locator('th[data-column="customer"]').click();
  await expect(firstCustomer(page)).toHaveText("Charlie");

  // Drill through to the order's own report, then back
  await frame.locator('a[data-report="order-detail"]', { hasText: "2" }).click();
  await expect(frame.locator("body")).toContainText("Details of order 2");
  await expect(viewer.getByRole("navigation", { name: "Report trail" })).toContainText("Orders › Order detail");
  await expect(viewer.getByLabel("Order")).toHaveValue("2");
  await viewer.getByRole("button", { name: "← Back" }).click();
  await expect(frame.locator("body")).toContainText("Charlie");
  await expect(viewer.getByRole("navigation", { name: "Report trail" })).toBeHidden();
});

test("drill-down groups expand and collapse in the viewer, keeping their subtotals", async ({ page, request }) => {
  const visits = {
    schemaVersion: "1.0", id: "visits-by-region", name: "Visits by region", page: { size: "A4" },
    datasets: [{ id: "visits", source: "inline", query: { data: [{ region: "North", patient: "Ann" }, { region: "North", patient: "Bob" }, { region: "South", patient: "Cid" }] } }],
    sections: [{ type: "detail", children: [{
      id: "byRegion", type: "group", dataset: "visits", groupBy: "row.region", drillDown: "collapsed",
      header: [{ type: "text", expression: "row.region", style: { fontWeight: "bold" } }],
      children: [{ type: "text", expression: "row.patient" }],
      footer: [{ type: "text", value: "end of region" }],
    }] }],
  };
  await publish(request, visits);
  await page.route("**/host.html", (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><body><open-report-viewer template="visits-by-region" style="height:600px"></open-report-viewer><script type="module" src="/embed/open-reports.js"></script></body></html>` }));
  await page.goto("/host.html");
  const frame = page.frameLocator("open-report-viewer >> iframe");
  await expect(frame.locator("body")).toContainText("North");
  await expect(frame.locator("body")).not.toContainText("Ann");
  await expect(frame.getByText("end of region")).toHaveCount(2);

  await frame.getByRole("button", { name: "Expand North" }).click();
  await expect(frame.locator("body")).toContainText("Ann");
  await expect(frame.locator("body")).not.toContainText("Cid");
  await frame.getByRole("button", { name: "Collapse North" }).click();
  await expect(frame.locator("body")).not.toContainText("Ann");
});
