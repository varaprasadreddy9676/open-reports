import { describe, expect, it } from "vitest";
import { pagesFromHtml } from "../src/more-tools.js";

describe("pagesFromHtml", () => {
  it("returns each page's text in order, with images and table cells marked", () => {
    const html = `<body><section class="page" style="width:10px"><img src="data:x" alt="Hospital logo" style="top:1px" /><div style="top:2px">NORTHSTAR &amp; SONS</div><table><tr><th>Service</th><th>Amount</th></tr><tr><td>ECG</td><td>₹400.00</td></tr></table></section><section class="page"><div>Page 2 of 2</div></section></body>`;
    expect(pagesFromHtml(html)).toEqual(["[image: Hospital logo]\nNORTHSTAR & SONS\nService | Amount\nECG | ₹400.00", "Page 2 of 2"]);
  });

  it("truncates very long pages with a marker", () => {
    const [page] = pagesFromHtml(`<section class="page"><div>${"x".repeat(50)}</div></section>`, 10);
    expect(page).toBe("xxxxxxxxxx\n…(page text truncated)");
  });
});
