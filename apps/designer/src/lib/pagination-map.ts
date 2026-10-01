import type { PaginatedReport, PositionedNode, StructureLayout, PaginationDecision } from "@reporting/layout";
import { bandIndexOf, type Doc } from "../model/ops";

export interface StructurePageStart {
  /** 1-based page number in the real paginated report. */
  page: number;
  sectionIndex: number;
  /** Position of the corresponding band in the one-record structure drawing. */
  y: number;
  /** Zero-based record/table-row index, when known. */
  rowIndex?: number;
  bandName: string;
  decisions: PaginationDecision[];
}

function* nodes(list: PositionedNode[]): Generator<PositionedNode> {
  for (const node of list) {
    yield node;
    if (node.children) yield* nodes(node.children);
  }
}

/** Maps page starts to source bands. Repeated headers are skipped so the marker points at new content. */
export function structurePageStarts(doc: Doc, paginated: PaginatedReport, structure: StructureLayout): StructurePageStart[] {
  const result: StructurePageStart[] = [];
  for (let pageIndex = 1; pageIndex < paginated.pages.length; pageIndex++) {
    const page = paginated.pages[pageIndex]!;
    const content = [...nodes(page.content)];
    const first = content.find((node) => !(node.component as any).band?.repeated && sourceBand(doc, node) >= 0)
      ?? content.find((node) => sourceBand(doc, node) >= 0);
    if (!first) continue;
    const sectionIndex = sourceBand(doc, first);
    const band = structure.bands.find((b) => b.sectionIndex === sectionIndex);
    if (!band) continue;
    const meta = (first.component as any).band;
    result.push({
      page: pageIndex + 1,
      sectionIndex,
      y: band.y,
      rowIndex: first.rowRange?.start ?? meta?.rowIndex,
      bandName: band.name,
      decisions: paginated.decisions.filter((d) => d.page === pageIndex + 1),
    });
  }
  return result;
}

function sourceBand(doc: Doc, node: PositionedNode): number {
  const meta = (node.component as any).band;
  if (typeof meta?.sectionIndex === "number" && meta.sectionIndex >= 0) return meta.sectionIndex;
  const id = (node.component as any).id;
  return id ? bandIndexOf(doc, id) : -1;
}
