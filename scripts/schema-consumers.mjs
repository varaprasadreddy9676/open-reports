#!/usr/bin/env node
// Fails when the report schema advertises a field that nothing in the engine reads.
//
// Every key in the built zod schema must appear (as a property or quoted name) in at least one
// engine source file: core, expressions, layout, the renderers, the datasources, or the server.
// The designer and the schema itself do not count: exposing a field is not consuming it.
// Fields that are known to be inert today are listed in PLANNED with the reason; an entry that
// becomes consumed also fails, so the list cannot go stale. Requires `pnpm -r --filter "./packages/**" build`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Authoring metadata that only the designer is meant to read; it never changes output. */
const DESIGN_ONLY = {
  guides: "ruler guides drawn on the design canvas",
  locked: "design-canvas edit lock for sections, components and guides",
  printerType: "print profile: drives designer safe-area/barcode checks and preview choice",
  language: "print profile: selects the designer's PDF/ZPL/ESC-POS preview; export format is chosen per render",
  safeMargin: "print profile: designer safe-area warnings",
  // report.migration: the JRXML import's review record, listed in the designer's Migration panel; never printed.
  migration: "import review record shown in the designer's Migration panel",
  sourceFormat: "import review record: format the report was converted from",
  converted: "import review record: count of converted source elements",
  "needs-review": "import review record: count of elements that need review",
  unsupported: "import review record: count of unsupported source elements",
  feature: "import review record: source feature an issue refers to",
  targetId: "import review record: component an issue was mapped to",
};

/** Known inert fields (gap analysis P0-7): implement them or remove them from the schema, designer and docs, then delete the entry. */
const PLANNED = {};

const CONSUMER_DIRS = [
  "packages/core/src",
  "packages/expressions/src",
  "packages/layout/src",
  ...fs.readdirSync(path.join(root, "packages")).filter((name) => /^(renderer|datasource)-/.test(name)).map((name) => `packages/${name}/src`),
  "apps/server/src",
  // The schema's own migration and validation read fields such as schemaVersion.
  "packages/schema/src/migrate.ts",
  "packages/schema/src/validate.ts",
];

const schemaEntry = path.join(root, "packages/schema/dist/index.js");
if (!fs.existsSync(schemaEntry)) {
  console.error("schema-consumers: build @reporting/schema first (packages/schema/dist is missing).");
  process.exit(2);
}
const schema = await import(pathToFileURL(schemaEntry).href);

/** field name -> the schema paths that declare it */
const fields = new Map();
const seen = new Set();
function walk(type, where) {
  if (!type || typeof type !== "object" || !type._def) return;
  if (seen.has(type)) return;
  seen.add(type);
  const def = type._def;
  switch (def.typeName) {
    case "ZodObject": {
      for (const [key, child] of Object.entries(def.shape())) {
        if (!fields.has(key)) fields.set(key, new Set());
        fields.get(key).add(where);
        walk(child, `${where}.${key}`);
      }
      return;
    }
    case "ZodLazy": return walk(def.getter(), where);
    case "ZodEffects": return walk(def.schema, where);
    case "ZodArray": return walk(def.type, `${where}[]`);
    case "ZodRecord": return walk(def.valueType, `${where}{}`);
    case "ZodIntersection": walk(def.left, where); return walk(def.right, where);
    case "ZodUnion":
    case "ZodDiscriminatedUnion": {
      for (const option of def.options instanceof Map ? def.options.values() : def.options) walk(option, where);
      return;
    }
    case "ZodTuple": return def.items.forEach((item, index) => walk(item, `${where}[${index}]`));
    default:
      if (def.innerType) return walk(def.innerType, where);
      if (def.in) { walk(def.in, where); return walk(def.out, where); }
  }
}
walk(schema.reportDefinitionSchema, "report");

const sources = [];
const collect = (dir) => {
  if (!fs.existsSync(dir)) return;
  if (fs.statSync(dir).isFile()) return void sources.push(fs.readFileSync(dir, "utf8"));
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) sources.push(fs.readFileSync(full, "utf8"));
  }
};
for (const dir of CONSUMER_DIRS) collect(path.join(root, dir));
const corpus = sources.join("\n");

const escape = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const consumed = (name) => new RegExp(`(\\.${escape(name)}\\b|["'\`]${escape(name)}["'\`]|\\b${escape(name)}\\s*[:,}=]|\\?\\.${escape(name)}\\b)`).test(corpus);

const unexpected = [];
const stale = [];
for (const [name, where] of [...fields].sort(([a], [b]) => a.localeCompare(b))) {
  const used = consumed(name);
  if (name in DESIGN_ONLY) continue;
  if (!used && !(name in PLANNED)) unexpected.push(`  ${name}  (declared at ${[...where].slice(0, 3).join(", ")})`);
  if (used && name in PLANNED) stale.push(`  ${name}  (${PLANNED[name]})`);
}
for (const name of [...Object.keys(PLANNED), ...Object.keys(DESIGN_ONLY)]) if (!fields.has(name)) stale.push(`  ${name}  (no longer in the schema)`);

if (unexpected.length) console.error(`Schema fields that no engine code reads (implement them, remove them, or add them to PLANNED with a reason):\n${unexpected.join("\n")}`);
if (stale.length) console.error(`PLANNED entries that are now consumed or removed (delete them from the list):\n${stale.join("\n")}`);
if (unexpected.length || stale.length) process.exit(1);
console.log(`schema-consumers: ${fields.size} schema field names checked; ${Object.keys(DESIGN_ONLY).length} are design-only and ${Object.keys(PLANNED).length} known inert fields are listed as planned.`);
