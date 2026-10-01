import { describe, it, expect } from "vitest";
import { applyPatch, resolvePointer, summarizeChanges } from "../src/patch.js";

const doc = () => ({
  id: "r", name: "R",
  sections: [{ type: "detail", children: [
    { type: "text", id: "title", value: "Hello", style: { fontSize: 12 } },
    { type: "container", id: "box", children: [{ type: "text", id: "inner", value: "x" }] },
  ] }],
});

describe("applyPatch", () => {
  it("addresses components by id, not by index", () => {
    const r = applyPatch(doc(), [{ op: "replace", path: "#title/style/fontSize", value: 20 }, { op: "replace", path: "#inner/value", value: "y" }]);
    expect(r.ok).toBe(true);
    expect(r.doc.sections[0].children[0].style.fontSize).toBe(20);
    expect(r.doc.sections[0].children[1].children[0].value).toBe("y");
    expect(resolvePointer(doc(), "#inner/value")).toBe("/sections/0/children/1/children/0/value");
  });

  it("adds components inside a container and assigns ids", () => {
    const r = applyPatch(doc(), [{ op: "add", path: "#box/children/-", value: { type: "text", value: "new" } }, { op: "add", path: "#box/children/-", value: { type: "qrcode", value: "q" } }]);
    const kids = r.doc.sections[0].children[1].children;
    expect(kids).toHaveLength(3);
    expect(kids[1].id).toMatch(/^text-/);
    expect(kids[2].id).toMatch(/^qrcode-/);
    expect(new Set(kids.map((k: any) => k.id)).size).toBe(3);
  });

  it("supports remove, move and copy", () => {
    let r = applyPatch(doc(), [{ op: "move", from: "#inner", path: "/sections/0/children/-" }]);
    expect(r.doc.sections[0].children.map((c: any) => c.id)).toEqual(["title", "box", "inner"]);
    r = applyPatch(doc(), [{ op: "copy", from: "#title", path: "/sections/0/children/-" }, { op: "remove", path: "#box" }]);
    expect(r.doc.sections[0].children).toHaveLength(2);
  });

  it("is atomic: one bad op leaves the original untouched and reports which op failed", () => {
    const original = doc();
    const r = applyPatch(original, [{ op: "replace", path: "#title/value", value: "changed" }, { op: "replace", path: "#nope/value", value: 1 }]);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatchObject({ index: 1 });
    expect(r.errors[0]!.message).toMatch(/No component with id "nope"/);
    expect(r.doc).toEqual(original);
    expect(original.sections[0].children[0].value).toBe("Hello");
  });

  it("refuses prototype paths and whole-document replacement; replace needs an existing target", () => {
    expect(applyPatch(doc(), [{ op: "add", path: "/__proto__/polluted", value: 1 }]).ok).toBe(false);
    expect(({} as any).polluted).toBeUndefined();
    expect(applyPatch(doc(), [{ op: "replace", path: "", value: {} }]).ok).toBe(false);
    expect(applyPatch(doc(), [{ op: "replace", path: "#title/missing", value: 1 }]).ok).toBe(false);
  });

  it("test op guards a patch against stale state", () => {
    expect(applyPatch(doc(), [{ op: "test", path: "#title/value", value: "Goodbye" }, { op: "replace", path: "#title/value", value: "z" }]).ok).toBe(false);
    expect(applyPatch(doc(), [{ op: "test", path: "#title/value", value: "Hello" }, { op: "replace", path: "#title/value", value: "z" }]).ok).toBe(true);
  });

  it("summarizeChanges lists added, changed and removed components", () => {
    const after = applyPatch(doc(), [{ op: "replace", path: "#title/value", value: "Hi" }, { op: "remove", path: "#inner" }, { op: "add", path: "#box/children/-", value: { type: "line" } }]).doc;
    const s = summarizeChanges(doc(), after);
    expect(s).toContain('changed text "title": value');
    expect(s).toContain('removed text "inner"');
    expect(s.some((x) => x.startsWith("added line"))).toBe(true);
  });
});
