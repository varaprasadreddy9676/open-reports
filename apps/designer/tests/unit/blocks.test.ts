import { describe, expect, it } from "vitest";
import { detachFragmentUse, fragmentUses, pinToVersion, placeBlock, setFragmentMode, syncLinkedBlocks } from "../../src/lib/blocks";
import { walkAll } from "../../src/model/ops";

const base = (): any => ({ schemaVersion: "1.0", id: "r", name: "r", sections: [{ type: "detail", children: [{ id: "title", type: "text", value: "Title" }] }] });
const v1 = { id: "letterhead", name: "Letterhead", version: 1, children: [{ id: "lh", type: "text", value: "V1" }] } as any;
const v2 = { ...v1, version: 2, children: [{ id: "lh", type: "text", value: "V2" }] };

describe("library block placement", () => {
  it("links a block through one shared fragment with its source and snapshot", () => {
    let { doc } = placeBlock(base(), v1, "linked", "title");
    ({ doc } = placeBlock(doc, v1, "linked", "title"));
    expect(doc.fragments).toEqual([{ id: "letterhead", name: "Letterhead", source: { block: "letterhead", version: 1, mode: "linked" }, children: v1.children }]);
    expect(fragmentUses(doc, "letterhead")).toBe(2);
  });

  it("keeps pinned versions apart and copies detached blocks with fresh ids", () => {
    let { doc } = placeBlock(base(), v1, "pinned");
    ({ doc } = placeBlock(doc, v2, "pinned"));
    expect(doc.fragments.map((f: any) => [f.id, f.source.version])).toEqual([["letterhead-v1", 1], ["letterhead-v2", 2]]);
    const detached = placeBlock(base(), v1, "detached", "title");
    expect(detached.ids).toHaveLength(1);
    expect(detached.ids[0]).not.toBe("lh");
    expect(detached.doc.fragments ?? []).toEqual([]);
  });

  it("brings linked fragments up to date and leaves pinned ones alone", () => {
    let { doc } = placeBlock(base(), v1, "linked");
    ({ doc } = placeBlock(doc, v1, "pinned"));
    const synced = syncLinkedBlocks(doc, [v2]);
    expect(synced.updated).toEqual(["Letterhead"]);
    expect(synced.doc.fragments.map((f: any) => [f.source.mode, f.source.version, f.children[0].value])).toEqual([["linked", 2, "V2"], ["pinned", 1, "V1"]]);
    expect(syncLinkedBlocks(synced.doc, [v2]).updated).toEqual([]);
  });

  it("switches modes and updates pinned versions", () => {
    let { doc } = placeBlock(base(), v1, "pinned");
    doc = setFragmentMode(doc, "letterhead-v1", "linked", v2);
    expect(doc.fragments[0].source).toEqual({ block: "letterhead", version: 2, mode: "linked" });
    expect(doc.fragments[0].children[0].value).toBe("V2");
    doc = setFragmentMode(doc, "letterhead-v1", "pinned");
    expect(doc.fragments[0].source.mode).toBe("pinned");
    ({ doc } = placeBlock(base(), v1, "pinned"));
    doc = pinToVersion(doc, "letterhead-v1", v2);
    expect(doc.fragments[0]).toMatchObject({ source: { version: 2, mode: "pinned" }, children: [{ value: "V2" }] });
  });

  it("detaches one use into editable components and removes the fragment when unused", () => {
    const placed = placeBlock(base(), v1, "linked", "title");
    const detached = detachFragmentUse(placed.doc, placed.ids[0]!);
    const comps = [...walkAll(detached.doc)].map((l: any) => l.comp);
    expect(comps.some((c: any) => c.type === "fragment")).toBe(false);
    expect(comps.find((c: any) => c.id === detached.ids[0])).toMatchObject({ type: "text", value: "V1" });
    expect(detached.doc.fragments).toEqual([]);
  });
});
