import type { Component, DataSource, ReportRenderer } from "@reporting/core";
import type { CustomComponentExpander } from "@reporting/core";
import { buildDefaultFunctions, type ExpressionFunction } from "@reporting/expressions";

export const PLUGIN_API_VERSION = 1;

/** What an output format can express; the designer uses this to warn before you export. */
export interface RendererRegistration {
  format: string;
  renderer: ReportRenderer;
  mimeType: string;
  /** Component types the renderer draws, or ["*"] for everything. */
  supports: string[];
}

export interface PluginStorage {
  /** Opaque to the SDK: the host (apps/server) validates it against its StorageProvider interface. */
  provider: unknown;
}

/** Everything a plugin may register. Plugins never receive the host's internals, only this surface. */
export interface PluginApi {
  readonly apiVersion: number;
  /** Adds an output format, e.g. "docx" or "escpos". Cannot replace a built-in format. */
  registerRenderer(registration: RendererRegistration): void;
  /** Adds a dataset source type. Reports reference it as `source: "plugin:<name>"`. */
  registerDataSource(name: string, dataSource: Omit<DataSource, "id">): void;
  /** Adds an expression function. Pure and synchronous; cannot shadow a built-in. */
  registerExpressionFunction(name: string, fn: ExpressionFunction, doc?: string): void;
  /** Adds a reusable component used as `{ type: "custom", kind, props }`. `expand` returns ordinary components. */
  registerComponent(kind: string, expand: CustomComponentExpander, meta?: { description?: string; props?: Record<string, string> }): void;
  /** Replaces the template storage backend (at most one plugin may do this). */
  registerStorage(provider: unknown): void;
  log(message: string): void;
}

export interface ReportPlugin {
  /** Unique, lowercase, e.g. "acme-badges". */
  name: string;
  version?: string;
  description?: string;
  /** Register extensions. May be async. Throwing disables this plugin only. */
  setup(api: PluginApi): void | Promise<void>;
  /** Release resources on shutdown. */
  dispose?(): void | Promise<void>;
}

export type PluginFactory = (options?: Record<string, unknown>) => ReportPlugin | Promise<ReportPlugin>;

/** Identity helper that gives plugin authors type checking and autocomplete. */
export function definePlugin(plugin: ReportPlugin): ReportPlugin {
  return plugin;
}

export interface PluginStatus {
  name: string;
  version?: string;
  description?: string;
  state: "active" | "failed";
  error?: string;
  provides: { renderers: string[]; dataSources: string[]; functions: string[]; components: string[]; storage: boolean };
}

export class PluginRegistry {
  readonly renderers = new Map<string, RendererRegistration>();
  readonly dataSources = new Map<string, Omit<DataSource, "id">>();
  readonly functions = new Map<string, ExpressionFunction>();
  readonly functionDocs = new Map<string, string>();
  readonly components = new Map<string, { expand: CustomComponentExpander; description?: string; props?: Record<string, string> }>();
  storage: unknown;
  readonly statuses: PluginStatus[] = [];
  private readonly plugins: ReportPlugin[] = [];
  private readonly reserved: { formats: Set<string>; functions: Set<string> };
  private readonly logger: (message: string) => void;

  constructor(options: { builtinFormats?: string[]; logger?: (message: string) => void } = {}) {
    this.reserved = { formats: new Set(options.builtinFormats ?? ["pdf", "html", "xlsx", "csv", "zpl"]), functions: new Set(Object.keys(buildDefaultFunctions({}))) };
    this.logger = options.logger ?? (() => undefined);
  }

  /** Runs setup. A failing plugin is rolled back completely and reported; the others keep working. */
  async register(plugin: ReportPlugin): Promise<PluginStatus> {
    const provides: PluginStatus["provides"] = { renderers: [], dataSources: [], functions: [], components: [], storage: false };
    const status: PluginStatus = { name: plugin.name, version: plugin.version, description: plugin.description, state: "active", provides };
    const staged = {
      renderers: new Map<string, RendererRegistration>(),
      dataSources: new Map<string, Omit<DataSource, "id">>(),
      functions: new Map<string, ExpressionFunction>(),
      docs: new Map<string, string>(),
      components: new Map<string, { expand: CustomComponentExpander; description?: string; props?: Record<string, string> }>(),
      storage: undefined as unknown,
      hasStorage: false,
    };
    try {
      if (!plugin?.name || !/^[a-z0-9][a-z0-9._-]*$/.test(plugin.name)) throw new Error(`Plugin name "${plugin?.name}" must be lowercase letters, digits, dots, dashes or underscores.`);
      if (this.statuses.some((s) => s.name === plugin.name)) throw new Error(`A plugin named "${plugin.name}" is already registered.`);
      const clash = (kind: string, name: string, existing: boolean) => {
        if (existing) throw new Error(`${kind} "${name}" is already provided.`);
      };
      const api: PluginApi = {
        apiVersion: PLUGIN_API_VERSION,
        registerRenderer: (r) => {
          if (!/^[a-z0-9][a-z0-9-]*$/.test(r.format)) throw new Error(`Renderer format "${r.format}" must be lowercase letters, digits or dashes.`);
          if (this.reserved.formats.has(r.format)) throw new Error(`"${r.format}" is a built-in format and cannot be replaced.`);
          clash("Renderer", r.format, this.renderers.has(r.format) || staged.renderers.has(r.format));
          if (typeof r.renderer?.render !== "function") throw new Error(`Renderer "${r.format}" must implement render().`);
          staged.renderers.set(r.format, r);
        },
        registerDataSource: (name, ds) => {
          if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error(`Datasource name "${name}" is invalid.`);
          clash("Datasource", name, this.dataSources.has(name) || staged.dataSources.has(name));
          if (typeof ds?.execute !== "function") throw new Error(`Datasource "${name}" must implement execute().`);
          staged.dataSources.set(name, ds);
        },
        registerExpressionFunction: (name, fn, doc) => {
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Function name "${name}" is invalid.`);
          if (this.reserved.functions.has(name)) throw new Error(`"${name}" is a built-in function and cannot be replaced.`);
          clash("Function", name, this.functions.has(name) || staged.functions.has(name));
          staged.functions.set(name, fn);
          if (doc) staged.docs.set(name, doc);
        },
        registerComponent: (kind, expand, meta) => {
          if (!/^[A-Za-z0-9._-]+$/.test(kind)) throw new Error(`Component kind "${kind}" is invalid.`);
          clash("Component", kind, this.components.has(kind) || staged.components.has(kind));
          staged.components.set(kind, { expand, ...meta });
        },
        registerStorage: (provider) => {
          if (this.storage !== undefined || staged.hasStorage) throw new Error("A storage backend is already registered.");
          staged.storage = provider;
          staged.hasStorage = true;
        },
        log: (m) => this.logger(`[plugin:${plugin.name}] ${m}`),
      };
      await plugin.setup(api);
      // commit
      for (const [k, v] of staged.renderers) (this.renderers.set(k, v), provides.renderers.push(k));
      for (const [k, v] of staged.dataSources) (this.dataSources.set(k, v), provides.dataSources.push(k));
      for (const [k, v] of staged.functions) (this.functions.set(k, v), provides.functions.push(k));
      for (const [k, v] of staged.docs) this.functionDocs.set(k, v);
      for (const [k, v] of staged.components) (this.components.set(k, v), provides.components.push(k));
      if (staged.hasStorage) ((this.storage = staged.storage), (provides.storage = true));
      this.plugins.push(plugin);
    } catch (err) {
      status.state = "failed";
      status.error = err instanceof Error ? err.message : String(err);
      status.provides = { renderers: [], dataSources: [], functions: [], components: [], storage: false };
      this.logger(`[plugin:${plugin?.name ?? "?"}] failed: ${status.error}`);
    }
    this.statuses.push(status);
    return status;
  }

  /** Expression functions wrapped so one misbehaving plugin function reports its name instead of an opaque error. */
  expressionFunctions(): Record<string, ExpressionFunction> {
    const out: Record<string, ExpressionFunction> = {};
    for (const [name, fn] of this.functions) {
      out[name] = (...args) => {
        try {
          return fn(...args);
        } catch (err) {
          throw new Error(`plugin function ${name}() failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      };
    }
    return out;
  }

  componentExpanders(): Map<string, CustomComponentExpander> {
    return new Map([...this.components].map(([k, v]) => [k, v.expand]));
  }

  async dispose(): Promise<void> {
    for (const p of [...this.plugins].reverse()) {
      try {
        await p.dispose?.();
      } catch (err) {
        this.logger(`[plugin:${p.name}] dispose failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    this.plugins.length = 0;
  }
}

export type { Component };

/** A plugin spec in configuration: a module path/package name, optionally with options. */
export interface PluginSpec {
  module: string;
  options?: Record<string, unknown>;
}

/** Imports plugin modules (default export: a plugin, or a factory returning one) and registers them. */
export async function loadPlugins(specs: (string | PluginSpec)[], registry: PluginRegistry, importer: (id: string) => Promise<any> = (id) => import(id)): Promise<PluginStatus[]> {
  const out: PluginStatus[] = [];
  for (const raw of specs) {
    const spec = typeof raw === "string" ? { module: raw } : raw;
    try {
      const mod = await importer(spec.module);
      const exported = mod?.default ?? mod?.plugin ?? mod;
      const plugin: ReportPlugin = typeof exported === "function" ? await (exported as PluginFactory)(spec.options) : exported;
      out.push(await registry.register(plugin));
    } catch (err) {
      const status: PluginStatus = { name: spec.module, state: "failed", error: err instanceof Error ? err.message : String(err), provides: { renderers: [], dataSources: [], functions: [], components: [], storage: false } };
      registry.statuses.push(status);
      out.push(status);
    }
  }
  return out;
}
