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
}

export interface PageLayout {
  number: number;
  header: PositionedNode[];
  footer: PositionedNode[];
  content: PositionedNode[];
}

export interface PaginatedReport {
  pageSize: { width: number; height: number };
  margin: { top: number; right: number; bottom: number; left: number };
  pages: PageLayout[];
  warnings: { code: string; path: string; message: string }[];
}
