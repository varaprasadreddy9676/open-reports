import type { ResolvedReport } from "./resolved-report.js";
import type { PageSectionResolver } from "./pipeline.js";

export interface RendererCapabilities {
  id: string;
  mimeType: string;
  extension: string;
  /** Component type names this renderer draws; "*" means "everything". */
  supports: string[];
}

export interface RenderInput {
  resolved: ResolvedReport;
  resolvePageSection: PageSectionResolver;
}

export interface RenderResult {
  content: Buffer | string;
  mimeType: string;
  extension: string;
  warnings: { code: string; path: string; message: string }[];
}

/**
 * Implemented by every output format (@reporting/renderer-pdf, -html, -xlsx,
 * -csv, and any third-party renderer plugin). A renderer only ever sees a
 * Resolved Report Tree -- it never runs SQL, calls a REST API, or computes a
 * business formula itself; all of that already happened in @reporting/core's
 * pipeline (see spec sections 82-83, the "separation of concerns" rule this
 * interface exists to enforce).
 */
export interface ReportRenderer {
  readonly capabilities: RendererCapabilities;
  render(input: RenderInput): Promise<RenderResult>;
}
