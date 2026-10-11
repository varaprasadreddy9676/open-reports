// Bundles the MCP server and everything it needs into one file, dist/open-reports-mcp.mjs, which the
// Open Reports server offers for download (Settings → AI tools). Users need only Node.js 18+ to run it.
import { build } from "esbuild";
import { readFile } from "node:fs/promises";

const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
await build({
  entryPoints: [new URL("../src/cli.ts", import.meta.url).pathname],
  outfile: new URL("../dist/open-reports-mcp.mjs", import.meta.url).pathname,
  bundle: true,
  platform: "node",
  target: "node18",
  format: "esm",
  minify: true,
  legalComments: "eof",
  // Some dependencies are CommonJS; give them a require() inside the ES module.
  banner: { js: `// Open Reports MCP server ${version} · MIT licensed · https://github.com/varaprasadreddy9676/open-reports\nimport { createRequire as __orCreateRequire } from "node:module"; const require = __orCreateRequire(import.meta.url);` },
  define: { "process.env.OPEN_REPORTS_MCP_VERSION": JSON.stringify(version) },
});
console.log("Bundled dist/open-reports-mcp.mjs");

// A manifest of the tools in this bundle, so the Open Reports server can describe them without importing
// the MCP packages (it serves the bundle as a plain file).
const { TOOLS } = await import("@reporting/ai-tools");
const { LOCAL_TOOLS } = await import("../dist/local-tools.js");
const describe = (local) => (tool) => ({ name: tool.name, description: tool.description, readOnly: tool.readOnly, destructive: Boolean(tool.destructive), local });
const { writeFile } = await import("node:fs/promises");
await writeFile(new URL("../dist/open-reports-mcp.tools.json", import.meta.url), `${JSON.stringify({ version, requires: "Node.js 18 or newer", tools: [...TOOLS.map(describe(false)), ...LOCAL_TOOLS.map(describe(true))] }, null, 2)}\n`);
console.log("Wrote dist/open-reports-mcp.tools.json");
