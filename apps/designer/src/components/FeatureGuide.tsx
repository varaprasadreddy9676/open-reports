import React from "react";

const EMBEDDING_GUIDE = "https://github.com/varaprasadreddy9676/open-reports/blob/claude/upbeat-volta-pe84n7/docs/EMBEDDING.md";

interface FeatureGuideProps {
  onExample: (key: string, message: string) => void;
  onImport: (format: "docx" | "jrxml") => void;
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
  return <li className="feature-guide-item">
    <span className="feature-guide-number" aria-hidden="true">{number}</span>
    <div className="feature-guide-copy">
      <h4>{title}</h4>
      <p>{purpose}</p>
      <span><strong>How:</strong> {steps}</span>
    </div>
    {href ? <a className="btn" href={href} target="_blank" rel="noopener noreferrer">{action} ↗</a> : <button className="btn" onClick={onClick}>{action} →</button>}
  </li>;
}

export function FeatureGuide({ onExample, onImport }: FeatureGuideProps) {
  return <div className="feature-guide" data-testid="feature-guide">
    <h2>Choose what you want to make</h2>
    <p className="feature-guide-intro">Open Reports can start from a file, build a report from data, or share one in your app. Pick a result below to see why you would use it and the first step.</p>

    <h3 className="feature-guide-group">Start or improve a report</h3>
    <ol>
      <Feature number="01" title="Reuse a Word document" purpose="Turn an existing letterhead or form into a report you can edit and connect to live data." steps="Import Word document → choose a DOCX file → review what converted → open the draft." action="Import Word" onClick={() => onImport("docx")} />
      <Feature number="02" title="Move from JasperReports" purpose="Bring your JRXML layouts into the designer without rebuilding every band by hand." steps="Import JRXML → choose one file or a folder → review migration issues → open the drafts." action="Import JRXML" onClick={() => onImport("jrxml")} />
      <Feature number="03" title="Summarize rows as a crosstab" purpose="Compare totals by two dimensions, such as sales by region and service." steps="Open the example, select the crosstab, then change Rows, Columns and Values in Properties." action="Try crosstab" onClick={() => onExample("crosstab", "Select the crosstab and change Rows, Columns or Values in Properties.")} />
      <Feature number="04" title="Place elements precisely" purpose="Use rulers, snap guides and live measurements when a printed layout needs exact spacing." steps="Open the invoice, select an element, and drag or resize it on the canvas. Canvas settings controls snapping." action="Try the canvas" onClick={() => onExample("invoice", "Select an element, then drag or resize it to see guides and measurements.")} />
    </ol>

    <h3 className="feature-guide-group">Deliver and share</h3>
    <ol>
      <Feature number="05" title="Give someone an editable Word file" purpose="Export a report as DOCX so a recipient can edit its text, tables and charts in Word." steps="Open a report → More report actions → Export → Word (DOCX)." action="Try Word export" onClick={() => onExample("invoice", "Use More report actions → Export → Word (DOCX) to download an editable file.")} />
      <Feature number="06" title="Let readers explore a published report" purpose="The viewer can find text, show contents, sort tables and follow report links when the report includes those features." steps="Publish a report, then show it with the report viewer. Reader controls appear on supported content." action="Viewer guide" href={EMBEDDING_GUIDE} />
      <Feature number="07" title="Put reports inside your application" purpose="Embed the viewer or the entire designer in your own page without building a new reporting UI." steps="Load the Open Reports script, then add an open-report-viewer or open-report-designer element." action="Embedding code" href={EMBEDDING_GUIDE} />
    </ol>
  </div>;
}
