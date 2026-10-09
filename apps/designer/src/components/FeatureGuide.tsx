import React, { useState } from "react";
import { BrandMark, Icon } from "./home/Icons";
import "./learning/learning.css";

const EMBEDDING_GUIDE = "https://github.com/varaprasadreddy9676/open-reports/blob/claude/upbeat-volta-pe84n7/docs/EMBEDDING.md";

interface FeatureGuideProps {
  onExample: (key: string, message: string) => void;
  onImport: (format: "docx" | "jrxml") => void;
  onLearn?: () => void;
}

function Feature({ number, title, purpose, steps, action, onClick, href }: {
  number: string;
  title: string;
  purpose: string;
  steps: string;
  action: string;
  onClick?: () => void;
  href?: string;
}) {
  return <li className="capability-card">
    <div className="capability-card-top"><span className="capability-icon"><Icon name={number === "01" || number === "02" ? "upload" : href ? "code" : number === "05" ? "file" : "grid"} /></span><span>EXPLORER / {number}</span></div>
      <h3>{title}</h3>
      <p>{purpose}</p>
      <div className="capability-first-step"><span>YOUR FIRST STEP</span><p>{steps}</p></div>
    {href ? <a className="capability-action" href={href} target="_blank" rel="noopener noreferrer">{action} <Icon name="external" /></a> : <button className="capability-action" onClick={onClick}>{action} <Icon name="arrow" /></button>}
  </li>;
}

export function FeatureGuide({ onExample, onImport, onLearn }: FeatureGuideProps) {
  const [category, setCategory] = useState("All possibilities");
  return <div className="feature-guide capability-studio" data-testid="feature-guide">
    <header className="learning-heading"><div className="learning-kicker"><BrandMark /><span>OPEN REPORTS / CAPABILITY EXPLORER</span></div><div><div><h2>What will you make next?</h2><p>Start with an outcome. Find a useful feature and its first step.</p></div>{onLearn && <button className="learning-text-button" onClick={onLearn}><Icon name="play" /> Watch the lessons</button>}</div></header>
    <div className="capability-content"><div className="capability-filters" role="group" aria-label="Feature categories">{["All possibilities", "Create & improve", "Deliver & share"].map((item) => <button key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div>
    <div className="capability-result-count" role="status">{category === "All possibilities" ? 7 : category === "Create & improve" ? 4 : 3} ways to get started</div>
    {category !== "Deliver & share" && <><h3 className="capability-group-title">CREATE & IMPROVE</h3>
    <ol className="capability-grid">
      <Feature number="01" title="Reuse a Word document" purpose="Turn an existing letterhead or form into a report you can edit and connect to live data." steps="Import Word document → choose a DOCX file → review what converted → open the draft." action="Import Word" onClick={() => onImport("docx")} />
      <Feature number="02" title="Move from JasperReports" purpose="Bring your JRXML layouts into the designer without rebuilding every band by hand." steps="Import JRXML → choose one file or a folder → review migration issues → open the drafts." action="Import JRXML" onClick={() => onImport("jrxml")} />
      <Feature number="03" title="Summarize rows as a crosstab" purpose="Compare totals by two dimensions, such as sales by region and service." steps="Open the example, select the crosstab, then change Rows, Columns and Values in Properties." action="Try crosstab" onClick={() => onExample("crosstab", "Select the crosstab and change Rows, Columns or Values in Properties.")} />
      <Feature number="04" title="Place elements precisely" purpose="Use rulers, snap guides and live measurements when a printed layout needs exact spacing." steps="Open the invoice, select an element, and drag or resize it on the canvas. Canvas settings controls snapping." action="Try the canvas" onClick={() => onExample("invoice", "Select an element, then drag or resize it to see guides and measurements.")} />
    </ol></>}

    {category !== "Create & improve" && <><h3 className="capability-group-title">DELIVER & SHARE</h3>
    <ol className="capability-grid">
      <Feature number="05" title="Give someone an editable Word file" purpose="Export a report as DOCX so a recipient can edit its text, tables and charts in Word." steps="Open a report → More report actions → Export → Word (DOCX)." action="Try Word export" onClick={() => onExample("invoice", "Use More report actions → Export → Word (DOCX) to download an editable file.")} />
      <Feature number="06" title="Let readers explore a report" purpose="The viewer can find text, show contents, sort tables and follow report links when the report includes those features." steps="Show a host-owned or published report in the viewer. Its controls depend on the content." action="Viewer guide" href={EMBEDDING_GUIDE} />
      <Feature number="07" title="Put reports inside your application" purpose="Embed the viewer or the entire designer in your own page without building a new reporting UI." steps="Load the Open Reports script, then add an open-report-viewer or open-report-designer element." action="Embedding code" href={EMBEDDING_GUIDE} />
    </ol></>}
    <div className="capability-footer"><span>Keep your own copy with Export → Report file.</span>{onLearn && <button className="learning-text-button" onClick={onLearn}>Find a lesson <Icon name="arrow" /></button>}</div></div>
  </div>;
}
