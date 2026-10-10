import React from "react";

/** Capability tiles. Each carries a small looping illustration of the feature it names. */
export function FeatureBento() {
  return <div className="bento" data-spotlight>
    <article className="bento-tile bento-data" data-reveal>
      <div className="bento-art" aria-hidden="true">
        <div className="bind-sources">{["JSON", "CSV", "REST", "SQL"].map((source, index) => <span key={source} style={{ "--i": index } as React.CSSProperties}>{source}</span>)}</div>
        <div className="bind-line" />
        <div className="bind-field"><code>{"{ data.invoice.total }"}</code><strong>5,150.00</strong></div>
      </div>
      <h3>Bring any data</h3><p>Bind JSON, CSV, REST or SQL. Add formulas, groups and running totals without writing code.</p>
    </article>
    <article className="bento-tile bento-layout" data-reveal>
      <div className="bento-art" aria-hidden="true">
        <div className="layout-ruler" /><div className="layout-guide layout-guide-x" /><div className="layout-guide layout-guide-y" />
        <div className="layout-box"><i /><i /><i /><i /></div><span className="layout-measure">24 mm</span>
      </div>
      <h3>Precise layout</h3><p>Rulers, guides, snapping and millimetre geometry.</p>
    </article>
    <article className="bento-tile bento-pages" data-reveal>
      <div className="bento-art" aria-hidden="true">{[3, 2, 1].map((page) => <div key={page} className="mini-page" style={{ "--i": page } as React.CSSProperties}><i /><i /><i /><i /><span>{page} / 3</span></div>)}</div>
      <h3>Paginates like print</h3><p>Repeating headers, page totals and clean row splitting across hundreds of pages.</p>
    </article>
    <article className="bento-tile bento-labels" data-reveal>
      <div className="bento-art" aria-hidden="true">
        <div className="label-card"><strong>SKU-20481</strong><div className="label-bars">{Array.from({ length: 34 }, (_, index) => <i key={index} style={{ "--i": index, width: `${1 + ((index * 5) % 3)}px` } as React.CSSProperties} />)}</div><code>^XA^FO40,40^BCN^XZ</code></div>
      </div>
      <h3>Labels, receipts, barcodes</h3><p>ZPL and ESC/POS for thermal printers, as well as PDF.</p>
    </article>
    <article className="bento-tile bento-crosstab" data-reveal>
      <div className="bento-art" aria-hidden="true"><div className="heat">{Array.from({ length: 24 }, (_, index) => <i key={index} style={{ "--i": index, "--v": ((index * 37) % 100) / 100 } as React.CSSProperties} />)}</div></div>
      <h3>Crosstabs and drill-down</h3><p>Pivot, sort, search and drill through in the interactive viewer.</p>
    </article>
    <article className="bento-tile bento-embed" data-reveal>
      <div className="bento-art" aria-hidden="true"><code className="embed-tag"><span>&lt;open-report-designer</span><span>  save-mode=<em>"host"</em>&gt;</span><span>&lt;/open-report-designer&gt;</span></code></div>
      <h3>Embed the designer</h3><p>Your app owns the JSON. One tag gives your users a full designer.</p>
    </article>
  </div>;
}
