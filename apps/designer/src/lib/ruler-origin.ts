import type { PositionedNode } from "@reporting/layout";
import type { EngineResult } from "../engine";
import type { CanvasView, RulerOrigin } from "../store";
import type { Doc } from "../model/ops";
import { bandIndexOf } from "../model/ops";

export interface RulerAnchor {
  x: number;
  y: number;
  available: boolean;
  label: string;
}

export interface RulerAnchorContext {
  doc: Doc;
  engine: EngineResult;
  canvasView: CanvasView;
  selection: string[];
  selectedBand: number | null;
}

function* nodes(items: PositionedNode[]): Generator<PositionedNode> {
  for (const item of items) {
    yield item;
    if (item.children) yield* nodes(item.children);
  }
}

/** The origin is a visual measurement anchor; report coordinates stay page-relative. */
export function rulerAnchor(origin: RulerOrigin, context: RulerAnchorContext): RulerAnchor {
  const { doc, engine, canvasView, selection, selectedBand } = context;
  const layout = canvasView === "structure" ? engine.structure ?? engine.paginated : engine.paginated;
  const unavailable = (label: string): RulerAnchor => ({ x: 0, y: 0, available: false, label });
  if (!layout) return unavailable("Page edge until the report renders");
  if (origin === "page") return { x: 0, y: 0, available: true, label: "Page edge" };
  if (origin === "printable") return { x: layout.margin.left, y: layout.margin.top, available: true, label: "Inside margins" };

  if (origin === "section") {
    const index = selectedBand ?? (selection.length === 1 ? bandIndexOf(doc, selection[0]!) : -1);
    const band = canvasView === "structure" ? engine.structure?.bands.find((item) => item.sectionIndex === index && !item.ghost) : undefined;
    return band
      ? { x: layout.margin.left, y: band.y, available: true, label: "Selected band" }
      : unavailable("Page edge until a band is selected in Structure view");
  }

  if (!selection.length) return unavailable("Page edge until an element is selected");
  const first = layout.pages[0];
  if (!first) return unavailable("Page edge until a selected element is visible on this page");
  const found = new Map<string, PositionedNode>();
  const selected = new Set(selection);
  for (const item of nodes([...first.header, ...first.content, ...first.footer])) {
    const id = (item.component as { id?: string }).id;
    if (id && selected.has(id) && !found.has(id)) found.set(id, item);
  }
  if (found.size !== selected.size) return unavailable("Page edge until every selected element is visible on this page");
  return {
    x: Math.min(...[...found.values()].map((item) => item.box.x)),
    y: Math.min(...[...found.values()].map((item) => item.box.y)),
    available: true,
    label: selection.length === 1 ? "Selected element" : "Selection bounds",
  };
}
