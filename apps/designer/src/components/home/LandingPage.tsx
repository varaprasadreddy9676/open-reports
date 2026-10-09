import React, { useEffect, useRef, useState } from "react";
import { loadDraft, useStore } from "../../store";
import { isPublicDemo } from "../../lib/report-file";
import { BrandMark, Icon } from "./Icons";
import { ReportShowcase } from "./ReportShowcase";
import { TemplateGallery } from "./TemplateGallery";
import "./landing.css";

const REPO = "https://github.com/varaprasadreddy9676/open-reports";
const FEEDBACK = `${REPO}/issues/new?template=1-feedback.yml`;
const OUTPUTS = ["PDF", "Word", "Excel", "HTML", "CSV", "ZPL", "ESC/POS"];

export function LandingPage({ onExample, onTemplate, children }: { onExample: (key: string) => void; onTemplate: (key: string) => void; children: React.ReactNode }) {
  const doc = useStore((state) => state.doc);
  const set = useStore((state) => state.set);
  const interfaceTheme = useStore((state) => state.interfaceTheme);
  const setInterfaceTheme = useStore((state) => state.setInterfaceTheme);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const hasDraft = Boolean(loadDraft()?.doc);
  const closeMenu = () => setMenuOpen(false);
  useEffect(() => {
    if (!menuOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !header.current?.contains(event.target)) setMenuOpen(false);
    };
    window.addEventListener("keydown", escape, true);
    window.addEventListener("pointerdown", outside);
    return () => { window.removeEventListener("keydown", escape, true); window.removeEventListener("pointerdown", outside); };
  }, [menuOpen]);
  return <main className="home-screen landing" data-testid="home-screen">
    <a className="landing-skip" href="#landing-start">Skip to content</a>
    <header className="landing-header" ref={header}>
      <a className="landing-brand" href="#landing-start" aria-label="Open Reports home"><BrandMark /><span>open<span className="brand-dot">.</span>reports</span></a>
      <button ref={menuButton} className="landing-mobile-menu" aria-label="Toggle navigation" aria-expanded={menuOpen} aria-controls="landing-navigation" onClick={() => setMenuOpen(!menuOpen)}><Icon name="menu" /></button>
      <nav id="landing-navigation" className={`landing-nav ${menuOpen ? "is-open" : ""}`} aria-label="Main navigation">
        <a href="#templates" onClick={closeMenu}>Templates</a><a href="#workflow" onClick={closeMenu}>The designer</a><a href="#developers" onClick={closeMenu}>For developers</a>
        <button data-testid="home-tour" onClick={() => { closeMenu(); set({ dialog: "tour" }); }}><Icon name="play" /> Learn</button>
      </nav>
      <div className="landing-header-tools">
        <label className="landing-appearance"><span className="sr-only">Appearance</span><select aria-label="Interface appearance" data-testid="home-appearance" value={interfaceTheme} onChange={(event) => setInterfaceTheme(event.target.value as typeof interfaceTheme)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></label>
        <a className="landing-source" href={REPO} target="_blank" rel="noopener noreferrer" aria-label="Open source on GitHub"><svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.77-.24.77-.54v-2.08c-3.12.68-3.78-1.33-3.78-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.68.08-.68 1.13.08 1.73 1.16 1.73 1.16 1 1.72 2.63 1.22 3.27.93.1-.72.4-1.22.71-1.5-2.49-.28-5.11-1.24-5.11-5.54 0-1.23.44-2.23 1.16-3.02-.12-.29-.5-1.43.11-2.97 0 0 .94-.3 3.08 1.15a10.7 10.7 0 0 1 5.6 0c2.14-1.45 3.08-1.15 3.08-1.15.61 1.54.23 2.68.11 2.97.72.79 1.15 1.79 1.15 3.02 0 4.31-2.62 5.25-5.12 5.53.4.35.76 1.03.76 2.08v3.08c0 .3.2.64.77.53A11.2 11.2 0 0 0 12 .8Z" /></svg></a>
        {hasDraft ? <button className="landing-button compact" data-testid="home-continue" onClick={() => set({ home: false })}>Continue editing <Icon name="arrow" /></button> : <a className="landing-button compact" href="#create">Start creating <Icon name="arrow" /></a>}
      </div>
    </header>

    <section className="landing-hero landing-container" id="landing-start" aria-labelledby="landing-title" tabIndex={-1}>
      <div className="hero-copy">
        <p className="landing-eyebrow"><span className="hero-status-dot" /> OPEN SOURCE. OPEN POSSIBILITIES.</p>
        <h1 id="landing-title" aria-label="Your data. Beautifully on paper.">Your data.<br />{" "}Beautifully<br /><span className="hero-emphasis">on paper.<svg viewBox="0 0 430 24" preserveAspectRatio="none" aria-hidden="true"><path d="M3 15C100 0 265 0 423 12M40 23c123-12 254-12 360-5" /></svg></span></h1>
        <p className="hero-description">Design reports worth sharing.<br />Turn your data into invoices, statements, labels, and more—with a visual designer you can make your own.</p>
        <div className="hero-actions"><button className="landing-button" data-testid="home-try-invoice" onClick={() => onExample("invoice")}>Try the designer <Icon name="arrow" /></button><button className="landing-watch" data-testid="home-tour-featured" onClick={() => set({ dialog: "tour" })}><span><Icon name="play" /></span>See it in action</button></div>
        <p className="hero-footnote"><Icon name="check" /> A working example. Real sample data. No setup.</p>
      </div>
      <ReportShowcase onExample={onExample} />
    </section>

    <div className="landing-output-strip"><div className="landing-container"><span>ONE DESIGN. MANY DESTINATIONS.</span><div aria-label="Supported output formats">{OUTPUTS.map((format) => <span key={format}>{format}</span>)}</div><span className="output-strip-end">Built to leave the screen <Icon name="external" /></span></div></div>

    <TemplateGallery onExample={onTemplate} />

    <section className="landing-studio landing-container" id="workflow" aria-labelledby="studio-heading">
      <div className="landing-section-heading"><div><p className="landing-eyebrow">FROM FIRST IDEA TO FINAL PAGE</p><h2 id="studio-heading">A proper workspace.<br />Every detail in reach.</h2></div><button className="landing-text-link" data-testid="home-explore-features" onClick={() => set({ dialog: "guide" })}>Explore the capabilities <Icon name="arrow" /></button></div>
      <div className="studio-window"><div className="studio-window-bar"><span className="window-dots" aria-hidden="true"><i /><i /><i /></span><span>Designed in Open Reports</span><span>Design → Preview → Export</span></div><img src="/landing/designer.webp" width="1600" height="880" alt="The Open Reports visual designer, with a structured invoice, rulers, editable report canvas, and page settings" loading="lazy" /></div>
      <div className="studio-steps">{[
        ["01", "Make it yours.", "Arrange text, logos, tables, and barcodes. Set the page size and get the details right."],
        ["02", "Bring it to life.", "Connect JSON, CSV, REST, or SQL data. Add formulas, groups, and calculated totals."],
        ["03", "Give it a destination.", "Preview the actual PDF. Export an editable document, a spreadsheet, or printer output."],
      ].map(([number, title, detail]) => <div key={number}><span>{number}</span><h3>{title}</h3><p>{detail}</p></div>)}</div>
    </section>

    <section className="landing-developers landing-container" id="developers" aria-labelledby="developers-heading">
      <div><p className="landing-eyebrow">YOUR APPLICATION. YOUR RULES.</p><h2 id="developers-heading">A reporting engine.<br />With the designer included.</h2><p>Let your application own the templates and data. Send a report definition to the render API, or embed the designer so your users can create and edit their own.</p><div className="developer-actions"><a href={`${REPO}/blob/claude/upbeat-volta-pe84n7/docs/EMBEDDING.md`} target="_blank" rel="noopener noreferrer">Read the integration guide <Icon name="external" /></a><button onClick={() => set({ dialog: "settings" })}>API connection settings <Icon name="arrow" /></button></div><span className="developer-license">MIT licensed · REST API · Embeddable designer</span></div>
      <div className="developer-code"><div><Icon name="code" /><span>Render from your application</span><span>JavaScript</span></div><pre><code><span className="code-muted">// Your definition. Your data. A ready-to-use PDF.</span>{"\n"}<span className="code-keyword">const</span>{" response = "}<span className="code-keyword">await</span>{" fetch("}<span className="code-string">{"`${OPEN_REPORTS_URL}/api/v1/render`"}</span>{", {\n  method: "}<span className="code-string">{"\"POST\""}</span>{",\n  headers: { "}<span className="code-string">{"\"Content-Type\""}</span>{": "}<span className="code-string">{"\"application/json\""}</span>{" },\n  body: JSON.stringify({\n    report: invoiceDefinition,\n    data: { invoice: customerInvoice },\n    format: "}<span className="code-string">{"\"pdf\""}</span>{"\n  })\n});\n\n"}<span className="code-keyword">const</span>{" pdf = "}<span className="code-keyword">await</span>{" response.arrayBuffer();"}</code></pre><p><Icon name="check" /> No template ID required when you send the definition.</p></div>
    </section>

    <section className="landing-create landing-container" id="create" aria-labelledby="create-heading"><div className="landing-section-heading"><div><p className="landing-eyebrow">YOUR NEXT REPORT STARTS HERE</p><h2 id="create-heading">What will you create?</h2></div><p>Start with a clean page.<br />Or bring something you already have.</p></div><div className="landing-create-choices">{children}</div>
      <div className="landing-workspace"><div><Icon name="file" /><span>Already working on something?</span></div><div>{hasDraft && <button onClick={() => set({ home: false })}>Continue {doc.name || "your draft"} <Icon name="arrow" /></button>}<button data-testid="home-open" onClick={() => set({ dialog: "open" })}>Open a saved report <Icon name="arrow" /></button></div></div>
      {isPublicDemo() && <p className="landing-demo-note"><strong>A space to experiment.</strong> This demo uses a shared server that resets on restart. Use Export → Report file to keep your work, and try it with sample data.</p>}
    </section>

    <footer className="landing-footer landing-container"><div><a className="landing-brand" href="#landing-start"><BrandMark /><span>open<span className="brand-dot">.</span>reports</span></a><p>Good data deserves a good report.</p></div><div><button data-testid="home-guide" onClick={() => set({ dialog: "guide" })}>Feature guide</button><button onClick={() => set({ dialog: "tour" })}>Training videos</button><a href={FEEDBACK} target="_blank" rel="noopener noreferrer">Give feedback <Icon name="external" /></a><a href={REPO} target="_blank" rel="noopener noreferrer">GitHub <Icon name="external" /></a></div><span>Open source, by design.</span></footer>
  </main>;
}
