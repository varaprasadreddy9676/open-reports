import type { ResolvedComponent, ResolvedReport, ResolvedTableComponent, ResolvedSection } from "@reporting/core";
import type { TextMeasurer } from "./measure.js";
import { defaultTextMeasurer } from "./measure.js";
import { resolvePageGeometry } from "./units.js";
import { layoutComponent, measureFooterHeight, measureHeaderHeight, measureRowHeight, resolveColumnWidths } from "./box-layout.js";
import type { PageLayout, PaginatedReport, PositionedNode } from "./types.js";

export interface PaginateOptions {
  measurer?: TextMeasurer;
  /** Re-resolves a pageHeader/pageFooter/reportFooter section's components for a
   * specific page, with `page.number`/`page.total` bound to real values. If
   * omitted, the section's already-resolved (page-number-less) content is
   * repeated verbatim on every page. */
  resolvePageDependentSection?: (section: ResolvedSection, page: { number: number; total: number }) => ResolvedComponent[];
}

const REPEATING_HEADER = "pageHeader";
const REPEATING_FOOTER = "pageFooter";

export function paginate(report: ResolvedReport, options: PaginateOptions = {}): PaginatedReport {
  const measurer = options.measurer ?? defaultTextMeasurer;
  const geometry = resolvePageGeometry(report.page);
  const warnings: PaginatedReport["warnings"] = [...report.warnings];

  const pageHeaderSection = report.sections.find((s) => s.type === REPEATING_HEADER);
  const pageFooterSection = report.sections.find((s) => s.type === REPEATING_FOOTER);
  const contentSections = report.sections.filter((s) => s.type !== REPEATING_HEADER && s.type !== REPEATING_FOOTER);
  const contentComponents = contentSections.flatMap((s) => s.children);

  const placeholderHeader = pageHeaderSection?.children ?? [];
  const placeholderFooter = pageFooterSection?.children ?? [];
  const { height: headerHeight } = layoutBlock(placeholderHeader, geometry.contentWidth, measurer);
  const { height: footerHeight } = layoutBlock(placeholderFooter, geometry.contentWidth, measurer);
  const contentAreaHeight = geometry.contentHeight - headerHeight - footerHeight;

  if (contentAreaHeight <= 0) {
    warnings.push({ code: "PAGE_HEADER_FOOTER_TOO_LARGE", path: "page", message: "Page header/footer leave no room for content." });
  }

  const pagesContent = layoutContentIntoPages(contentComponents, geometry.contentWidth, Math.max(contentAreaHeight, 1), measurer, warnings);

  const pages: PageLayout[] = pagesContent.map((content, i) => {
    const pageNumber = i + 1;
    const total = pagesContent.length;

    const headerComponents = options.resolvePageDependentSection && pageHeaderSection
      ? options.resolvePageDependentSection(pageHeaderSection, { number: pageNumber, total })
      : placeholderHeader;
    const footerComponents = options.resolvePageDependentSection && pageFooterSection
      ? options.resolvePageDependentSection(pageFooterSection, { number: pageNumber, total })
      : placeholderFooter;

    const header = layoutBlock(headerComponents, geometry.contentWidth, measurer, { x: geometry.margin.left, y: geometry.margin.top }).nodes;
    const footer = layoutBlock(footerComponents, geometry.contentWidth, measurer, {
      x: geometry.margin.left,
      y: geometry.height - geometry.margin.bottom - footerHeight,
    }).nodes;

    const offsetContent = offsetNodes(content, geometry.margin.left, geometry.margin.top + headerHeight);

    return { number: pageNumber, header, footer, content: offsetContent };
  });

  return {
    pageSize: { width: geometry.width, height: geometry.height },
    margin: geometry.margin,
    pages: pages.length > 0 ? pages : [{ number: 1, header: [], footer: [], content: [] }],
    warnings,
  };
}

function layoutBlock(components: ResolvedComponent[], width: number, measurer: TextMeasurer, origin = { x: 0, y: 0 }) {
  let y = origin.y;
  const nodes: PositionedNode[] = [];
  for (const component of components) {
    const node = layoutComponent(component, { x: origin.x, y, width, height: 0 }, measurer);
    nodes.push(node);
    y += node.box.height;
  }
  return { nodes, height: y - origin.y };
}

function offsetNodes(nodes: PositionedNode[], dx: number, dy: number): PositionedNode[] {
  return nodes.map((node) => ({
    ...node,
    box: { ...node.box, x: node.box.x + dx, y: node.box.y + dy },
    children: node.children ? offsetNodes(node.children, dx, dy) : undefined,
  }));
}

/** The core pagination loop: walks components in order, placing each on the
 * current page if it fits, honoring pageBreakBefore/After and keepTogether,
 * and splitting tables row-by-row across pages (repeating the header on
 * continuation pages when `repeatHeaderOnPageBreak` is set). */
function layoutContentIntoPages(
  components: ResolvedComponent[],
  width: number,
  pageHeight: number,
  measurer: TextMeasurer,
  warnings: PaginatedReport["warnings"]
): PositionedNode[][] {
  const pages: PositionedNode[][] = [[]];
  let y = 0;

  const newPage = () => {
    pages.push([]);
    y = 0;
  };
  const currentPage = () => pages[pages.length - 1]!;
  const remaining = () => pageHeight - y;

  for (let idx = 0; idx < components.length; idx++) {
    const component = components[idx]!;
    if ((component as any).pageBreakBefore && y > 0) newPage();

    if ((component as any).keepWithNext && idx + 1 < components.length && y > 0) {
      const next = components[idx + 1]!;
      const thisNode = layoutComponent(component, { x: 0, y, width, height: 0 }, measurer);
      const nextNode = layoutComponent(next, { x: 0, y: y + thisNode.box.height, width, height: 0 }, measurer);
      const combinedHeight = thisNode.box.height + nextNode.box.height;
      const combinedFitsCurrent = combinedHeight <= remaining();
      const combinedFitsFreshPage = combinedHeight <= pageHeight;
      if (!combinedFitsCurrent && combinedFitsFreshPage) {
        newPage();
      }
    }

    if (component.type === "table" && !(component as any).keepTogether) {
      placeTable(component as ResolvedTableComponent, width, pageHeight, measurer, {
        place: (node, height) => {
          currentPage().push(node);
          y += height;
        },
        remaining,
        newPage,
      });
    } else if (component.type === "table") {
      // keepTogether on a table means "never split this table" -- treat it as
      // one atomic block like any other keepTogether component below, rather
      // than handing it to the row-splitting placer.
      const node = layoutComponent(component, { x: 0, y, width, height: 0 }, measurer);
      if (node.box.height > remaining() && node.box.height <= pageHeight && y > 0) newPage();
      const placed = layoutComponent(component, { x: 0, y, width, height: 0 }, measurer);
      const table = component as ResolvedTableComponent;
      currentPage().push({ ...placed, rowRange: { start: 0, end: table.rows.length } });
      y += placed.box.height;
    } else {
      const node = layoutComponent(component, { x: 0, y, width, height: 0 }, measurer);
      const fitsCurrent = node.box.height <= remaining();
      const fitsFreshPage = node.box.height <= pageHeight;

      if (!fitsCurrent) {
        if (component.keepTogether && fitsFreshPage) {
          newPage();
        } else if (!fitsFreshPage) {
          warnings.push({
            code: "CONTENT_OVERFLOWS_PAGE",
            path: component.id ?? component.type,
            message: `Component "${component.id ?? component.type}" is taller than a full page and will overflow; manual splitting of this component type is not yet supported.`,
          });
          if (y > 0) newPage();
        } else if (y > 0) {
          newPage();
        }
      }

      const placed = layoutComponent(component, { x: 0, y, width, height: 0 }, measurer);
      currentPage().push(placed);
      y += placed.box.height;
    }

    if ((component as any).pageBreakAfter) newPage();
  }

  // Drop a trailing empty page created by a forced break with nothing after it.
  if (pages.length > 1 && pages[pages.length - 1]!.length === 0) pages.pop();
  return pages;
}

interface TablePlacer {
  place(node: PositionedNode, height: number): void;
  remaining(): number;
  newPage(): void;
}

function placeTable(table: ResolvedTableComponent, width: number, pageHeight: number, measurer: TextMeasurer, placer: TablePlacer): void {
  const columnWidths = resolveColumnWidths(table, width);
  const headerHeight = table.showHeader ? measureHeaderHeight(table, measurer) : 0;
  const footerHeight = table.showFooter ? measureFooterHeight(table, measurer) : 0;

  const minBefore = (table as any).minRowsBeforeBreak ?? 0;
  const minAfter = (table as any).minRowsAfterBreak ?? 0;

  let rowIndex = 0;
  let sliceStart = 0;
  let isFirstSlice = true;
  let orphanPushAttempted = false;

  const flushSlice = (end: number, includeFooter: boolean) => {
    const showHeaderOnThisSlice = isFirstSlice ? table.showHeader : table.showHeader && table.repeatHeaderOnPageBreak;
    let height = showHeaderOnThisSlice ? headerHeight : 0;
    for (let i = sliceStart; i < end; i++) height += measureRowHeight(table, i, columnWidths, measurer);
    if (includeFooter) height += footerHeight;

    const node: PositionedNode = {
      component: { ...table, showHeader: showHeaderOnThisSlice, showFooter: includeFooter },
      box: { x: 0, y: 0, width, height },
      rowRange: { start: sliceStart, end },
    };
    placer.place(node, height);
    sliceStart = end;
    isFirstSlice = false;
    orphanPushAttempted = false;
  };

  const remainingRowsFitOnFreshPage = (fromIndex: number): boolean => {
    let height = table.showHeader && table.repeatHeaderOnPageBreak ? headerHeight : 0;
    for (let i = fromIndex; i < table.rows.length; i++) height += measureRowHeight(table, i, columnWidths, measurer);
    return height <= pageHeight;
  };

  let sliceHeight = table.showHeader ? headerHeight : 0;
  while (rowIndex < table.rows.length) {
    const rowHeight = measureRowHeight(table, rowIndex, columnWidths, measurer);
    const wouldOverflow = sliceHeight + rowHeight > placer.remaining();

    if (wouldOverflow && rowIndex > sliceStart) {
      // Orphan control: if breaking here would leave fewer than
      // minRowsBeforeBreak rows on this page, push the whole small group to
      // the next page instead (skip once per slice start to avoid looping).
      const roomRows = rowIndex - sliceStart;
      if (roomRows < minBefore && sliceStart > 0 && !orphanPushAttempted) {
        orphanPushAttempted = true;
        placer.newPage();
        sliceHeight = table.showHeader && table.repeatHeaderOnPageBreak ? headerHeight : 0;
        continue;
      }

      // Widow control: if what's left after this break is both small and is
      // the table's final page, pull a few rows back from this page so the
      // last page doesn't open with a lone stray row.
      let breakPoint = rowIndex;
      const remainder = table.rows.length - breakPoint;
      if (remainder > 0 && remainder < minAfter && remainingRowsFitOnFreshPage(breakPoint)) {
        const maxPullback = breakPoint - sliceStart - minBefore;
        const pullback = Math.min(minAfter - remainder, Math.max(0, maxPullback));
        breakPoint -= pullback;
      }

      flushSlice(breakPoint, false);
      placer.newPage();
      sliceHeight = table.showHeader && table.repeatHeaderOnPageBreak ? headerHeight : 0;
      rowIndex = breakPoint;
      continue;
    }
    if (wouldOverflow && rowIndex === sliceStart) {
      // A single row taller than a full page: place it anyway (keepRowTogether
      // cannot help here) rather than looping forever.
      placer.newPage();
      sliceHeight = table.showHeader && table.repeatHeaderOnPageBreak ? headerHeight : 0;
    }

    sliceHeight += rowHeight;
    rowIndex++;
  }

  const footerFits = sliceHeight + footerHeight <= placer.remaining();
  if (!footerFits && table.showFooter) {
    flushSlice(rowIndex, false);
    placer.newPage();
    flushSlice(rowIndex, true); // empty row range, footer-only slice
  } else {
    flushSlice(rowIndex, table.showFooter);
  }
}
