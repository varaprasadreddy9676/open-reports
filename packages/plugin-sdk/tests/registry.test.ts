import { describe, it, expect } from "vitest";
import { definePlugin, loadPlugins, PluginRegistry } from "../src/index.js";

const noopRenderer = { capabilities: { id: "x", mimeType: "text/plain", extension: "x", supports: ["*"] }, render: async () => ({ content: "", mimeType: "text/plain", extension: "x", warnings: [] }) };

describe("PluginRegistry", () => {
  it("registers renderers, functions, components, datasources and reports what each plugin provides", async () => {
    const reg = new PluginRegistry();
    const st = await reg.register(
      definePlugin({
        name: "p1",
        setup(api) {
          api.registerRenderer({ format: "rtf", renderer: noopRenderer, mimeType: "application/rtf", supports: ["text"] });
          api.registerExpressionFunction("double", (v) => Number(v) * 2);
          api.registerComponent("box", () => []);
          api.registerDataSource("nums", { execute: async () => ({ value: [] }) });
        },
      })
    );
    expect(st.state).toBe("active");
    expect(st.provides).toEqual({ renderers: ["rtf"], dataSources: ["nums"], functions: ["double"], components: ["box"], storage: false });
    expect(reg.expressionFunctions().double!(4)).toBe(8);
  });

  it("refuses to replace built-in formats and functions, and rolls the whole plugin back", async () => {
    const reg = new PluginRegistry();
    const st = await reg.register(
      definePlugin({
        name: "bad",
        setup(api) {
          api.registerExpressionFunction("fine", () => 1);
          api.registerExpressionFunction("upper", () => "hijacked");
        },
      })
    );
    expect(st.state).toBe("failed");
    expect(st.error).toMatch(/built-in function/);
    expect(reg.functions.has("fine")).toBe(false);

    const st2 = await reg.register(definePlugin({ name: "bad2", setup: (api) => api.registerRenderer({ format: "pdf", renderer: noopRenderer, mimeType: "x", supports: [] }) }));
    expect(st2.error).toMatch(/built-in format/);
  });

  it("rejects duplicate names and clashing registrations between plugins", async () => {
    const reg = new PluginRegistry();
    await reg.register(definePlugin({ name: "a", setup: (api) => api.registerComponent("badge", () => []) }));
    expect((await reg.register(definePlugin({ name: "a", setup() {} }))).error).toMatch(/already registered/);
    expect((await reg.register(definePlugin({ name: "b", setup: (api) => api.registerComponent("badge", () => []) }))).error).toMatch(/already provided/);
  });

  it("validates names and shapes", async () => {
    const reg = new PluginRegistry();
    expect((await reg.register(definePlugin({ name: "Bad Name", setup() {} }))).state).toBe("failed");
    expect((await reg.register(definePlugin({ name: "c", setup: (api) => api.registerRenderer({ format: "ok", renderer: {} as any, mimeType: "x", supports: [] }) }))).error).toMatch(/render\(\)/);
  });

  it("allows only one storage backend", async () => {
    const reg = new PluginRegistry();
    await reg.register(definePlugin({ name: "s1", setup: (api) => api.registerStorage({}) }));
    expect((await reg.register(definePlugin({ name: "s2", setup: (api) => api.registerStorage({}) }))).error).toMatch(/already registered/);
  });

  it("wraps plugin function errors with the function name, and disposes in reverse order", async () => {
    const order: string[] = [];
    const reg = new PluginRegistry();
    await reg.register(definePlugin({ name: "x1", setup: (api) => api.registerExpressionFunction("boom", () => { throw new Error("nope"); }), dispose: () => void order.push("x1") }));
    await reg.register(definePlugin({ name: "x2", setup() {}, dispose: () => void order.push("x2") }));
    expect(() => reg.expressionFunctions().boom!()).toThrow(/plugin function boom\(\) failed: nope/);
    await reg.dispose();
    expect(order).toEqual(["x2", "x1"]);
  });

  it("loadPlugins accepts a plugin, a factory with options, and isolates import failures", async () => {
    const reg = new PluginRegistry();
    const mods: Record<string, any> = {
      one: { default: definePlugin({ name: "one", setup() {} }) },
      two: { default: (o: any) => definePlugin({ name: `two-${o.suffix}`, setup() {} }) },
    };
    const res = await loadPlugins(["one", { module: "two", options: { suffix: "x" } }, "missing"], reg, async (id) => {
      if (!mods[id]) throw new Error(`Cannot find module ${id}`);
      return mods[id];
    });
    expect(res.map((r) => [r.name, r.state])).toEqual([["one", "active"], ["two-x", "active"], ["missing", "failed"]]);
  });
});
