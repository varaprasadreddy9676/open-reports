// Chapter 10: the five integration routes, then where to start.
export async function run(film) {
  await film.card("list", {
    kicker: "RECAP · FIVE WAYS TO USE IT",
    title: "Pick the route that fits.",
    lines: [
      ["01", "Your app keeps the report file", "Read it, send report plus data to /api/v1/render. CareDesk."],
      ["02", "Your app keeps it per customer", "Same call, definition from your database. CareDesk branches."],
      ["03", "Open Reports stores the template", "Publish once, render by template ID. Ledgerline invoices."],
      ["04", "Drop in the viewer", "Search, print and downloads with no rendering code. Ledgerline statements."],
      ["05", "Embed the designer", "Your users edit layouts; saves come back to you. CareDesk."],
    ],
  }, 600);
  await film.say("Five ways to use it. Your application keeps the report file, or keeps one per customer, and sends it with the data. Or Open Reports stores published templates, and you render them by ID.");
  await film.say("Drop in the viewer for reading screens. And embed the designer, so your own users can change their documents, while your application keeps control of saving.");
  await film.hideCard();
  await film.card("end", {
    kicker: "OPEN SOURCE · MIT LICENSED",
    title: "Good data deserves<br><em>a good report.</em>",
    text: "Try the live demo, read the integration guide, and if this saves you a week of report work, star the repository.",
    links: ["open-reports-demo.onrender.com", "github.com/varaprasadreddy9676/open-reports"],
  }, 600);
  await film.say("Open Reports is free and open source. Try the live demo, read the integration guide, and if it saves you a week of report work, a star on GitHub helps other developers find it. Thanks for watching.");
  await film.sleep(2500);
}
