// Chapter 4: replace the hand-made header with the hospital's shared letterhead, as a subreport.
import { STACK } from "../stack.mjs";
import { insert } from "./03-build-invoice.mjs";

export async function run(film, state) {
  const { page } = film;
  await film.click(page.getByTestId("mode-design"));
  await film.chapter("04", "Reuse a shared letterhead", "One header file for every invoice, receipt and lab report");
  await film.say("Hospitals print many documents with the same letterhead. Instead of rebuilding it in every report, keep it in one file and reuse it as a subreport.");

  const canvas = page.getByTestId("page-1");
  await film.say("First, remove the header we drew by hand. Select the logo, press Shift and Enter to select the row around it, and delete the row.", async () => {
    await film.click(canvas.locator("img").first());
    await page.keyboard.press("Shift+Enter");
    await film.sleep(700);
    await page.keyboard.press("Delete");
    await film.sleep(700);
  });

  await film.click(page.getByTestId("left-tab-layers"));
  await film.click(page.getByTestId("section-pageHeader").first());
  await insert(film, "palette-subreport");
  const chooser = page.waitForEvent("filechooser");
  await film.callout(`Choose file · <code>${state.libraryPath}</code>`, "path");
  await film.say("Now add a subreport, and choose the letterhead file from the hospital's report library. It holds the logo, the name, the address, and the accreditation seal.", async () => {
    await film.click(page.getByTestId("choose-subreport"));
    await (await chooser).setFiles(state.libraryPath);
    await page.getByTestId("subreport-file-status").waitFor();
  });
  await film.callout(null);

  await film.say("The letterhead has its own sample branding. We feed it this invoice's branding instead, so each branch prints its own name and logo.", async () => {
    await film.select(page.getByTestId("subreport-dataset"), "branding");
  });

  await film.say("The file is now attached inside the invoice. It travels with the report, so nothing else needs to be installed on the server.", async () => {
    await film.click(page.getByTestId("mode-code"));
    await film.sleep(2500);
  });
  await film.say("Preview again. The full letterhead is at the top of the page, and it will repeat on every page of a long bill.", async () => {
    await film.click(page.getByTestId("btn-preview"));
    await page.getByTestId("pdf-info").waitFor({ timeout: 30_000 });
  });
  await film.sleep(1800);
}

export const libraryFile = (dir) => `${dir}/northstar-header.report.json`;
export const LIBRARY_DIR = `${STACK.downloads.replace(/\/Downloads$/, "")}/Reports library`;
