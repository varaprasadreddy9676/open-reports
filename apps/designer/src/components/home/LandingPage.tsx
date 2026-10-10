import React, { useEffect, useRef, useState } from "react";
import { loadDraft, useStore } from "../../store";
import { isPublicDemo } from "../../lib/report-file";
import { BrandMark, Icon } from "./Icons";
import { ReportShowcase } from "./ReportShowcase";
import { HeroScene } from "./HeroScene";
import { FeatureBento } from "./FeatureBento";
import { useLandingMotion } from "./motion";
import { GithubStar, REPO } from "./GithubStar";
import { SwitchCompare } from "./SwitchCompare";
import { STARTERS } from "../../lib/templates";
import { TemplateGallery } from "./TemplateGallery";
import "./landing.css";
import "./landing-motion.css";

const FEEDBACK = `${REPO}/issues/new?template=1-feedback.yml`;
const OUTPUTS = ["PDF", "Word", "Excel", "HTML", "CSV", "ZPL", "ESC/POS"];
const MARQUEE = [...OUTPUTS, "Invoices", "Statements", "Labels", "Receipts", "Lab reports", "Crosstabs", "Manifests", "Certificates"];

export function LandingPage({ onExample, onTemplate, children }: { onExample: (key: string) => void; onTemplate: (key: string) => void; children: React.ReactNode }) {
  const doc = useStore((state) => state.doc);
  const set = useStore((state) => state.set);
  const interfaceTheme = useStore((state) => state.interfaceTheme);
  const setInterfaceTheme = useStore((state) => state.setInterfaceTheme);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const root = useRef<HTMLElement>(null);
  useLandingMotion(root);
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
  return <main className="home-screen landing" data-testid="home-screen" ref={root}>
    <a className="landing-skip" href="#landing-start">Skip to content</a>
    <header className="landing-header" ref={header}>
      <a className="landing-brand" href="#landing-start" aria-label="Open Reports home"><BrandMark /><span>open<span className="brand-dot">.</span>reports</span></a>
      <button ref={menuButton} className="landing-mobile-menu" aria-label="Toggle navigation" aria-expanded={menuOpen} aria-controls="landing-navigation" onClick={() => setMenuOpen(!menuOpen)}><Icon name="menu" /></button>
      <nav id="landing-navigation" className={`landing-nav ${menuOpen ? "is-open" : ""}`} aria-label="Main navigation">
        <a href="#why" onClick={closeMenu}>Why switch</a><a href="#features" onClick={closeMenu}>Features</a><a href="#templates" onClick={closeMenu}>Templates</a><a href="#developers" onClick={closeMenu}>For developers</a>
        <button data-testid="home-tour" onClick={() => { closeMenu(); set({ dialog: "tour" }); }}><Icon name="play" /> Learn</button>
      </nav>
      <div className="landing-header-tools">
        <label className="landing-appearance"><span className="sr-only">Appearance</span><select aria-label="Interface appearance" data-testid="home-appearance" value={interfaceTheme} onChange={(event) => setInterfaceTheme(event.target.value as typeof interfaceTheme)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></label>
        <GithubStar className="landing-source" />
        {hasDraft ? <button className="landing-button compact" data-testid="home-continue" onClick={() => set({ home: false })}>Continue editing <Icon name="arrow" /></button> : <a className="landing-button compact magnetic" href="#create">Start creating <Icon name="arrow" /></a>}
      </div>
    </header>

    <section className="landing-hero" id="landing-start" aria-labelledby="landing-title" tabIndex={-1} data-spotlight>
      <div className="hero-backdrop" aria-hidden="true"><span className="hero-aurora hero-aurora-a" /><span className="hero-aurora hero-aurora-b" /><span className="hero-aurora hero-aurora-c" /><span className="hero-grid" /><span className="hero-grain" /><span className="hero-spot" /></div>
      <div className="hero-copy landing-container">
        <p className="hero-pill"><span className="hero-status-dot" />Open source · MIT · {OUTPUTS.length} output formats</p>
        <h1 id="landing-title" aria-label="Your data. Beautifully on paper."><span className="hero-line" aria-hidden="true"><span>Your data.</span></span><span className="hero-line" aria-hidden="true"><span>Beautifully <em className="hero-emphasis">on paper.</em></span></span></h1>
        <p className="hero-description">A visual report designer and rendering engine. Turn JSON, SQL or CSV into invoices, statements, labels and receipts, then ship them as PDF, Word, Excel or printer code.</p>
        <div className="hero-actions"><button className="landing-button hero-primary magnetic" data-testid="home-try-invoice" onClick={() => onExample("invoice")}><span>Try the designer</span> <Icon name="arrow" /></button><button className="landing-watch" data-testid="home-tour-featured" onClick={() => set({ dialog: "tour" })}><span><Icon name="play" /></span>Watch it work</button></div>
        <p className="hero-footnote"><Icon name="check" /> One click opens a real invoice in the designer. No sign-up, no install.</p>
      </div>
      <div className="landing-container hero-scene-wrap"><HeroScene /></div>
    </section>

    <div className="landing-marquee" aria-label="Supported output formats"><div className="marquee-track">{[0, 1].map((copy) => <div key={copy} aria-hidden={copy === 1}>{MARQUEE.map((item, index) => <span key={item} className={index < OUTPUTS.length ? "is-format" : ""}>{item}<i aria-hidden="true">✦</i></span>)}</div>)}</div></div>

    <SwitchCompare />

    <section className="landing-features landing-container" id="features" aria-labelledby="features-heading">
      <div className="landing-section-heading" data-reveal><div><p className="landing-eyebrow">EVERYTHING A REPORT NEEDS</p><h2 id="features-heading">Serious reporting.<br /><span className="text-muted">Without the serious setup.</span></h2></div><button className="landing-text-link" data-testid="home-explore-features" onClick={() => set({ dialog: "guide" })}>Explore the capabilities <Icon name="arrow" /></button></div>
      <FeatureBento />
    </section>

    <section className="landing-studio landing-container" id="workflow" aria-labelledby="studio-heading">
      <div className="landing-section-heading" data-reveal><div><p className="landing-eyebrow">FROM FIRST IDEA TO FINAL PAGE</p><h2 id="studio-heading">A proper workspace.<br /><span className="text-muted">Every detail in reach.</span></h2></div></div>
      <div className="studio-perspective"><div className="studio-window" data-reveal><div className="studio-window-bar"><span className="window-dots" aria-hidden="true"><i /><i /><i /></span><span>Designed in Open Reports</span><span>Design → Preview → Export</span></div><img src="/landing/designer.webp" width="1600" height="880" alt="The Open Reports visual designer, with a structured invoice, rulers, editable report canvas, and page settings" loading="lazy" /></div></div>
      <div className="studio-steps">{[
        ["01", "Make it yours.", "Arrange text, logos, tables, and barcodes. Set the page size and get the details right."],
        ["02", "Bring it to life.", "Connect JSON, CSV, REST, or SQL data. Add formulas, groups, and calculated totals."],
        ["03", "Give it a destination.", "Preview the actual PDF. Export an editable document, a spreadsheet, or printer output."],
      ].map(([number, title, detail]) => <div key={number} data-reveal><span>{number}</span><h3>{title}</h3><p>{detail}</p></div>)}</div>
    </section>

    <section className="landing-output landing-container" aria-labelledby="output-heading">
      <div data-reveal><p className="landing-eyebrow">REAL OUTPUT, NOT MOCKUPS</p><h2 id="output-heading">Every preview here<br /><span className="text-muted">came out of the engine.</span></h2><p>These are first pages of PDFs rendered from the bundled examples. Pick one and open it in the designer.</p></div>
      <div data-reveal><ReportShowcase onExample={onExample} /></div>
    </section>

    <TemplateGallery onExample={onTemplate} />

    <section className="landing-developers landing-container" id="developers" aria-labelledby="developers-heading" data-reveal data-spotlight>
      <div><p className="landing-eyebrow">YOUR APPLICATION. YOUR RULES.</p><h2 id="developers-heading">A reporting engine.<br />With the designer included.</h2><p>Let your application own the templates and data. Send a report definition to the render API, or embed the designer so your users can create and edit their own.</p><div className="developer-actions"><a href={`${REPO}/blob/claude/upbeat-volta-pe84n7/docs/EMBEDDING.md`} target="_blank" rel="noopener noreferrer">Read the integration guide <Icon name="external" /></a><button onClick={() => set({ dialog: "settings" })}>API connection settings <Icon name="arrow" /></button></div><div className="developer-star"><GithubStar label="Star the repo" /><span>Stars help other developers find the project.</span></div><span className="developer-license">MIT licensed · REST API · Embeddable designer</span></div>
      <div className="developer-code"><div><Icon name="code" /><span>Render from your application</span><span>JavaScript</span></div><pre><code><span className="code-muted">// Your definition. Your data. A ready-to-use PDF.</span>{"\n"}<span className="code-keyword">const</span>{" response = "}<span className="code-keyword">await</span>{" fetch("}<span className="code-string">{"`${OPEN_REPORTS_URL}/api/v1/render`"}</span>{", {\n  method: "}<span className="code-string">{"\"POST\""}</span>{",\n  headers: { "}<span className="code-string">{"\"Content-Type\""}</span>{": "}<span className="code-string">{"\"application/json\""}</span>{" },\n  body: JSON.stringify({\n    report: invoiceDefinition,\n    data: { invoice: customerInvoice },\n    format: "}<span className="code-string">{"\"pdf\""}</span>{"\n  })\n});\n\n"}<span className="code-keyword">const</span>{" pdf = "}<span className="code-keyword">await</span>{" response.arrayBuffer();"}</code></pre><p><Icon name="check" /> No template ID required when you send the definition.</p></div>
    </section>

    <section className="landing-create landing-container" id="create" aria-labelledby="create-heading"><div className="landing-section-heading"><div><p className="landing-eyebrow">YOUR NEXT REPORT STARTS HERE</p><h2 id="create-heading">What will you create?</h2></div><p>Start with a clean page.<br />Or bring something you already have.</p></div><div className="landing-create-choices">{children}</div>
      <div className="landing-workspace"><div><Icon name="file" /><span>Already working on something?</span></div><div>{hasDraft && <button onClick={() => set({ home: false })}>Continue {doc.name || "your draft"} <Icon name="arrow" /></button>}<button data-testid="home-open" onClick={() => set({ dialog: "open" })}>Open a saved report <Icon name="arrow" /></button></div></div>
      {isPublicDemo() && <p className="landing-demo-note"><strong>A space to experiment.</strong> This demo uses a shared server that resets on restart. Use Export → Report file to keep your work, and try it with sample data.</p>}
    </section>

    <section className="landing-cta" aria-labelledby="cta-heading" data-spotlight>
      <div className="hero-backdrop" aria-hidden="true"><span className="hero-aurora hero-aurora-a" /><span className="hero-aurora hero-aurora-b" /><span className="hero-grid" /><span className="hero-grain" /><span className="hero-spot" /></div>
      <div className="landing-container" data-reveal><h2 id="cta-heading">Good data deserves<br /><em className="hero-emphasis">a good report.</em></h2><p>{STARTERS.length} editable starting points and {OUTPUTS.length} output formats. Free, open source, and running in your browser in one click.</p><div className="hero-actions"><button className="landing-button hero-primary magnetic" onClick={() => onExample("invoice")}><span>Open the designer</span> <Icon name="arrow" /></button><GithubStar className="cta-star" label="Star on GitHub" /></div><p className="cta-note">If it saves you a week of report work, a star is the best way to say thanks.</p></div>
    </section>

    <footer className="landing-footer landing-container"><div><a className="landing-brand" href="#landing-start"><BrandMark /><span>open<span className="brand-dot">.</span>reports</span></a><p>Good data deserves a good report.</p></div><div><button data-testid="home-guide" onClick={() => set({ dialog: "guide" })}>Feature guide</button><button onClick={() => set({ dialog: "tour" })}>Training videos</button><a href="/guides/embed-report-designer/">Embed the designer</a><a href="/guides/render-json-report-api/">Render API</a><a href="/guides/jasperreports-alternative/">JasperReports comparison</a><a href="/guides/jrxml-import/">JRXML import limits</a><a href={FEEDBACK} target="_blank" rel="noopener noreferrer">Give feedback <Icon name="external" /></a><a href={REPO} target="_blank" rel="noopener noreferrer">GitHub <Icon name="external" /></a></div><span>Open source, by design.</span></footer>
  </main>;
}
