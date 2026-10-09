import React, { useMemo, useState } from "react";
import { STARTERS } from "../../lib/templates";
import { Icon } from "./Icons";

const FEATURED = ["invoice", "retail-invoice", "account-statement", "crosstab", "label-50x30", "discharge-summary"];
const PREVIEWS = new Set([...FEATURED, "receipt-58mm", "lab-report", "sticker-sheet", "education-progress-report", "logistics-manifest", "manufacturing-work-order"]);
const CATEGORIES = ["Featured", "All templates", "Documents", "Industries", "Healthcare", "Printing", "Data"];

export function TemplateGallery({ onExample }: { onExample: (key: string) => void }) {
  const [category, setCategory] = useState("Featured");
  const [query, setQuery] = useState("");
  const templates = useMemo(() => STARTERS.filter((item) => {
    const matches = `${item.name} ${item.description} ${item.group} ${item.key}`.toLowerCase().includes(query.trim().toLowerCase());
    return matches && (Boolean(query.trim()) || category === "All templates" || (category === "Featured" ? FEATURED.includes(item.key) : item.group === category));
  }).sort((a, b) => category === "Featured" && !query.trim() ? FEATURED.indexOf(a.key) - FEATURED.indexOf(b.key) : a.name.localeCompare(b.name)), [category, query]);
  return <section className="landing-gallery landing-container" id="templates" aria-labelledby="template-heading">
    <div className="landing-section-heading"><div><p className="landing-eyebrow">A HEAD START FOR EVERY IDEA</p><h2 id="template-heading">Don't start from scratch.</h2></div><p>Real reports. Sample data included.<br />Open one and make it your own.</p></div>
    <div className="gallery-controls">
      <div className="gallery-filters" role="group" aria-label="Template categories">{CATEGORIES.map((item) => <button key={item} aria-pressed={category === item} onClick={() => { setCategory(item); setQuery(""); }}>{item}</button>)}</div>
      <label className="gallery-search"><Icon name="search" /><input data-testid="starter-search" aria-label="Search templates" placeholder="Find a template…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    </div>
    <div className="gallery-results" aria-live="polite"><span>{templates.length} {templates.length === 1 ? "template" : "templates"}{query.trim() ? ` for “${query.trim()}”` : " to explore"}</span>{query && <button onClick={() => setQuery("")}>Clear search</button>}</div>
    <div className="landing-template-grid">
      {templates.map((item, index) => <button className={`landing-template template-tone-${index % 4}`} data-testid={`starter-${item.key}`} key={item.key} onClick={() => onExample(item.key)}>
        <div className={`template-preview preview-${item.group.toLowerCase()}`}>
          <span className="template-category">{item.group}</span>
          {PREVIEWS.has(item.key) ? <img src={`/landing/reports/${item.key}.webp`} alt="" loading="lazy" width="680" height="960" /> : <div className="template-paper-art" aria-hidden="true"><div /><strong>{item.name}</strong><span /><span /><i /><span /><span /><span /></div>}
          <span className="template-open">Open in designer <Icon name="arrow" /></span>
        </div>
        <div className="template-description"><h3>{item.name}</h3><p>{item.description}</p><span>Editable example <Icon name="arrow" /></span></div>
      </button>)}
    </div>
    {!templates.length && <div className="gallery-empty"><Icon name="search" /><h3>No matching templates</h3><p>Try invoice, receipt, label, or a different category.</p><button className="landing-button secondary" onClick={() => { setQuery(""); setCategory("All templates"); }}>See all templates</button></div>}
    {category === "Featured" && !query.trim() && <div className="template-index">
      <div className="template-index-heading"><h3>More starting points</h3><button className="landing-text-link" onClick={() => setCategory("All templates")}>Browse the full gallery <Icon name="arrow" /></button></div>
      <div>{STARTERS.filter((item) => !FEATURED.includes(item.key)).map((item) => <button key={item.key} data-testid={`starter-${item.key}`} onClick={() => onExample(item.key)}><span>{item.name}<small>{item.group}</small></span><Icon name="arrow" /></button>)}</div>
    </div>}
  </section>;
}
