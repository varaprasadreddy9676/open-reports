import { describe, expect, it } from "vitest";
import type { ResolvedReport, ResolvedTableComponent } from "@reporting/core";
import { defaultTextMeasurer } from "../src/measure.js";
import { layoutComponent } from "../src/box-layout.js";
import { paginate } from "../src/paginate.js";

const box = { x: 0, y: 0, width: 300, height: 0 };
const text = (id: string, value: string, extra: Record<string, unknown> = {}) => ({ id, type: "text", text: value, ...extra }) as any;
const report = (children: any[], pageHeight = 300, extraSections: any[] = []): ResolvedReport => ({
  id: "free-placement", name: "Free placement", locale: "en", warnings: [],
  page: { size: "custom", width: 300, height: pageHeight, unit: "pt", orientation: "portrait", margin: { top: 0, right: 0, bottom: 0, left: 0 } },
  sections: [...extraSections, { type: "detail", sourceIndex: extraSections.length, children }],
}) as ResolvedReport;

function table(rows: number, extra: Record<string, unknown> = {}): ResolvedTableComponent {
  return {
    id: "items", type: "table", columns: [{ id: "name", header: "Name" }],
    rows: Array.from({ length: rows }, (_, i) => ({ raw: { name: `Row ${i}` }, formatted: { name: `Row ${i}` } })),
    showHeader: true, showFooter: false, repeatHeaderOnPageBreak: true, keepRowTogether: true, ...extra,
  } as ResolvedTableComponent;
}

describe("mixed free and flow placement", () => {
  it("an automatic-width free text fills only the space remaining after its x position", () => {
    const node = layoutComponent({ type: "container", layout: "absolute", children: [text("offset", "Bound field", { x: 120 })] } as any, box, defaultTextMeasurer);
    expect(node.children?.[0]?.box).toMatchObject({ x: 120, width: 180 });
  });

  it("automatic-width text in a page header fits after its x position", () => {
    const result = paginate(report([], 300, [{ type: "pageHeader", children: [text("header", "Client header", { x: 120, y: 0 })] }]));
    expect(result.pages[0]?.header[0]?.box).toMatchObject({ x: 120, width: 180 });
  });

  it("moves a row child without changing its sibling's measured position", () => {
    const row = { type: "row", children: [
      { id: "qr", type: "qrcode", value: "abc", width: 80, height: 80 },
      text("total", "Total", { width: 220 }),
    ] } as any;
    const original = layoutComponent(row, box, defaultTextMeasurer);
    const moved = layoutComponent({ ...row, children: [{ ...row.children[0], x: 40, y: 60 }, row.children[1]] }, box, defaultTextMeasurer);
    expect(moved.children?.[1]?.box).toEqual(original.children?.[1]?.box);
    expect(moved.children?.[0]?.box).toMatchObject({ x: 40, y: 60, width: 80, height: 80 });
    expect(moved.box.height).toBe(140);
  });

  it("keeps a flow child's slot when that child is moved freely", () => {
    const children = [text("first", "First"), text("move", "Move"), text("last", "Last")];
    const base = layoutComponent({ type: "container", children }, box, defaultTextMeasurer);
    const moved = layoutComponent({ type: "container", children: [children[0], { ...children[1], x: 100, y: 80 }, children[2]] }, box, defaultTextMeasurer);
    expect(moved.children?.[2]?.box.y).toBe(base.children?.[2]?.box.y);
    expect(moved.children?.[1]?.box).toMatchObject({ x: 100, y: 80 });
  });

  it("reserves explicit table height in the table box and subsequent flow", () => {
    const result = paginate(report([table(2, { height: 140 }), text("after", "After")]));
    const nodes = result.pages[0]!.content;
    const tableNode = nodes.find((node) => (node.component as any).id === "items")!;
    const afterNode = nodes.find((node) => (node.component as any).id === "after")!;
    expect(tableNode.box.height).toBe(140);
    expect(afterNode.box.y).toBeGreaterThanOrEqual(tableNode.box.y + 140);
  });

  it("keeps all table rows when a long band also contains a free item", () => {
    const band = { id: "detail-band", type: "container", layout: "flow", band: { type: "detail", sectionIndex: 0, allowSplit: true }, children: [
      { id: "qr", type: "qrcode", value: "abc", width: 50, height: 50, x: 180, y: 0 },
      table(40),
    ] } as any;
    const result = paginate(report([band], 220));
    const slices = result.pages.flatMap((page) => page.content).filter((node) => (node.component as any).id === "items");
    expect(result.pages.length).toBeGreaterThan(1);
    expect(slices[0]?.rowRange?.start).toBe(0);
    expect(slices.at(-1)?.rowRange?.end).toBe(40);
    expect(slices.reduce((count, slice) => count + slice.rowRange!.end - slice.rowRange!.start, 0)).toBe(40);
    expect(result.pages[0]!.content.some((node) => node.children?.some((child) => (child.component as any).id === "qr"))).toBe(true);
  });

  it("keeps a freely positioned long table paginated", () => {
    const band = { id: "detail-band", type: "container", layout: "flow", band: { type: "detail", sectionIndex: 0, allowSplit: true }, children: [
      table(40, { x: 15, y: 25 }),
      text("after", "After"),
    ] } as any;
    const result = paginate(report([text("intro", "Intro", { height: 20 }), band], 220));
    const flatten = (nodes: any[]): any[] => nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
    const slices = result.pages.flatMap((page) => flatten(page.content)).filter((node) => (node.component as any).id === "items");
    expect(result.pages.length).toBeGreaterThan(1);
    expect(slices.length).toBeGreaterThan(1);
    expect(slices[0]?.box).toMatchObject({ x: 15, y: 45 });
    expect(slices.every((slice) => slice.box.x === 15)).toBe(true);
    expect(slices.every((slice) => slice.box.y + slice.box.height <= result.pageSize.height)).toBe(true);
    expect(slices.reduce((count, slice) => count + (slice.rowRange?.end ?? 0) - (slice.rowRange?.start ?? 0), 0)).toBe(40);
  });

  it("places free page-header content at its coordinates", () => {
    const result = paginate(report([text("body", "Body")], 300, [{ type: "pageHeader", sourceIndex: 0, children: [text("logo", "Logo", { x: 90, y: 25 })] }]));
    expect(result.pages[0]!.header[0]!.box).toMatchObject({ x: 90, y: 25 });
    expect(result.pages[0]!.content[0]!.box.y).toBeGreaterThan(25);
  });
});
