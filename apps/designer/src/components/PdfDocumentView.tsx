import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Util, type PDFDocumentProxy, type PDFPageProxy, type RenderTask } from "pdfjs-dist";

type Zoom = "page" | "width" | number;
type Match = { page: number; excerpt: string };
const THUMB_HEIGHT = 174;
const ACTUAL_SCALE = 96 / 72;

function useElementSize(ref: RefObject<HTMLElement>, enabled = true) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, enabled]);
  return size;
}

function PdfCanvas({ page, scale, thumbnail = false }: { page: PDFPageProxy; scale: number; thumbnail?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    setReady(false);
    const viewport = page.getViewport({ scale });
    const pixelRatio = thumbnail ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    target.width = Math.ceil(viewport.width * pixelRatio);
    target.height = Math.ceil(viewport.height * pixelRatio);
    target.style.width = `${viewport.width}px`;
    target.style.height = `${viewport.height}px`;
    const context = target.getContext("2d");
    if (!context) return;
    let task: RenderTask | undefined;
    task = page.render({ canvasContext: context, viewport, transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0] });
    void task.promise.then(() => setReady(true)).catch((reason: Error) => {
      if (reason.name !== "RenderingCancelledException") setReady(false);
    });
    return () => { task?.cancel(); };
  }, [page, scale, thumbnail]);
  return <canvas ref={canvas} className={ready ? "pdf-rendered" : ""} aria-label={thumbnail ? "Page thumbnail" : `Rendered page ${page.pageNumber}`} />;
}

function PdfHighlights({ page, scale, term }: { page: PDFPageProxy; scale: number; term: string }) {
  const [rectangles, setRectangles] = useState<{ left: number; top: number; width: number; height: number }[]>([]);
  useEffect(() => {
    let active = true;
    const viewport = page.getViewport({ scale });
    void page.getTextContent().then((content) => {
      if (!active) return;
      const needle = term.toLocaleLowerCase();
      const found = content.items.flatMap((item) => {
        if (!("str" in item) || !item.str.toLocaleLowerCase().includes(needle)) return [];
        const matrix = Util.transform(viewport.transform, item.transform);
        const fontHeight = Math.hypot(matrix[2], matrix[3]);
        const style = content.styles[item.fontName];
        const ascent = style?.ascent ?? (style?.descent ? 1 + style.descent : 1);
        return [{ left: matrix[4], top: matrix[5] - fontHeight * ascent, width: item.width * scale, height: fontHeight }];
      });
      setRectangles(found);
    }).catch(() => { if (active) setRectangles([]); });
    return () => { active = false; };
  }, [page, scale, term]);
  return <div className="pdf-highlights" aria-hidden="true">
    {rectangles.map((rectangle, index) => <span key={index} data-testid="pdf-search-highlight" style={rectangle} />)}
  </div>;
}

function Thumbnail({ pdf, number, selected, select }: { pdf: PDFDocumentProxy; number: number; selected: boolean; select: (number: number) => void }) {
  const [page, setPage] = useState<PDFPageProxy>();
  useEffect(() => {
    let active = true;
    void pdf.getPage(number).then((loaded) => { if (active) setPage(loaded); }).catch(() => {});
    return () => { active = false; };
  }, [pdf, number]);
  const scale = page ? Math.min(104 / page.getViewport({ scale: 1 }).width, 132 / page.getViewport({ scale: 1 }).height) : 1;
  return <button type="button" className={`pdf-thumb ${selected ? "selected" : ""}`} aria-label={`Go to page ${number}`} aria-current={selected ? "page" : undefined} onClick={() => select(number)}>
    <span className="pdf-thumb-paper">{page && <PdfCanvas page={page} scale={scale} thumbnail />}</span>
    <span>Page {number}</span>
  </button>;
}

export function PdfDocumentView({ pdf }: { pdf: PDFDocumentProxy }) {
  const [number, setNumber] = useState(1);
  const [page, setPage] = useState<PDFPageProxy>();
  const [zoom, setZoom] = useState<Zoom>("page");
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchProgress, setSearchProgress] = useState(0);
  const searchRun = useRef(0);
  const textCache = useRef(new Map<number, string>());
  const stage = useRef<HTMLDivElement>(null);
  const thumbRail = useRef<HTMLDivElement>(null);
  const stageSize = useElementSize(stage);
  const thumbSize = useElementSize(thumbRail, showThumbnails && pdf.numPages > 1);
  const [thumbScroll, setThumbScroll] = useState(0);
  const [pageInput, setPageInput] = useState("1");

  useEffect(() => {
    setNumber(1);
    setPage(undefined);
    setQuery("");
    setMatches([]);
    setMatchIndex(0);
    setSearching(false);
    setSearchError("");
    setPageInput("1");
    textCache.current.clear();
    searchRun.current++;
  }, [pdf]);
  useEffect(() => {
    let active = true;
    setPage(undefined);
    void pdf.getPage(number).then((loaded) => { if (active) setPage(loaded); }).catch(() => {});
    return () => { active = false; };
  }, [pdf, number]);

  const viewport = page?.getViewport({ scale: 1 });
  const scale = useMemo(() => {
    if (!viewport) return 1;
    if (typeof zoom === "number") return ACTUAL_SCALE * zoom / 100;
    const widthScale = Math.max(0.1, (stageSize.width - 64) / viewport.width);
    return zoom === "width" ? widthScale : Math.min(widthScale, Math.max(0.1, (stageSize.height - 64) / viewport.height));
  }, [viewport?.width, viewport?.height, stageSize.width, stageSize.height, zoom]);
  const displayedZoom = Math.round(scale / ACTUAL_SCALE * 100);
  const goTo = (target: number) => {
    const next = Math.max(1, Math.min(pdf.numPages, target));
    setNumber(next);
    setPageInput(String(next));
  };

  useEffect(() => {
    const rail = thumbRail.current;
    if (!rail || !showThumbnails || pdf.numPages < 2) return;
    const top = (number - 1) * THUMB_HEIGHT;
    if (top < rail.scrollTop || top + THUMB_HEIGHT > rail.scrollTop + rail.clientHeight) rail.scrollTop = Math.max(0, top - THUMB_HEIGHT);
  }, [number, showThumbnails, pdf.numPages]);
  const start = Math.max(0, Math.floor(thumbScroll / THUMB_HEIGHT) - 3);
  const end = Math.min(pdf.numPages, Math.ceil((thumbScroll + thumbSize.height) / THUMB_HEIGHT) + 3);

  const search = async (term: string) => {
    const run = ++searchRun.current;
    setMatches([]);
    setMatchIndex(0);
    setSearchProgress(0);
    setSearchError("");
    if (!term.trim()) { setSearching(false); return; }
    setSearching(true);
    const found: Match[] = [];
    const needle = term.trim().toLocaleLowerCase();
    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        let text = textCache.current.get(i);
        if (text === undefined) {
          const content = await (await pdf.getPage(i)).getTextContent();
          text = content.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ");
          textCache.current.set(i, text);
        }
        if (run !== searchRun.current) return;
        const at = text.toLocaleLowerCase().indexOf(needle);
        if (at >= 0) found.push({ page: i, excerpt: text.slice(Math.max(0, at - 36), Math.min(text.length, at + term.length + 36)) });
        if (i % 5 === 0 || i === pdf.numPages) setSearchProgress(i);
      }
      if (run !== searchRun.current) return;
      setMatches(found);
      if (found.length) goTo(found[0]!.page);
    } catch (reason) {
      if (run === searchRun.current) setSearchError((reason as Error).message);
    } finally { if (run === searchRun.current) setSearching(false); }
  };
  const stepMatch = (direction: number) => {
    if (!matches.length) return;
    const next = (matchIndex + direction + matches.length) % matches.length;
    setMatchIndex(next);
    goTo(matches[next]!.page);
  };

  return <div className="pdf-document-view" data-testid="pdf-document-view">
    <div className="pdf-tools">
      <button className="btn" type="button" aria-label={showThumbnails ? "Hide page thumbnails" : "Show page thumbnails"} aria-pressed={showThumbnails} onClick={() => setShowThumbnails(!showThumbnails)}>Pages</button>
      <div className="pdf-page-control">
        <button className="btn" type="button" aria-label="Previous page" disabled={number === 1} onClick={() => goTo(number - 1)}>‹</button>
        <input aria-label="Page number" data-testid="pdf-page-number" type="number" min={1} max={pdf.numPages} value={pageInput} onChange={(event) => setPageInput(event.target.value)} onBlur={() => goTo(Number(pageInput) || 1)} onKeyDown={(event) => { if (event.key === "Enter") { goTo(Number(pageInput) || 1); event.currentTarget.blur(); } }} />
        <span>of {pdf.numPages}</span>
        <button className="btn" type="button" aria-label="Next page" disabled={number === pdf.numPages} onClick={() => goTo(number + 1)}>›</button>
      </div>
      <select aria-label="PDF zoom" data-testid="pdf-zoom" value={zoom} onChange={(event) => setZoom(event.target.value === "page" || event.target.value === "width" ? event.target.value : Number(event.target.value))}>
        <option value="page">Fit page</option><option value="width">Fit width</option>
        {[50, 75, 100, 125, 150, 200].map((value) => <option key={value} value={value}>{value}%</option>)}
      </select>
      <span className="pdf-zoom-readout">{displayedZoom}%</span>
      <form className="pdf-search" onSubmit={(event) => { event.preventDefault(); void search(query); }}>
        <input type="search" aria-label="Search PDF text" placeholder="Find in PDF" value={query} onChange={(event) => { setQuery(event.target.value); searchRun.current++; setSearching(false); setMatches([]); setSearchProgress(0); setSearchError(""); }} />
        <button className="btn" type="submit">Find</button>
      </form>
      {searching ? <span className="pdf-search-status" role="status">Searching {searchProgress}/{pdf.numPages}</span> : searchError ? <span className="field-error" role="alert">{searchError}</span> : matches.length ? <div className="pdf-match-control" role="status"><button className="btn" aria-label="Previous match" onClick={() => stepMatch(-1)}>‹</button><span>{matchIndex + 1}/{matches.length} pages</span><button className="btn" aria-label="Next match" onClick={() => stepMatch(1)}>›</button></div> : query.trim() && searchProgress === pdf.numPages ? <span className="pdf-search-status" role="status">No matches</span> : null}
    </div>
    {matches.length > 0 && <div className="pdf-match-excerpt" data-testid="pdf-match-excerpt">Page {matches[matchIndex]?.page}: …{matches[matchIndex]?.excerpt}…</div>}
    <div className="pdf-document-body">
      {showThumbnails && pdf.numPages > 1 && <aside className="pdf-thumbnails" ref={thumbRail} aria-label="Page thumbnails" onScroll={(event) => setThumbScroll(event.currentTarget.scrollTop)}>
        <div style={{ height: pdf.numPages * THUMB_HEIGHT, position: "relative" }}>
          {Array.from({ length: Math.max(0, end - start) }, (_, index) => start + index + 1).map((item) => <div key={item} className="pdf-thumb-slot" style={{ top: (item - 1) * THUMB_HEIGHT }}><Thumbnail pdf={pdf} number={item} selected={number === item} select={goTo} /></div>)}
        </div>
      </aside>}
      <div className="pdf-page-stage" ref={stage} data-testid="pdf-frame" aria-label={`PDF page ${number} of ${pdf.numPages}`}>
        {page ? <div className="pdf-page-paper" style={{ width: viewport!.width * scale, height: viewport!.height * scale }}><PdfCanvas key={`${number}-${scale}`} page={page} scale={scale} />{matches[matchIndex]?.page === number && query.trim() && <PdfHighlights page={page} scale={scale} term={query.trim()} />}</div> : <div className="muted pad" role="status">Loading page {number}…</div>}
      </div>
    </div>
  </div>;
}
