// Renders card.html to docs/images/social-preview.png (1280 x 640): the repo's link preview image.
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.join(here, "../../apps/designer/package.json"))("@playwright/test");
const browser = await chromium.launch({ args: ["--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
await page.goto(`file://${path.join(here, "card.html")}`);
await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode())); });
await page.screenshot({ path: path.join(here, "../../docs/images/social-preview.png") });
await browser.close();
console.log("docs/images/social-preview.png");
