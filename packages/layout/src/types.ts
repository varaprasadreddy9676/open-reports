import type { ResolvedComponent } from "@reporting/core";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedNode {
  component: ResolvedComponent;
  box: Box;
  children?: PositionedNode[];
  /** For a table split across pages: only this slice of `rows` is rendered on this page. */
  rowRange?: { start: number; end: number };
  /** Measured with the paginator's font metrics; lets visual clients draw table rows at the same heights. */
  tableMetrics?: { headerRowHeights: number[]; rowHeights: number[] };
  /** Text line advance measured by the same font engine that paginated this node. */
  textMetrics?: { lineHeight: number };
  /** A page fragment of a long flow text component. The source component stays intact. */
  textFragment?: { text: string; startLine: number; endLine: number; totalLines: number };
  /** Measured display value for explicit one-line ellipsis; source text remains intact. */
  renderText?: string;
}

export interface PageZones {
  header: { y: number; height: number };
  body: { y: number; height: number };
  footer: { y: number; height: number };
}

export interface PageLayout {
  number: number;
  header: PositionedNode[];
  footer: PositionedNode[];
  content: PositionedNode[];
  /** Background band content, drawn first (behind everything) on this page. */
  background: PositionedNode[];
  zones: PageZones;
  /** sourceIndex of the header/footer section (page master) used on this page. */
  master: { header?: number; footer?: number };
}

/** A recorded layout decision -- the answer to "why did this move to the next page?". */
export interface PaginationDecision {
  kind: "forced-break" | "keep-together" | "keep-with-next" | "cannot-split" | "table-split" | "text-split" | "row-split" | "orphan-control" | "widow-control" | "merged-cell" | "overflow" | "group-header-repeated" | "keep-chain" | "flow-break";
  /** The page the content moved onto (1-based). */
  page: number;
  componentId?: string;
  /** Source band for a decision made about an expanded band container. */
  sectionIndex?: number;
  sectionId?: string;
  message: string;
  /** Points needed vs. points left on the page it did not fit on. */
  required?: number;
  available?: number;
  rowIndex?: number;
  actions?: { label: string; patch: Record<string, unknown>; target?: "component" | "band" }[];
}

export interface PaginatedReport {
  pageSize: { width: number; height: number };
  margin: { top: number; right: number; bottom: number; left: number };
  pages: PageLayout[];
  decisions: PaginationDecision[];
  warnings: { code: string; path: string; message: string }[];
}
