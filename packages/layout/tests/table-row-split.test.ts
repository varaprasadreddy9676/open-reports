import { describe, expect, it } from "vitest";
import type { ResolvedReport, ResolvedTableComponent } from "@reporting/core";
import { paginate } from "../src/paginate.js";
import type { PositionedNode } from "../src/types.js";

// Default measurer: 10pt text has a 13pt line; a body row adds 4pt padding, the header row 6pt.
const longText = Array.from({ length: 30 }, (_, i) => `line${i}`).join("\n");

function table(rows: string[], extra: Partial<ResolvedTableComponent> = {}): ResolvedTableComponent {
  return {
    type: "table", id: "notes",
    columns: [{ id: "id", header: "Id", width: 40 }, { id: "note", header: "Note" }],
    rows: rows.map((note, i) => ({ raw: { id: i + 1, note }, formatted: { id: String(i + 1), note } })),
    showHeader: true, showFooter: false, repeatHeaderOnPageBreak: true, keepRowTogether: true, keepFooterTogether: true,
    minRowsBeforeBreak: 0, minRowsAfterBreak: 0, alternateRowStyle: true,
    ...extra,
  } as ResolvedTableComponent;
}

function report(t: ResolvedTableComponent, height = 200): ResolvedReport {
  return {
    id: "r", name: "R", locale: "en-US",
    page: { size: "custom", width: 300, height, unit: "pt", orientation: height < 300 ? "landscape" : "portrait", margin: { top: 0, right: 0, bottom: 0, left: 0 } } as any,
    sections: [{ type: "body", sourceIndex: -1, children: [t] }],
    warnings: [],
  };
}

const tableNodes = (pages: { content: PositionedNode[] }[]) => pages.map((p) => p.content.find((n) => n.component.type === "table")!);
const sliceRows = (node: PositionedNode) => {
  const t = node.component as ResolvedTableComponent;
  return t.rows.slice(node.rowRange!.start, node.rowRange!.end);
};

describe("table rows split across pages (allowRowSplit)", () => {
  it("refuses a row taller than a page unless splitting is allowed", () => {
    expect(() => paginate(report(table([longText])))).toThrow(/allowRowSplit/);
  });

  it("continues a tall row's lines on the next page, repeating the header", () => {
    const out = paginate(report(table(["short", longText, "after"], { allowRowSplit: true } as any)));
    expect(out.pages.length).toBeGreaterThan(1);
    const nodes = tableNodes(out.pages);
    const notes = nodes.flatMap((n) => sliceRows(n).map((r) => r.formatted.note));
    // Every line is printed exactly once, in order, and the following row is untouched.
    expect(notes.filter((n) => n !== "short" && n !== "after").join("\n")).toBe(longText);
    expect(notes[0]).toBe("short");
    expect(notes[notes.length - 1]).toBe("after");
    // The id cell prints on the first part only.
    const parts = nodes.flatMap(sliceRows).filter((r) => r.formatted.note.startsWith("line"));
    expect(parts[0]!.formatted.id).toBe("2");
    expect(parts.slice(1).every((r) => r.formatted.id === "")).toBe(true);
    for (const node of nodes.slice(1)) expect((node.component as ResolvedTableComponent).showHeader).toBe(true);
    // Each slice fits its page.
    for (const node of nodes) expect(node.box.y + node.box.height).toBeLessThanOrEqual(200 + 0.01);
    expect(out.decisions).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "row-split", componentId: "notes", rowIndex: 1 })]));
  });

  it("keeps the zebra stripe of the source row on every part, and of the rows after it", () => {
    const out = paginate(report(table(["short", longText, "after"], { allowRowSplit: true } as any)));
    const rows = tableNodes(out.pages).flatMap(sliceRows);
    expect(rows.map((r) => r.stripeIndex)).toEqual([0, ...rows.slice(1, -1).map(() => 1), 2]);
  });

  it("fills the rest of the page with a row that would fit on the next one", () => {
    const medium = Array.from({ length: 8 }, (_, i) => `m${i}`).join("\n");
    const filler = Array.from({ length: 9 }, (_, i) => `f${i}`);
    const whole = paginate(report(table([...filler, medium])));
    const split = paginate(report(table([...filler, medium], { allowRowSplit: true } as any)));
    expect(sliceRows(tableNodes(whole.pages)[0]!).length).toBe(9);
    expect(sliceRows(tableNodes(split.pages)[0]!).length).toBe(10);
    expect(sliceRows(tableNodes(split.pages)[0]!)[9]!.formatted.note.startsWith("m0")).toBe(true);
  });
});
