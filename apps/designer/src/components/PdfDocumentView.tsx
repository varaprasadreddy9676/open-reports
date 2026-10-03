import { useEffect, useRef, useState, type RefObject } from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import type { EventBus, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import { findPageTextMatch } from "../lib/pdf-text-search";
import { loadPdfViewer } from "../lib/pdf-viewer";

type Zoom = "page" | "width" | number;
type FindStatus = { state: "idle" | "pending" | "found" | "not-found"; current: number; total: number };
const THUMB_HEIGHT = 174;
const FIND_STATE = { FOUND: 0, NOT_FOUND: 1, WRAPPED: 2, PENDING: 3 } as const;
const IDLE_FIND: FindStatus = { state: "idle", current: 0, total: 0 };
/** Present in the 5.x runtime but missing from its type declarations; it tears down the viewer's observers. */
type ViewerOptions = ConstructorParameters<typeof PDFViewer>[0] & { abortSignal: AbortSignal };

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

function zoomValue(zoom: Zoom) {
  return zoom === "page" ? "page-fit" : zoom === "width" ? "page-width" : String(zoom / 100);
}

/** Thumbnails are at most ~110 × 132 px, so a single canvas each is always within browser limits. */
function Thumbnail({ pdf, number, selected, select }: { pdf: PDFDocumentProxy; number: number; selected: boolean; select: (number: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    let task: RenderTask | undefined;
    void pdf.getPage(number).then((page: PDFPageProxy) => {
      const target = canvas.current;
      if (!active || !target) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(104 / base.width, 132 / base.height) });
      target.width = Math.ceil(viewport.width);
      target.height = Math.ceil(viewport.height);
      task = page.render({ canvas: target, viewport });
      return task.promise;
    }).catch(() => {});
    return () => { active = false; task?.cancel(); };
  }, [pdf, number]);
  return <button type="button" className={`pdf-thumb ${selected ? "selected" : ""}`} aria-label={`Go to page ${number}`} aria-current={selected ? "page" : undefined} onClick={() => select(number)}>
    <span className="pdf-thumb-paper"><canvas ref={canvas} aria-label="Page thumbnail" /></span>
    <span>Page {number}</span>
  </button>;
}

export function PdfDocumentView({ pdf }: { pdf: PDFDocumentProxy }) {
  const [number, setNumber] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [zoom, setZoom] = useState<Zoom>("page");
  const [scale, setScale] = useState(1);
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [query, setQuery] = useState("");
  const [find, setFind] = useState<FindStatus>(IDLE_FIND);
  const [excerpt, setExcerpt] = useState<{ page: number; text: string }>();
  const [renderErrors, setRenderErrors] = useState<ReadonlyMap<number, string>>(new Map());
  const [viewerError, setViewerError] = useState("");
  const viewerRef = useRef<{ viewer: PDFViewer; eventBus: EventBus }>();
  const zoomRef = useRef(zoom);
  const findQuery = useRef("");
  const textCache = useRef(new Map<number, string[]>());
  const container = useRef<HTMLDivElement>(null);
  const viewerElement = useRef<HTMLDivElement>(null);
  const thumbRail = useRef<HTMLDivElement>(null);
  const thumbSize = useElementSize(thumbRail, showThumbnails && pdf.numPages > 1);
  const [thumbScroll, setThumbScroll] = useState(0);

  useEffect(() => {
    const host = container.current;
    const viewerHost = viewerElement.current;
    if (!host || !viewerHost) return;
    const abort = new AbortController();
    let viewer: PDFViewer | undefined;
    setNumber(1);
    setPageInput("1");
    setQuery("");
    setFind(IDLE_FIND);
    setExcerpt(undefined);
    setRenderErrors(new Map());
    setViewerError("");
    textCache.current.clear();
    void loadPdfViewer().then(({ EventBus, PDFFindController, PDFLinkService, PDFViewer, ScrollMode }) => {
      if (abort.signal.aborted) return;
      const eventBus = new EventBus();
      const linkService = new PDFLinkService({ eventBus });
      const findController = new PDFFindController({ eventBus, linkService });
      viewer = new PDFViewer({ container: host, viewer: viewerHost, eventBus, linkService, findController, abortSignal: abort.signal } as ViewerOptions);
      linkService.setViewer(viewer);
      const on = (name: string, listener: (event: never) => void) => eventBus.on(name, listener, { signal: abort.signal });
      on("pagesinit", () => {
        viewer!.scrollMode = ScrollMode.PAGE;
        viewer!.currentScaleValue = zoomValue(zoomRef.current);
      });
      on("pagechanging", ({ pageNumber }: { pageNumber: number }) => {
        setNumber(pageNumber);
        setPageInput(String(pageNumber));
      });
      on("scalechanging", ({ scale: next }: { scale: number }) => setScale(next));
      on("pagerendered", ({ pageNumber, error }: { pageNumber: number; error: Error | null }) => {
        setRenderErrors((current) => {
          if (!error && !current.has(pageNumber)) return current;
          const next = new Map(current);
          if (error) next.set(pageNumber, error.message || "The page could not be drawn.");
          else next.delete(pageNumber);
          return next;
        });
      });
      const onFindUpdate = ({ state, matchesCount }: { state?: number; matchesCount: { current: number; total: number } }) => {
        setFind((current) => {
          const status = state === undefined ? current.state
            : state === FIND_STATE.PENDING ? "pending" : state === FIND_STATE.NOT_FOUND ? "not-found" : "found";
          return { state: status, current: matchesCount.current, total: matchesCount.total };
        });
        const selected = findController.selected as { pageIdx: number; matchIdx: number } | undefined;
        if (selected && selected.pageIdx >= 0 && selected.matchIdx >= 0) void showExcerpt(selected.pageIdx + 1, findQuery.current).catch(() => setExcerpt(undefined));
      };
      on("updatefindcontrolstate", onFindUpdate);
      on("updatefindmatchescount", onFindUpdate);
      viewer.setDocument(pdf);
      linkService.setDocument(pdf);
      viewerRef.current = { viewer, eventBus };
    }).catch((reason: Error) => {
      if (!abort.signal.aborted) setViewerError(reason.message || "The PDF viewer could not be loaded.");
    });
    return () => {
      abort.abort();
      viewer?.setDocument(null as unknown as PDFDocumentProxy);
      viewerRef.current = undefined;
    };
  }, [pdf]);

  const showExcerpt = async (page: number, term: string) => {
    if (!term) return;
    let items = textCache.current.get(page);
    if (!items) {
      const content = await (await pdf.getPage(page)).getTextContent();
      items = content.items.flatMap((item) => "str" in item ? [item.str] : []);
      textCache.current.set(page, items);
    }
    const match = findPageTextMatch(items, term.toLocaleLowerCase());
    setExcerpt(match ? { page, text: match.excerpt } : undefined);
  };

  useEffect(() => {
    zoomRef.current = zoom;
    const current = viewerRef.current?.viewer;
    if (current?.pagesCount) current.currentScaleValue = zoomValue(zoom);
  }, [zoom]);

  const goTo = (target: number) => {
    const next = Math.max(1, Math.min(pdf.numPages, target));
    setPageInput(String(next));
    const current = viewerRef.current?.viewer;
    if (current?.pagesCount) current.currentPageNumber = next;
  };

  const dispatchFind = (type: "" | "again", findPrevious = false) => {
    findQuery.current = query.trim();
    viewerRef.current?.eventBus.dispatch("find", {
      source: null, type, query: findQuery.current, caseSensitive: false, entireWord: false,
      highlightAll: true, findPrevious, matchDiacritics: false,
    });
  };
  const clearFind = () => {
    setFind(IDLE_FIND);
    setExcerpt(undefined);
    viewerRef.current?.eventBus.dispatch("findbarclose", { source: null });
  };

  const retryPage = (page: number) => {
    const current = viewerRef.current?.viewer;
    const pageView = current?.getPageView(page - 1);
    if (!current || !pageView) return;
    setRenderErrors((errors) => { const next = new Map(errors); next.delete(page); return next; });
    pageView.reset();
    current.update();
  };

  useEffect(() => {
    const rail = thumbRail.current;
    if (!rail || !showThumbnails || pdf.numPages < 2) return;
    const top = (number - 1) * THUMB_HEIGHT;
    if (top < rail.scrollTop || top + THUMB_HEIGHT > rail.scrollTop + rail.clientHeight) rail.scrollTop = Math.max(0, top - THUMB_HEIGHT);
  }, [number, showThumbnails, pdf.numPages]);
  const start = Math.max(0, Math.floor(thumbScroll / THUMB_HEIGHT) - 3);
  const end = Math.min(pdf.numPages, Math.ceil((thumbScroll + thumbSize.height) / THUMB_HEIGHT) + 3);
  const failed = [...renderErrors.entries()].sort(([a], [b]) => a - b);

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
        {[50, 75, 100, 125, 150, 200, 400].map((value) => <option key={value} value={value}>{value}%</option>)}
      </select>
      <span className="pdf-zoom-readout">{Math.round(scale * 100)}%</span>
      <form className="pdf-search" onSubmit={(event) => { event.preventDefault(); if (query.trim()) dispatchFind(""); else clearFind(); }}>
        <input type="search" aria-label="Search PDF text" placeholder="Find in PDF" value={query} onChange={(event) => { setQuery(event.target.value); clearFind(); }} />
        <button className="btn" type="submit">Find</button>
      </form>
      {find.state === "pending" ? <span className="pdf-search-status" role="status">Searching…</span>
        : find.state === "not-found" ? <span className="pdf-search-status" role="status">No matches</span>
        : find.state === "found" && find.total > 0 ? <div className="pdf-match-control" role="status"><button className="btn" aria-label="Previous match" onClick={() => dispatchFind("again", true)}>‹</button><span>{find.current}/{find.total} matches</span><button className="btn" aria-label="Next match" onClick={() => dispatchFind("again")}>›</button></div>
        : null}
    </div>
    {excerpt && find.state === "found" && <div className="pdf-match-excerpt" data-testid="pdf-match-excerpt">Page {excerpt.page}: …{excerpt.text}…</div>}
    <div className="pdf-document-body">
      {showThumbnails && pdf.numPages > 1 && <aside className="pdf-thumbnails" ref={thumbRail} aria-label="Page thumbnails" onScroll={(event) => setThumbScroll(event.currentTarget.scrollTop)}>
        <div style={{ height: pdf.numPages * THUMB_HEIGHT, position: "relative" }}>
          {Array.from({ length: Math.max(0, end - start) }, (_, index) => start + index + 1).map((item) => <div key={item} className="pdf-thumb-slot" style={{ top: (item - 1) * THUMB_HEIGHT }}><Thumbnail pdf={pdf} number={item} selected={number === item} select={goTo} /></div>)}
        </div>
      </aside>}
      <div className="pdf-page-stage-frame">
        <div className="pdf-page-stage" ref={container} data-testid="pdf-frame" aria-label={`PDF page ${number} of ${pdf.numPages}`}>
          <div className="pdfViewer" ref={viewerElement} />
        </div>
        {viewerError && <div className="pdf-canvas-error" role="alert">Could not open the PDF viewer: {viewerError}</div>}
        {failed.length > 0 && <div className="pdf-render-errors" role="alert" data-testid="pdf-render-error">
          {failed.map(([page, message]) => <div key={page}>Could not draw page {page}: {message} <button className="btn" type="button" onClick={() => retryPage(page)}>Retry drawing</button></div>)}
        </div>}
      </div>
    </div>
  </div>;
}
