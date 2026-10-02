import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const directory = path.resolve("tests/fixtures/letterheads");
type Crop = { file: string; width: number; height: number };
type Logo = Crop & { role: "left-brand" | "left-symbol" | "right-accreditation" };
type Fixture = { key: string; header: Crop; footer: Crop; logos: Logo[] };
const { sources: fixtures, renderDpi } = JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8")) as {
  sources: Fixture[];
  renderDpi: number;
};

for (const fixture of fixtures) {
  test(`real ${fixture.key} logos can form a new editable header`, async ({ page }) => {
    test.setTimeout(90_000);
    expect(fixture.logos.map((logo) => logo.role)).toEqual(["left-brand", "left-symbol", "right-accreditation"]);
    for (const logo of fixture.logos) {
      const bytes = fs.readFileSync(path.join(directory, logo.file));
      expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(bytes.readUInt32BE(16)).toBe(logo.width);
      expect(bytes.readUInt32BE(20)).toBe(logo.height);
    }
    const image = (role: Logo["role"]) => `data:image/png;base64,${fs.readFileSync(path.join(directory, fixture.logos.find((logo) => logo.role === role)!.file)).toString("base64")}`;
    const left = image("left-brand");
    const right = image("right-accreditation");
    await page.goto("/");
    await page.getByTestId("starter-blank").click();
    await page.evaluate(({ key, left, right }) => {
      const store = (window as any).__designer.getState();
      store.setDoc({
        ...store.doc,
        name: `${key} custom header`,
        page: { size: "A4", orientation: "portrait", unit: "mm", margin: { top: 10, right: 10, bottom: 10, left: 10 } },
        sections: [
          { type: "pageHeader", children: [{ id: `${key}-header-layout`, type: "container", layout: "absolute", width: "190mm", height: "36mm", children: [
            { id: `${key}-left-logo`, type: "image", src: left, x: "0mm", y: "0mm", width: "72mm", height: "30mm" },
            { id: `${key}-right-logo`, type: "image", src: right, x: "168mm", y: "0mm", width: "22mm", height: "30mm" },
            { id: `${key}-header-title`, type: "text", value: "Custom report header", x: "75mm", y: "12mm", width: "90mm", height: "15mm" },
          ] }] },
          { type: "detail", children: [{ id: `${key}-body`, type: "text", value: "Reusable logo fixture body" }] },
        ],
      });
    }, { key: fixture.key, left, right });
    await page.getByTestId("mode-preview").click();
    await expect(page.getByTestId("pdf-info")).toContainText("1 page");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-pdf").click()]);
    const outputDir = process.env.LETTERHEAD_OUTPUT_DIR;
    if (outputDir) fs.mkdirSync(outputDir, { recursive: true });
    const pdfFile = outputDir ? path.join(outputDir, `${fixture.key}-custom-logo-header.pdf`) : path.join(os.tmpdir(), `open-reports-logos-${fixture.key}-${Date.now()}.pdf`);
    await download.saveAs(pdfFile);
    try {
      expect(execFileSync("pdftotext", [pdfFile, "-"], { encoding: "utf8" })).toContain("Custom report header");
      const imageList = execFileSync("pdfimages", ["-list", pdfFile], { encoding: "utf8" }).trim().split("\n").slice(2);
      expect(imageList.filter((line) => /^\s*1\s+/.test(line))).toHaveLength(2);
    } finally {
      if (!outputDir) fs.unlinkSync(pdfFile);
    }
  });

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
