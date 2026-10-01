// Checks your machine is ready:  pnpm doctor
import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let bad = 0;
const ok = (m) => console.log(`  \u2713 ${m}`);
const fail = (m, fix) => (bad++, console.log(`  \u2717 ${m}\n      fix: ${fix}`));
const warn = (m, why) => console.log(`  ! ${m}\n      ${why}`);

console.log("Open Reports - environment check\n");
const major = Number(process.versions.node.split(".")[0]);
major >= 22 ? ok(`Node ${process.versions.node}`) : fail(`Node ${process.versions.node} (need 22+)`, "install Node 22 LTS, e.g. via nvm or https://nodejs.org");
const pnpm = spawnSync("pnpm", ["--version"], { encoding: "utf-8" });
pnpm.status === 0 ? ok(`pnpm ${pnpm.stdout.trim()}`) : fail("pnpm not found", "corepack enable   (ships with Node)");

const fontDirs = ["/usr/share/fonts/truetype/noto", "/usr/share/fonts/noto", "/Library/Fonts", "/System/Library/Fonts/Supplemental", "C:\\Windows\\Fonts"];
const hasNoto = fontDirs.some((d) => existsSync(d) && readdirSync(d).some((f) => /NotoSans/i.test(f)));
hasNoto ? ok("Noto Sans fonts found") : fail("Noto Sans fonts not found - PDFs would use fallback glyphs and page breaks can differ", "Debian/Ubuntu: sudo apt-get install fonts-noto-core    macOS: brew install --cask font-noto-sans    (the Docker image already includes them)");

existsSync(resolve(root, "node_modules")) ? ok("dependencies installed") : fail("dependencies not installed", "pnpm install");
existsSync(resolve(root, "apps/server/dist/index.js")) ? ok("packages built") : fail("not built yet", "pnpm build:all");
existsSync(resolve(root, "apps/designer/dist/index.html")) ? ok("designer built") : warn("designer not built", "pnpm build:all (only needed for `pnpm start`; `pnpm dev` does not need it)");
spawnSync("pdftoppm", ["-v"]).status !== null ? ok("poppler-utils found (optional: visual regression tests)") : warn("poppler-utils not found", "optional - only the visual tests use it: apt-get install poppler-utils / brew install poppler");
console.log(bad ? `\n${bad} problem(s) to fix.` : "\nAll good. Run `pnpm start` (or `pnpm dev`).");
process.exit(bad ? 1 : 0);
