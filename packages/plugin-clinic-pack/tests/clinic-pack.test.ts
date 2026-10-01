import { describe, it, expect } from "vitest";
import { PluginRegistry } from "@reporting/plugin-sdk";
import plugin from "../src/index.js";

async function loaded() {
  const reg = new PluginRegistry();
  const st = await reg.register(plugin);
  expect(st.state).toBe("active");
  return reg;
}

describe("clinic-pack", () => {
  it("initials and maskId", async () => {
    const f = (await loaded()).expressionFunctions();
    expect(f.initials!("sai varaprasad reddy")).toBe("SVR");
    expect(f.initials!(null)).toBe("");
    expect(f.maskId!("UH12345", 3)).toBe("••••345");
    expect(f.maskId!("AB", 3)).toBe("AB");
  });

  it("statusBadge expands to a styled container and falls back to the info tone", async () => {
    const reg = await loaded();
    const expand = reg.componentExpanders().get("statusBadge")!;
    const ok = expand({ text: "OK", tone: "ok" }, {} as any) as any[];
    expect(ok[0].children[0].value).toBe("OK");
    expect(ok[0].style.background).toBe("#dcfce7");
    expect((expand({ text: "x", tone: "??" }, {} as any) as any[])[0].style.background).toBe("#dbeafe");
  });

  it("number-range datasource is bounded", async () => {
    const reg = await loaded();
    const ds = reg.dataSources.get("number-range")!;
    const r: any = await ds.execute({ id: "n", source: "plugin:number-range", query: { from: 5, to: 7 } } as any, {} as any);
    expect(r.value).toEqual([{ n: 5 }, { n: 6 }, { n: 7 }]);
    const big: any = await ds.execute({ id: "n", source: "plugin:number-range", query: { from: 1, to: 1e9 } } as any, {} as any);
    expect(big.value.length).toBeLessThanOrEqual(100_001);
  });
});
