// Starts the API server with the built designer served at the same origin:  pnpm start   ->  http://localhost:4000
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = resolve(root, "apps/server/dist/index.js");
const designer = resolve(root, "apps/designer/dist");
if (!existsSync(server) || !existsSync(designer)) {
  console.error("Not built yet. Run:  pnpm build:all");
  process.exit(1);
}
const env = { DESIGNER_DIST: designer, EXAMPLES_DIR: resolve(root, "examples"), DB_PATH: resolve(root, "data/reporting.sqlite"), ...process.env };
import("node:fs").then(({ mkdirSync }) => mkdirSync(resolve(root, "data"), { recursive: true }));
spawn(process.execPath, [server], { stdio: "inherit", env }).on("exit", (c) => process.exit(c ?? 0));
