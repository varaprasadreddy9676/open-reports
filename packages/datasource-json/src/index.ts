import path from "node:path";
import fs from "node:fs/promises";
import type { DatasetDefinition } from "@reporting/schema";
import type { DataSet, DataSource, ExecutionContext } from "@reporting/core";

export interface JsonDataSourceOptions {
  /** Local JSON files may only be read from inside this directory (and its
   * subdirectories) -- resolved absolute paths that escape it are rejected,
   * which is what keeps `filePath` from being a path-traversal vector. */
  rootDir: string;
}

function getPath(obj: unknown, dotted: string | undefined): unknown {
  if (!dotted) return obj;
  return dotted.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

/** Resolves a dataset backed by a local JSON file or an inline JSON string,
 * as opposed to @reporting/core's built-in InlineDataSource (which only
 * handles data already embedded as a JS value in the report definition). */
export class JsonDataSource implements DataSource {
  readonly id = "json";

  constructor(private options: JsonDataSourceOptions) {}

  async execute(definition: DatasetDefinition, _context: ExecutionContext): Promise<DataSet> {
    const query = (definition.query ?? {}) as { filePath?: string; json?: string; path?: string };

    let value: unknown;
    if (query.filePath) {
      const safe = this.resolveSafePath(query.filePath);
      // follow symlinks: a link inside the root that points outside must not leak files
      const [realFile, realRoot] = await Promise.all([fs.realpath(safe), fs.realpath(path.resolve(this.options.rootDir))]);
      if (realFile !== realRoot && !realFile.startsWith(realRoot + path.sep)) {
        throw new Error(`Refusing to read "${query.filePath}": resolves outside the allowed JSON data directory.`);
      }
      value = JSON.parse(await fs.readFile(realFile, "utf-8"));
    } else if (query.json) {
      value = JSON.parse(query.json);
    } else {
      value = null;
    }

    return { value: getPath(value, query.path) as DataSet["value"] };
  }

  private resolveSafePath(filePath: string): string {
    const root = path.resolve(this.options.rootDir);
    const resolved = path.resolve(root, filePath);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw new Error(`Refusing to read "${filePath}": resolves outside the allowed JSON data directory.`);
    }
    return resolved;
  }
}
