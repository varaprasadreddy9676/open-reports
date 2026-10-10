// Chapter 8: edit the invoice inside CareDesk with the embedded designer, save it to CareDesk, and reprint.
import { STACK } from "../stack.mjs";
import { closeModal, openDevView } from "./06-caredesk-print.mjs";

export async function run(film) {
  const { page } = film;
  await film.goto(`${STACK.caredesk}/?film#/bills`);
  await film.chapter("08", "Put the designer inside your application", "Edit, save to CareDesk, print again");
  await film.say("Billing teams change invoices all the time: a new note, a different footer. CareDesk lets them do it without leaving the application. Click Design invoice layout.", async () => {
    await film.click(page.locator("#design-invoice"));
    await page.locator("#designer-host iframe").waitFor();
  });
  const designer = page.frameLocator("#designer-host iframe");
  await designer.getByTestId("page-1").waitFor({ timeout: 30_000 });
  await film.say("This is the real Open Reports designer, running in a frame inside CareDesk's own page. It opened CareDesk's invoice file, with a sample bill for the preview.");

  await openDevView(film);
  await film.say("Embedding it takes one call. Here is CareDesk's code.", async () => {
    await film.click(page.locator("#how-edit"));
    await page.locator("dialog[open] .source-code").waitFor();
  });
  await film.say("Create designer gets the Open Reports address, CareDesk's report, and the preview data. Save mode host means edits come back to CareDesk. Open Reports does not store them. The save function sends the edited report to CareDesk's own server.");
  await closeModal(film);
  await film.click(page.locator("#dev-toggle")); // give the designer the full width while editing
  const showProperties = designer.getByRole("button", { name: "Show properties" });
  if (await showProperties.isVisible().catch(() => false)) await film.click(showProperties);

  const balance = designer.getByTestId("page-1").getByText(/Balance due/).first();
  await film.say("Let's make a change. Select the balance due line.", async () => {
    await film.click(balance);
  });
  await film.say("Change it to read amount payable.", async () => {
    const formula = designer.getByTestId("formula-input");
    await film.fill(formula, "\"Amount payable: \" + formatCurrency(data.invoice.balance)");
    await page.getByText("Unsaved changes").waitFor({ timeout: 15_000 });
  });

  await fetch(`${STACK.caredesk}/app-api/training/fail-next-save`, { method: "POST" });
  await openDevView(film);
  await film.say("Now save. To be safe, let's see what happens if CareDesk's storage is down. We switched on a test failure for this one save.", async () => {
    await film.click(page.getByTestId("caredesk-save-layout"));
    await page.locator('#save-state[data-state="error"]').waitFor({ timeout: 15_000 });
  });
  await film.say("The save failed, and the designer says so. The edit is still there, nothing is lost. Save again.", async () => {
    await film.click(page.getByTestId("caredesk-save-layout"));
    await page.locator('#save-state[data-state="saved"]').waitFor({ timeout: 15_000 });
  });
  await film.say("Saved. The developer view shows CareDesk checking the report with Open Reports, and then writing version two to its report folder.");
  await film.sleep(1200);

  await film.say("Back to the bill, and print again.", async () => {
    await film.click(page.locator("#close-designer"));
    await film.click(page.locator('tr[data-id="NMC-OPD-24817"]'));
    await film.click(page.getByTestId("caredesk-print"));
    await page.locator('[data-testid="pdf-preview"][data-pages]').waitFor({ timeout: 30_000 });
  });
  await film.say("The printed invoice now says amount payable. The edit, the save, and the next print all used CareDesk's own copy of the report.");
  await film.sleep(1500);
  await closeModal(film);
}
