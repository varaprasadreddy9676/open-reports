import type { ResolvedComponent, ResolvedReport } from "@reporting/core";
import type { ReportSection } from "@reporting/schema";
import { layoutComponent } from "./box-layout.js";
import { defaultTextMeasurer, type TextMeasurer } from "./measure.js";
import { resolvePageGeometry } from "./units.js";
import type { PageLayout, PaginatedReport, PositionedNode } from "./types.js";

/** One band as drawn on the design surface. */
export interface StructureBand {
  sectionIndex: number;
  type: string;
  name: string;
  /** Position of the band's top edge in design-page coordinates (points) and its drawn height. */
  y: number;
  height: number;
  /** Band is collapsed to a title strip. */
  collapsed: boolean;
  /** The band has an explicit height (resizing sets it) rather than growing with its content. */
  fixedHeight: boolean;
  /** Which part of the page the band belongs to. */
  zone: "page-header" | "body" | "page-footer" | "background";
  groupId?: string;
  level?: number;
  hiddenByRule?: boolean;
  appliesTo?: string;
  /** Extra example records ("ghosts") shown for this band instead of the real one. */
  ghost?: boolean;
  /** Printed instance counter for details when several example records are shown. */
  instance?: number;
  node?: PositionedNode;
}

export interface StructureLayout extends PaginatedReport {
  bands: StructureBand[];
  /** Printable width in points (page width minus left/right margins). */
  contentWidth: number;
}

const MIN_BAND = 26;
const COLLAPSED = 20;

export const BAND_LABELS: Record<string, string> = {
  reportHeader: "Report Header",
  pageHeader: "Page Header",
  dataHeader: "Data Header",
  groupHeader: "Group Header",
  detail: "Detail",
  child: "Child Band",
  groupFooter: "Group Footer",
  dataFooter: "Data Footer",
  noData: "No Data",
  reportFooter: "Report Footer",
  pageFooter: "Page Footer",
  background: "Background",
  columnHeader: "Column Header",
  columnFooter: "Column Footer",
};

/**
 * Lays the report out as a *structure*: every band once, stacked in reading order (report header, page header, body bands,
 * report footer, page footer), on one tall design page. The designer renders this instead of paginated pages while you edit
 * the report's anatomy. `resolved` must come from `resolveReport(..., { design })`.
 */
export function layoutStructure(resolved: ResolvedReport, sections: ReportSection[], options: { measurer?: TextMeasurer } = {}): StructureLayout {
  const measurer = options.measurer ?? defaultTextMeasurer;
  const geometry = resolvePageGeometry(resolved.page);
  const width = geometry.contentWidth;

  type Item = { sectionIndex: number; comp: ResolvedComponent; zone: StructureBand["zone"] };
  const wrap = (sectionIndex: number, children: ResolvedComponent[], zone: StructureBand["zone"]): Item => {
    const s = sections[sectionIndex] ?? ({ type: "detail" } as ReportSection);
    const comp: any = {
      id: s.id,
      type: "container",
      layout: s.layout,
      height: s.height,
      minHeight: s.minHeight,
      gap: s.gap,
      alignItems: s.alignItems,
      justifyContent: s.justifyContent,
      columns: s.columns,
      style: s.style,
      children,
      band: { sectionIndex, sectionId: s.id, type: s.type, name: s.name },
    };
    return { sectionIndex, comp, zone };
  };

  const pageItems: Record<"pageHeader" | "pageFooter" | "background", Item[]> = { pageHeader: [], pageFooter: [], background: [] };
  for (const s of resolved.sections) {
    if (s.type === "pageHeader" || s.type === "pageFooter" || s.type === "background") {
      pageItems[s.type].push(wrap(s.sourceIndex, s.children, s.type === "pageHeader" ? "page-header" : s.type === "pageFooter" ? "page-footer" : "background"));
    }
  }
  const bodyItems: Item[] = (resolved.sections.find((s) => s.type === "body")?.children ?? []).map((c) => ({ sectionIndex: (c as any).band?.sectionIndex ?? -1, comp: c, zone: "body" as const }));

  // reading order: leading report headers, page headers, the rest of the body, page footers, background layer
  let lead = 0;
  while (lead < bodyItems.length && (bodyItems[lead]!.comp as any).band?.type === "reportHeader") lead++;
  const ordered: Item[] = [...bodyItems.slice(0, lead), ...pageItems.pageHeader, ...bodyItems.slice(lead), ...pageItems.pageFooter, ...pageItems.background];

  const bands: StructureBand[] = [];
  const nodes: PositionedNode[] = [];
  let y = geometry.margin.top;
  for (const it of ordered) {
    const s = sections[it.sectionIndex];
    const meta = (it.comp as any).band ?? {};
    const collapsed = Boolean(s?.collapsed);
    const node = layoutComponent(it.comp, { x: geometry.margin.left, y, width, height: 0 }, measurer);
    const fixed = s?.height !== undefined;
    let height = collapsed ? COLLAPSED : Math.max(node.box.height, MIN_BAND);
    if (!collapsed) node.box.height = height;
    bands.push({
      sectionIndex: it.sectionIndex,
      type: meta.type ?? s?.type ?? "detail",
      name: meta.name ?? s?.name ?? BAND_LABELS[meta.type ?? s?.type ?? "detail"] ?? "Band",
      y,
      height,
      collapsed,
      fixedHeight: fixed,
      zone: it.zone,
      groupId: meta.groupId,
      level: meta.level,
      hiddenByRule: meta.hiddenByRule,
      appliesTo: s?.appliesTo,
      node: collapsed ? undefined : node,
    });
    if (!collapsed) nodes.push(node);
    y += height;
  }
  const totalHeight = y + geometry.margin.bottom;
  const page: PageLayout = {
    number: 1,
    header: [],
    footer: [],
    background: [],
    content: nodes,
    zones: { header: { y: 0, height: 0 }, body: { y: geometry.margin.top, height: totalHeight - geometry.margin.top - geometry.margin.bottom }, footer: { y: totalHeight, height: 0 } },
    master: {},
  };
  return { pageSize: { width: geometry.width, height: totalHeight }, margin: geometry.margin, pages: [page], decisions: [], warnings: [], bands, contentWidth: width };
}
