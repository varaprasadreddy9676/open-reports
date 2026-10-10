// Chapter 9: a fintech dashboard uses the other routes: stored templates by ID, and the drop-in viewer.
import { STACK } from "../stack.mjs";

export async function run(film) {
  const { page } = film;
  await film.goto(`${STACK.ledgerline}/?film#/developers`);
  await film.chapter("09", "Same engine, a fintech product", "Ledgerline stores templates in Open Reports and renders them by ID");
  await film.say("Ledgerline is a payments dashboard for small businesses. It uses Open Reports differently. Instead of keeping report files itself, it stores them in Open Reports once, as published templates.");
  await film.say("Publishing is one call per template, usually part of a deploy. Here it is, with the real requests.", async () => {
    await film.click(page.locator("#dev-toggle"));
    await film.click(page.getByTestId("ledgerline-publish"));
    await page.getByText("Templates published to Open Reports").waitFor({ timeout: 15_000 });
  });
  await film.say("Each template now has a published version. Published versions never change, so every invoice uses exactly the layout that was reviewed.");

  await film.say("On the invoices page, Download PDF sends only the template ID, the format, and the data. No report definition travels with the request.", async () => {
    await film.click(page.locator('a[data-page="invoices"]'));
    await film.click(page.getByTestId("ledgerline-download-BSC-INV-1188"));
    await page.getByText("Downloaded BSC-INV-1188.pdf").waitFor({ timeout: 30_000 });
  });
  await film.say("Same flow as before: the browser asks Ledgerline, Ledgerline asks Open Reports for template ledgerline merchant invoice, and the PDF comes back.");
  await film.click(page.locator("#dev-toggle"));

  await film.say("For screens where people read reports, there is a drop-in viewer. The statements page is one viewer element, given the template ID and this merchant's data.", async () => {
    await film.click(page.locator('a[data-page="statements"]'));
    await page.frameLocator("#statement iframe").locator("body").getByText("SETTLEMENTS").first().waitFor({ timeout: 30_000 });
  });
  const viewer = page.locator("#statement");
  await film.say("It comes with search, print, and downloads. Find one transaction.", async () => {
    await film.fill(viewer.getByLabel("Find in report"), "TXN904241");
    await film.sleep(1500);
  });
  await film.say("And the merchant can take the whole month to Excel, for their accountant.", async () => {
    await Promise.all([page.waitForEvent("download"), film.click(viewer.getByRole("button", { name: /Excel/ }))]);
  });
  await film.sleep(1000);
}
