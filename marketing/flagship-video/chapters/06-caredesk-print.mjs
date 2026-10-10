// Chapter 6: CareDesk HIMS prints and downloads invoices with the report file we just built.
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { STACK } from "../stack.mjs";

const shell = promisify(execFile);
const FINISHED = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../training-videos/fixtures/caredesk/reports/hospital-invoice.report.json");

/** Opens CareDesk's developer view if it is closed. */
export async function openDevView(film) {
  const toggle = film.page.locator("#dev-toggle");
  if ((await toggle.getAttribute("aria-pressed")) !== "true") await film.click(toggle);
}

export async function closeModal(film) {
  await film.click(film.page.locator("dialog[open] header button"), { pause: 500 });
}

export async function run(film, state) {
  const { page } = film;
  const source = state.invoiceFile ?? FINISHED;
  const target = path.join(STACK.caredeskReports, "bengaluru", "invoice.report.json");
  const mysuru = path.join(STACK.caredeskReports, "mysuru", "invoice.report.json");

  await film.goto(`${STACK.caredesk}/?film#/bills`);
  await film.chapter("06", "Print and download from a hospital system", "CareDesk HIMS uses the report file we just made");
  await film.say("This is CareDesk, a hospital information system. It is a separate application, with its own billing screens, its own data, and its own server.");

  const command = `cp "${source}" ${target}`;
  await film.terminal(command);
  await film.say("CareDesk keeps its invoice layout as a file in its own report folder, one per branch. We copy the file we exported into that folder.", async () => {
    await shell("cp", [source, target]);
    await shell("cp", [source, mysuru]);
    const { stdout } = await shell("ls", ["-l", target]);
    await film.terminal(command, stdout.trim().replace(/^\S+\s+\S+\s+\S+\s+\S+\s+/, ""));
  });
  await film.sleep(1200);
  await film.clearTerminal();

  await film.say("Here is today's billing list. Open Arjun Mehta's cardiology bill.", async () => {
    await film.click(page.locator('tr[data-id="NMC-OPD-24817"]'));
    await page.getByTestId("caredesk-download").waitFor();
  });

  await film.say("Before clicking anything, let's see what CareDesk's server does when someone presses Print. Open the developer view.", async () => {
    await openDevView(film);
    await film.click(page.locator("#how"));
    await page.locator("dialog[open] .source-code").waitFor();
  });
  await film.say("This is the real code that runs. Step one: CareDesk loads the bill, and checks this user may see it. Step two: it reads its own report file from its report folder.");
  await film.say("Step three: it sends the report and the data to Open Reports, with one request, to slash A P I slash v one slash render. Open Reports never sees the file path. It only receives the report itself, and the data.");
  await film.say("Step four: the PDF comes back, and CareDesk hands it to the browser.");
  await closeModal(film);

  await film.say("Now click Download PDF, and watch each step happen.", async () => {
    await film.click(page.getByTestId("caredesk-download"));
    await page.locator('[data-testid="pdf-preview"][data-pages]').waitFor({ timeout: 30_000 });
  });
  await film.say("The browser asked CareDesk. CareDesk read its report file, and called Open Reports. Open Reports rendered the PDF in a fraction of a second, and CareDesk sent it back. The file is saved, and here is exactly what it contains.");
  await film.sleep(1500);
  await closeModal(film);

  await film.say("The developer view keeps the real request. Here is the body CareDesk sent: the report, the format, and the bill's data. Nothing in it is invented for the film.", async () => {
    const body = page.locator(".devtrace-step").filter({ hasText: "Open Reports" }).first().locator("summary");
    await film.click(body);
    await film.sleep(2500);
  });

  await film.say("Print works the same way. CareDesk gets the PDF, shows it, and hands it to the browser's print dialog.", async () => {
    await film.click(page.getByTestId("caredesk-print"));
    await page.locator('[data-testid="pdf-preview"][data-pages]').waitFor({ timeout: 30_000 });
  });
  await film.sleep(1500);
  await closeModal(film);

  await film.say("A long stay is the real test. Rohan Desai's fourteen day admission has forty two lines.", async () => {
    await film.goto(`${STACK.caredesk}/?film#/bills/NMC-IPD-03311`);
    await film.click(page.getByTestId("caredesk-print"));
    await page.locator('[data-testid="pdf-preview"][data-pages="2"]').waitFor({ timeout: 30_000 });
  });
  await film.say("It runs onto two pages. The letterhead repeats, the page numbers update, and the totals appear once, after the last line.", async () => {
    await page.locator('[data-testid="pdf-preview"]').evaluate((node) => node.scrollTo({ top: node.scrollHeight * 0.55, behavior: "smooth" }));
    await film.sleep(2500);
  });
  await closeModal(film);
}
