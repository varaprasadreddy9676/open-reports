// Chapters 1 and 2: the cold open (the finished result first) and what the film will build.
import { STACK } from "../stack.mjs";
import { closeModal } from "./06-caredesk-print.mjs";

export async function coldOpen(film) {
  const { page } = film;
  await film.goto(`${STACK.caredesk}/?film#/bills/NMC-OPD-24817`);
  await page.getByTestId("caredesk-print").waitFor();
  await film.say("A billing clerk clicks Print.", async () => {
    await film.click(page.getByTestId("caredesk-print"));
    await page.locator('[data-testid="pdf-preview"][data-pages]').waitFor({ timeout: 30_000 });
  });
  await film.say("A hospital system asked Open Reports for a branded invoice, and got a print ready PDF back. By the end of this film, you will have built that invoice yourself, from a blank page, and wired it into two real applications.");
  await film.sleep(800);
  await closeModal(film);
  await film.card("title", {
    kicker: "OPEN REPORTS · THE COMPLETE WALKTHROUGH",
    title: "From a blank page<br><em>to Print.</em>",
    text: "Design an invoice, reuse a shared letterhead, and print it from a hospital system and a fintech app.",
  }, 5200);
  await film.hideCard();
}

export async function ingredients(film) {
  await film.card("list", {
    kicker: "WHAT WE WILL BUILD",
    title: "Three ingredients.",
    lines: [
      ["01", "A report definition", "A JSON file describing the layout. You design it in the browser."],
      ["02", "Your data", "JSON your application already has: the bill, the patient, the branding."],
      ["03", "The Open Reports engine", "Send it both, get back PDF, Word, Excel, HTML, CSV or printer code."],
    ],
  }, 600);
  await film.say("Every report in Open Reports has three ingredients. A report definition, which is a JSON file describing the layout. Your data, which your application already has. And the engine, which takes both and returns a PDF, or Word, Excel, or label printer code.");
  await film.say("We will build the definition in the designer, then use it from a hospital system, and from a fintech product. Everything you see is real. The companies and patients are fictional.");
  await film.hideCard();
}
