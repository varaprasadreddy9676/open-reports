// Chapter 3: build the hospital invoice from a blank page in the real designer.
import { bills, renderData } from "../../training-videos/fixtures/caredesk/data.mjs";
import { STACK } from "../stack.mjs";

export async function insert(film, testId, search) {
  const { page } = film;
  await film.click(page.getByTestId("left-tab-insert"), { pause: 250 });
  if (search) await page.getByLabel("Search components or report sections").fill(search);
  await film.click(page.getByTestId(testId));
  if (search) await page.getByLabel("Search components or report sections").fill("");
}

async function styleText(film, size, bold = false, align) {
  const { page } = film;
  await film.click(page.getByTestId("element-tab-style"), { pause: 250 });
  if (size) await film.fill(page.getByLabel("Font size"), String(size), { pause: 150 });
  if (bold) await film.select(page.getByLabel("Font weight"), "bold");
  if (align) await film.click(page.getByTestId(`align-${align}`), { pause: 200 });
  await film.click(page.getByTestId("element-tab-content"), { pause: 200 }).catch(() => undefined);
}

async function fieldText(film, binding, size, bold) {
  const { page } = film;
  await insert(film, "palette-text");
  await film.click(page.getByTestId("value-mode-field"), { pause: 250 });
  await film.select(page.getByTestId("value-field"), binding);
  if (size) await styleText(film, size, bold);
}

export async function formulaText(film, formula, size, bold, align) {
  const { page } = film;
  await insert(film, "palette-text");
  await film.click(page.getByTestId("value-mode-formula"), { pause: 250 });
  await film.fill(page.getByTestId("formula-input"), formula, { pause: 300 });
  if (size || align) await styleText(film, size, bold, align);
}

export async function run(film) {
  const { page } = film;
  const sample = renderData(bills[0], "http://127.0.0.1:3002");
  await film.goto(STACK.designer);
  await film.chapter("03", "Build the invoice from a blank page", "Logo, patient details, services table, totals and page numbers");
  await film.say("This is Open Reports. It runs in the browser, so there is nothing to install. We will start with an empty A4 page.", async () => {
    await film.click(page.getByTestId("starter-blank"));
    await page.getByTestId("page-1").waitFor();
  });
  await film.fill(page.getByRole("textbox", { name: /report name/i }), "Hospital invoice");

  await film.say("First, the data. CareDesk will send two things with every invoice: the bill, and the branch's branding. We paste a sample of each, so the designer knows the field names.", async () => {
    await film.click(page.getByTestId("left-tab-data"));
  });
  for (const [id, value, line] of [
    ["invoice", sample.invoice, "The invoice sample has the patient, the visit, every service line, and the amounts."],
    ["branding", sample.branding, "The branding sample has the hospital name, address, and logo links."],
  ]) {
    await film.click(page.getByTestId("add-dataset").first());
    await film.fill(page.getByTestId("dataset-id"), id);
    await film.fill(page.getByTestId("dataset-json"), JSON.stringify(value, null, 2));
    await film.say(line, async () => {
      await film.click(page.getByTestId("dataset-test"));
      await page.getByTestId("dataset-result").waitFor();
    });
    await film.click(page.getByTestId("dataset-save"));
  }

  await film.say("Amounts should print in rupees, so we set the report's locale and currency once.", async () => {
    await film.click(page.getByTestId("report-tab-details"));
    await film.click(page.getByRole("button", { name: /Locale & theme/ }));
    await film.fill(page.getByLabel("Locale", { exact: true }), "en-IN", { pause: 150 });
    await film.fill(page.getByLabel("Currency", { exact: true }), "INR", { pause: 150 });
  });

  await film.say("Now the layout. A page header repeats at the top of every page. We add the hospital logo and name.", async () => {
    await insert(film, "palette-section-pageHeader");
  });
  await insert(film, "palette-row", "row");
  await insert(film, "palette-image");
  await film.fill(page.getByLabel("Image path or URL"), "http://127.0.0.1:3002/assets/northstar-logo.png");
  await film.fill(page.getByLabel("Width", { exact: true }), "40", { pause: 150 });
  await film.fill(page.getByLabel("Height", { exact: true }), "40", { pause: 150 });
  await insert(film, "palette-text");
  await film.fill(page.getByTestId("value-text"), "NORTHSTAR MEDICAL CENTER");
  await styleText(film, 15, true);

  await film.say("The body holds this one bill. Instead of typing a name, we bind fields from the data. When CareDesk sends another bill, these show that patient instead.", async () => {
    await film.click(page.getByTestId("left-tab-layers"));
    await film.click(page.getByTestId("section-detail").first());
  });
  await fieldText(film, "data.invoice.patient.name", 13, true);
  await formulaText(film, "\"UHID \" + data.invoice.patient.uhid + \" · \" + data.invoice.visit + \" · \" + data.invoice.doctor");

  await film.say("The services table repeats once for every line on the bill. We point it at the items, and let the designer create the columns from the sample.", async () => {
    await insert(film, "palette-table");
    await film.select(page.getByTestId("table-dataset"), "invoice.items");
    await film.click(page.getByTestId("generate-columns"));
  });

  await film.say("Totals go in a report footer, which appears once, after the last line. Each total is a small formula that formats the amount as rupees.", async () => {
    await insert(film, "palette-section-reportFooter");
  });
  await formulaText(film, "\"Subtotal: \" + formatCurrency(data.invoice.subtotal)", undefined, false, "right");
  await formulaText(film, "\"Discount: \" + formatCurrency(data.invoice.discount)", undefined, false, "right");
  await formulaText(film, "\"Balance due: \" + formatCurrency(data.invoice.balance)", 13, true, "right");

  await film.say("Last, a page footer with page numbers. It repeats on every page, so a long hospital stay still prints page one of two, and page two of two.", async () => {
    await insert(film, "palette-section-pageFooter");
  });
  await formulaText(film, "\"Page \" + page.number + \" of \" + page.total");

  await film.say("Preview runs the real renderer. This is the actual PDF, with the same fonts and page breaks CareDesk will get.", async () => {
    await film.click(page.getByTestId("btn-preview"));
    await page.getByTestId("pdf-info").waitFor({ timeout: 30_000 });
  });
  await film.sleep(1500);
  if (film.dry) console.log(JSON.stringify(await page.evaluate(() => window.__designer.getState().doc.sections.map((section) => [section.type, section.dataset ?? "", (section.children ?? []).map((child) => child.type)]))));
}
