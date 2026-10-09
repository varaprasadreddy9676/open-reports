import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrandMark, Icon } from "../home/Icons";
import "./learning.css";

export interface Lesson { id: string; title: string; summary: string; duration: string; category: string }
const EXAMPLES: Record<string, { key: string; label: string }> = {
  "table-designer-workflow": { key: "invoice", label: "Edit an invoice table" },
  "table-merges-rules": { key: "account-statement", label: "Try the statement" },
  "grouped-report-workflow": { key: "department-report", label: "Try a grouped report" },
  "group-create-workflow": { key: "grouped-sales", label: "Try grouped sales" },
  "barcode-label-zpl": { key: "label-50x30", label: "Design a label" },
  "printer-profiles": { key: "label-50x30", label: "Try a label profile" },
  "formulas-conditions": { key: "conditional", label: "Try conditional content" },
  "long-report-pagination": { key: "account-statement", label: "Explore a long report" },
  "page-master-variants": { key: "account-statement", label: "Try page masters" },
  "client-letterhead": { key: "discharge-summary", label: "Customize a letterhead" },
  "crosstab-workflow": { key: "crosstab", label: "Try the crosstab" },
  "sales-crosstab": { key: "crosstab", label: "Try the crosstab" },
  "hospital-letterhead": { key: "hospital-letterhead", label: "Try the letterhead" },
  "supermarket-receipt": { key: "receipt-58mm", label: "Build a receipt" },
  "sticker-sheet-workflow": { key: "sticker-sheet", label: "Try a sticker sheet" },
};

export function LearningLibrary({ lessons, onExample, onGuide, onImport, onSettings }: { lessons: Lesson[]; onExample: (key: string) => void; onGuide: () => void; onImport: (format: "docx" | "jrxml") => void; onSettings: () => void }) {
  const [selectedId, setSelectedId] = useState(lessons[0]!.id);
  const [topic, setTopic] = useState("All topics");
  const [query, setQuery] = useState("");
  const [videoError, setVideoError] = useState(false);
  const selectedButton = useRef<HTMLButtonElement>(null);
  const player = useRef<HTMLDivElement>(null);
  const library = useRef<HTMLElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const selectedIndex = lessons.findIndex((item) => item.id === selectedId);
  const selected = lessons[selectedIndex]!;
  const topics = useMemo(() => [...new Set(lessons.map((item) => item.category))], [lessons]);
  const visible = lessons.filter((item) => (topic === "All topics" || item.category === topic) && `${item.title} ${item.summary} ${item.category}`.toLowerCase().includes(query.trim().toLowerCase()));
  const minutes = Math.ceil(lessons.reduce((total, item) => { const [min, sec] = item.duration.split(":").map(Number); return total + min! * 60 + sec!; }, 0) / 60);
  const example = EXAMPLES[selected.id] ?? { key: "invoice", label: "Try the invoice" };
  const next = lessons[selectedIndex + 1];
  useEffect(() => {
    setVideoError(false);
    selectedButton.current?.scrollIntoView({ block: "nearest" });
    player.current?.scrollTo({ top: 0 });
    if (window.matchMedia("(max-width: 760px)").matches) {
      player.current?.scrollIntoView({ block: "start" });
      video.current?.focus({ preventScroll: true });
    }
  }, [selectedId]);
  const navigate = (id: string) => { setTopic("All topics"); setQuery(""); setSelectedId(id); };
  const tryLesson = () => {
    if (selected.id === "word-to-report") onImport("docx");
    else if (selected.id === "jasper-folder-migration") onImport("jrxml");
    else if (selected.category === "Developers") onSettings();
    else if (selected.category === "Reuse" || selected.category === "Sharing") onGuide();
    else onExample(example.key);
  };
  const actionLabel = selected.id === "word-to-report" ? "Import a Word document" : selected.id === "jasper-folder-migration" ? "Import JRXML" : selected.category === "Developers" ? "Open API settings" : selected.category === "Reuse" || selected.category === "Sharing" ? "Explore capabilities" : example.label;
  return <div className="learning-studio">
    <header className="learning-heading"><div className="learning-kicker"><BrandMark /><span>OPEN REPORTS / LEARNING STUDIO</span></div><div><div><h2>Learn by making.</h2><p>Short, practical lessons. Real reports. One new skill at a time.</p></div><div className="learning-header-actions"><button className="learning-text-button learning-mobile-browse" onClick={() => { library.current?.scrollIntoView({ block: "start" }); searchInput.current?.focus({ preventScroll: true }); }}>Browse {lessons.length} lessons <Icon name="arrow" /></button><button className="learning-text-button" onClick={onGuide}>Explore capabilities <Icon name="arrow" /></button></div></div></header>
    <div className="learning-layout">
      <aside ref={library} className="lesson-library" aria-label="Lesson library">
        <div className="lesson-library-head"><strong>Your next skill starts here</strong><span>{lessons.length} lessons <i /> {minutes} min total</span></div>
        <label className="lesson-search"><Icon name="search" /><input ref={searchInput} aria-label="Search training lessons" placeholder="Find a lesson…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <label className="lesson-topic"><span>TOPIC</span><select aria-label="Filter lessons by topic" value={topic} onChange={(event) => setTopic(event.target.value)}><option>All topics</option>{topics.map((category) => <option key={category}>{category}</option>)}</select></label>
        <div className="lesson-result-count" role="status">{visible.length} {visible.length === 1 ? "lesson" : "lessons"}{topic === "All topics" && !query ? " to explore" : " found"}</div>
        <nav className="demo-video-list" aria-label="Open Reports training lessons">
          {visible.map((lesson) => <button key={lesson.id} ref={selected.id === lesson.id ? selectedButton : undefined} className="demo-video-choice" aria-pressed={selected.id === lesson.id} onClick={() => setSelectedId(lesson.id)}>
            <span className="lesson-thumbnail"><img src={`/demo-videos/${lesson.id}-poster.jpg`} width="128" height="72" alt="" loading="lazy" />{selected.id === lesson.id && <span><Icon name="play" /></span>}</span>
            <span className="lesson-row-copy"><strong>{lesson.title}</strong><small>{lesson.duration} <i /> {lesson.category}</small></span>
          </button>)}
          {!visible.length && <div className="lesson-empty"><Icon name="search" /><strong>No matching lessons</strong><p>Try a topic such as tables, print, or data.</p><button onClick={() => { setQuery(""); setTopic("All topics"); }}>Show all lessons</button></div>}
        </nav>
        <div className="lesson-library-tip"><Icon name="play" /><p>New here? Begin with Start here, then pick a topic.</p></div>
      </aside>
      <section className="demo-video-player lesson-player" aria-label={selected.title}>
        <div ref={player} className="lesson-watch-area">
        <div className="lesson-player-top"><span className="lesson-category">{selected.category}</span><span>LESSON {String(selectedIndex + 1).padStart(2, "0")} / {lessons.length}</span></div>
        <video ref={video} key={selected.id} className="tour-video" controls playsInline preload="metadata" poster={`/demo-videos/${selected.id}-poster.jpg`} tabIndex={0} aria-label={selected.title} onError={() => setVideoError(true)}>
          <source src={`/demo-videos/${selected.id}.mp4`} type="video/mp4" onError={() => setVideoError(true)} />
          <track kind="captions" src={`/demo-videos/${selected.id}.vtt`} srcLang="en" label="English" default />
          Your browser does not support this video. <a href={`/demo-videos/${selected.id}.mp4`}>Open the video</a>.
        </video>
        {videoError && <div className="lesson-video-error" role="alert"><span>This lesson couldn't load. Retry, or choose another lesson.</span><button onClick={() => { setVideoError(false); video.current?.load(); }}>Retry video</button></div>}
        <div className="lesson-player-info"><div><h3>{selected.title}</h3><p>{selected.summary}</p><span><Icon name="check" /> English captions <i /> {selected.duration}</span></div><button className="learning-primary" onClick={tryLesson}>{actionLabel} <Icon name="arrow" /></button></div>
        <details className="lesson-resources" key={`resources-${selected.id}`}><summary>Files for this lesson <span>+</span></summary><div><a className="demo-caption-link" href={`/demo-videos/${selected.id}.vtt`} download={`${selected.id}-captions.vtt`}>English captions (.vtt) <Icon name="external" /></a>{selected.id === "hospital-letterhead" && <div className="demo-asset-links" aria-label="Download hospital letterhead sample assets"><a href="/demo-videos/letterhead-assets/northstar-primary-logo.png" download>Left logo (PNG)</a><a href="/demo-videos/letterhead-assets/northstar-accreditation-mark.png" download>Right seal (PNG)</a><a href="/demo-videos/letterhead-assets/northstar-preprinted-letterhead.png" download>Pre-printed page (PNG)</a></div>}</div></details>
        </div>
        <div className="lesson-next"><button className="lesson-previous" disabled={selectedIndex === 0} onClick={() => navigate(lessons[selectedIndex - 1]!.id)}><Icon name="arrow" /><span>Previous</span></button>{next ? <button className="lesson-next-button" onClick={() => navigate(next.id)}><span><small>UP NEXT</small><strong>{next.title}</strong></span><Icon name="arrow" /></button> : <div><small>KEEP EXPLORING</small><button className="learning-text-button" onClick={onGuide}>Put your new skills to work <Icon name="arrow" /></button></div>}</div>
      </section>
    </div>
  </div>;
}
