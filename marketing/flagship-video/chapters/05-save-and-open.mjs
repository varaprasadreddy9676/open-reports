// Chapter 5: save the report as a file on this computer, then open it again from that file.
import path from "node:path";
import { STACK } from "../stack.mjs";

export async function run(film, state) {
  const { page } = film;
  await film.chapter("05", "Save it to your computer, open it again", "A report is a plain JSON file you own");
  await film.say("Reports are plain JSON files. You can keep them in Git, share them, or hand them to your application.");

  let download;
  await film.say("Export the report file from the menu.", async () => {
    await film.click(page.getByTestId("btn-more"));
    await film.click(page.getByTestId("btn-export"));
    [download] = await Promise.all([page.waitForEvent("download"), film.click(page.getByTestId("export-definition"))]);
  });
  state.invoiceFile = path.join(STACK.downloads, "hospital-invoice.report.json");
  await download.saveAs(state.invoiceFile);
  await film.callout(`Saved · <code>${state.invoiceFile}</code>`, "path");
  await film.say("It is saved in Downloads, as hospital invoice dot report dot JSON.");
  await film.callout(null);

  await film.say("To prove the file is complete, go back Home and open it again from the file browser.", async () => {
    await film.click(page.getByRole("button", { name: "Home", exact: true }));
    await film.click(page.getByTestId("home-open"));
  });
  const input = page.getByLabel("Open report JSON file");
  await film.callout(`Open file · <code>${state.invoiceFile}</code>`, "path");
  await film.say("Choose the file we just saved.", async () => {
    await film.aim(input);
    await input.setInputFiles(state.invoiceFile);
  });
  await film.say("Open Reports checks before replacing work that only exists in this browser. We have the file, so replace it.", async () => {
    await film.click(page.getByRole("button", { name: "Replace report" }));
    await page.getByTestId("page-1").waitFor({ timeout: 20_000 });
  });
  await film.callout(null);
  await film.say("Everything came back: the data samples, the letterhead subreport, the table, and the totals. Opening a file does not change anything on the server until you choose to save it.");
  await film.sleep(1200);
}
