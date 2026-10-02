import { useId, useState, type ReactNode } from "react";

/** One disclosure pattern for report, band, and component inspectors. */
export function InspectorSection({ title, children, open = true, summary }: { title: string; children: ReactNode; open?: boolean; summary?: string }) {
  const [expanded, setExpanded] = useState(open);
  const bodyId = useId();
  return <section className="prop-section">
    <button type="button" className="prop-section-title" aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpanded(!expanded)}>
      <span className="prop-section-chevron" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
      <span>{title}</span>
      {!expanded && summary && <span className="prop-section-meta">{summary}</span>}
    </button>
    {expanded && <div id={bodyId} className="prop-body">{children}</div>}
  </section>;
}
