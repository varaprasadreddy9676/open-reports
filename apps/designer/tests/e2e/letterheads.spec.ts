import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = path.resolve("tests/fixtures/letterheads");
type Crop = { file: string; height: number };
type Fixture = { key: string; header: Crop; footer: Crop };
const { sources: fixtures, renderDpi } = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8")) as {
  sources: Fixture[];
  renderDpi: number;
};

for (const fixture of fixtures) {
  test(`real ${fixture.key} letterhead repeats on both A4 pages`, async ({ page }) => {
    test.setTimeout(90_000);
    const header = `data:image/png;base64,${fs.readFileSync(path.join(directory, fixture.header.file)).toString("base64")}`;
    const footer = `data:image/png;base64,${fs.readFileSync(path.join(directory, fixture.footer.file)).toString("base64")}`;
    await page.goto("/");
    await page.getByTestId("starter-blank").click();
    await page.evaluate(({ name, header, footer, headerHeight, footerHeight }) => {
      const store = (window as any).__designer.getState();
      store.setDoc({
        ...store.doc,
        name: `Letterhead fixture: ${name}`,
        page: { size: "A4", orientation: "portrait", unit: "mm", margin: { top: 0, right: 0, bottom: 0, left: 0 } },
        sections: [
          { type: "pageHeader", appliesTo: "standard", children: [{ id: `${name}-header`, type: "image", src: header, width: "210mm", height: `${headerHeight}mm` }] },
          { type: "detail", newPageAfter: true, children: [
            { id: `${name}-body-1`, type: "text", value: "Letterhead fixture body — page one", style: { fontSize: 12, padding: { top: 10, right: 15, bottom: 0, left: 15 } } },
          ] },
          { type: "detail", children: [
            { id: `${name}-body-2`, type: "text", value: "Letterhead fixture body — page two", style: { fontSize: 12, padding: { top: 10, right: 15, bottom: 0, left: 15 } } },
          ] },
          { type: "pageFooter", appliesTo: "standard", children: [{ id: `${name}-footer`, type: "image", src: footer, width: "210mm", height: `${footerHeight}mm` }] },
        ],
      });
    }, {
      name: fixture.key,
      header,
      footer,
      headerHeight: fixture.header.height * 25.4 / renderDpi,
      footerHeight: fixture.footer.height * 25.4 / renderDpi,
    });

    await page.getByTestId("mode-preview").click();
    await expect(page.getByTestId("pdf-info")).toContainText("2 pages");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-pdf").click()]);
    const outputDir = process.env.LETTERHEAD_OUTPUT_DIR;
    if (outputDir) fs.mkdirSync(outputDir, { recursive: true });
    const pdfFile = outputDir
      ? path.join(outputDir, `${fixture.key}-two-page-test.pdf`)
      : path.join(os.tmpdir(), `open-reports-${fixture.key}-${Date.now()}.pdf`);
    await download.saveAs(pdfFile);
    try {
      const pdfText = execFileSync("pdftotext", ["-layout", pdfFile, "-"], { encoding: "utf8" });
      const textPages = pdfText.split("\f").filter((text) => text.trim());
      expect(textPages).toHaveLength(2);
      expect(textPages[0]).toContain("Letterhead fixture body — page one");
      expect(textPages[1]).toContain("Letterhead fixture body — page two");
      const imageList = execFileSync("pdfimages", ["-list", pdfFile], { encoding: "utf8" }).trim().split("\n").slice(2);
      expect(imageList.filter((line) => /^\s*1\s+/.test(line))).toHaveLength(2);
      expect(imageList.filter((line) => /^\s*2\s+/.test(line))).toHaveLength(2);
    } finally {
      if (!outputDir) fs.unlinkSync(pdfFile);
    }
  });
}
