// Chapter 7: another branch prints the same report with its own letterhead, supplied as data.
import { STACK } from "../stack.mjs";
import { closeModal } from "./06-caredesk-print.mjs";

export async function run(film) {
  const { page } = film;
  await film.chapter("07", "Every branch, its own letterhead", "Same report, different branding data");
  await film.say("Northstar has a children's hospital in Mysuru. Switch CareDesk to that branch.", async () => {
    await film.goto(`${STACK.caredesk}/?film#/bills`);
    await film.select(page.locator("#branch"), "mysuru");
    await page.locator('tr[data-id="NCH-OPD-11502"]').waitFor();
  });
  await film.say("Open a bill, and download it.", async () => {
    await film.click(page.locator('tr[data-id="NCH-OPD-11502"]'));
    await film.click(page.getByTestId("caredesk-download"));
    await page.locator('[data-testid="pdf-preview"][data-pages]').waitFor({ timeout: 30_000 });
  });
  await film.say("The report file is identical. CareDesk simply sent this branch's branding as data, so the shared letterhead shows the children's hospital name, its address, and its own logo.");
  await film.sleep(1500);
  await closeModal(film);
  await film.select(page.locator("#branch"), "bengaluru");
}
