import { useMemo, useState } from "react";
import type { PaginatedReport, StructureLayout } from "@reporting/layout";
import { structurePageStarts } from "../lib/pagination-map";
import { savePref, useStore } from "../store";
import { PageBreakDetails } from "./PageBreakDetails";

/** Miniatures of the real paginated output, kept alongside the structure drawing. */
export function StructurePageStrip({ paginated }: { paginated: PaginatedReport }) {
  const scale = 78 / paginated.pageSize.width;
  const [explainedPage, setExplainedPage] = useState<number | null>(null);
  return <nav className="structure-page-strip" aria-label="Paginated pages" data-testid="structure-page-strip">
    <span className="muted small">Sample pages</span>
    {paginated.pages.map((page, index) => <div key={index} className="structure-page-entry">
      <button className="structure-page-thumb" data-testid="structure-page-thumb" aria-label={`View page ${index + 1}`} onClick={() => {
        savePref("canvasView", "pages");
        useStore.getState().set({ canvasView: "pages" });
        requestAnimationFrame(() => document.querySelector(`[data-page="${index}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
      }}>
        <span className="structure-page-mini" style={{ width: paginated.pageSize.width * scale, height: paginated.pageSize.height * scale }}>
          {[...page.header, ...page.content, ...page.footer].map((node, i) => <span key={i} className="structure-page-box" style={{ left: node.box.x * scale, top: node.box.y * scale, width: Math.max(1, node.box.width * scale), height: Math.max(1, node.box.height * scale) }} />)}
        </span>
        <span>Page {index + 1}</span>
      </button>
      {index > 0 && <button className="structure-page-why" data-testid={`structure-page-why-${index + 1}`} aria-expanded={explainedPage === index + 1} onClick={() => setExplainedPage(explainedPage === index + 1 ? null : index + 1)}>Why?</button>}
    </div>)}
    {explainedPage !== null && <div className="structure-page-reason" data-testid="structure-page-reason">
      <PageBreakDetails paginated={paginated} pageNumber={explainedPage} />
    </div>}
  </nav>;
}

/** One line per source band where real pages start; repeated records are listed in its explanation. */
export function StructureBreakLayer({ structure, paginated, k }: { structure: StructureLayout; paginated: PaginatedReport; k: number }) {
  const doc = useStore((s) => s.doc);
  const [openSection, setOpenSection] = useState<number | null>(null);
  const starts = useMemo(() => structurePageStarts(doc, paginated, structure), [doc, paginated, structure]);
  const groups = useMemo(() => {
    const bySection = new Map<number, typeof starts>();
    for (const start of starts) bySection.set(start.sectionIndex, [...(bySection.get(start.sectionIndex) ?? []), start]);
    return [...bySection.entries()];
  }, [starts]);
  return <>
    {groups.map(([sectionIndex, pages]) => {
      const first = pages[0]!;
      const open = openSection === sectionIndex;
      return <div key={sectionIndex} className="structure-break" data-testid="structure-break-marker" style={{ top: first.y * k }} onPointerDown={(e) => e.stopPropagation()}>
        <button className="structure-break-label" aria-expanded={open} onClick={() => setOpenSection(open ? null : sectionIndex)}>
          {pages.length === 1 ? `Page ${first.page} starts` : `${pages.length} pages start`} in {first.bandName}
        </button>
        {open && <div className="structure-break-popover" data-testid="structure-break-popover" onPointerDown={(e) => e.stopPropagation()}>
          <strong>Why pages start here</strong>
          {pages.map((start) => <div key={start.page} className="structure-break-detail" data-testid="structure-break-detail"><PageBreakDetails paginated={paginated} pageNumber={start.page} /></div>)}
        </div>}
      </div>;
    })}
  </>;
}
