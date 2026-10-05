/**
 * Interactivity for a rendered HTML report inside the viewer's frame: contents from bookmarks, find-in-report,
 * click-to-sort table headers and drill-through links. The report itself contains no scripts; the viewer attaches
 * these behaviours from outside, so the frame can stay sandboxed without script permission.
 */

export interface ContentsEntry {
  title: string;
  level: number;
  target: Element;
}

export interface SortState {
  component: string;
  column: string;
  direction: "asc" | "desc";
}

export interface DrillTarget {
  report: string;
  parameters: Record<string, unknown>;
}

/** Bookmarked elements, in reading order, for a contents sidebar. */
export function contentsOf(doc: Document): ContentsEntry[] {
  return [...doc.querySelectorAll<HTMLElement>("[data-bookmark]")].map((element) => ({
    title: element.dataset.bookmark ?? "",
    level: Number(element.dataset.bookmarkLevel) || 1,
    target: element,
  }));
}

const HIT = "or-hit";
const CURRENT = "or-hit-current";

/** Removes earlier highlights and joins the text nodes they split. */
export function clearHighlights(doc: Document): void {
  for (const mark of [...doc.querySelectorAll(`mark.${HIT}`)]) {
    const parent = mark.parentNode;
    if (!parent) continue;
    parent.replaceChild(doc.createTextNode(mark.textContent ?? ""), mark);
    parent.normalize();
  }
}

/** Highlights every case-insensitive match of `query`; returns the highlight elements in reading order. */
export function highlight(doc: Document, query: string): HTMLElement[] {
  clearHighlights(doc);
  const needle = query.trim().toLowerCase();
  if (!needle || !doc.body) return [];
  ensureHighlightStyles(doc);
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.nodeValue && node.nodeValue.toLowerCase().includes(needle) && !(node.parentElement?.closest("style, script")) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  const hits: HTMLElement[] = [];
  for (const node of nodes) {
    let current: Text = node;
    let index = current.nodeValue!.toLowerCase().indexOf(needle);
    while (index >= 0) {
      const match = current.splitText(index);
      current = match.splitText(needle.length);
      const mark = doc.createElement("mark");
      mark.className = HIT;
      match.parentNode!.replaceChild(mark, match);
      mark.appendChild(match);
      hits.push(mark);
      index = current.nodeValue!.toLowerCase().indexOf(needle);
    }
  }
  return hits;
}

export function focusHit(hits: HTMLElement[], index: number): void {
  hits.forEach((hit, i) => hit.classList.toggle(CURRENT, i === index));
  hits[index]?.scrollIntoView({ block: "center", inline: "nearest" });
}

function ensureHighlightStyles(doc: Document): void {
  if (doc.getElementById("or-viewer-styles")) return;
  const style = doc.createElement("style");
  style.id = "or-viewer-styles";
  style.textContent = `mark.${HIT}{background:#fde68a;color:inherit;padding:0;border-radius:2px}mark.${CURRENT}{background:#f59e0b;outline:2px solid #f59e0b}`
    + `th[data-sortable]{cursor:pointer;user-select:none}th[data-sortable]:hover{background:rgba(37,99,235,.08)}th[data-sortable] .or-sort{margin-left:4px;font-size:.8em;opacity:.7}`;
  doc.head?.append(style);
}

/** Makes table headers that name a column clickable; shows ▲/▼ on the active sort. */
export function enableSorting(doc: Document, sort: SortState | undefined, onSort: (next: SortState) => void): void {
  ensureHighlightStyles(doc);
  for (const table of doc.querySelectorAll<HTMLTableElement>("table[data-component]")) {
    const component = table.dataset.component!;
    for (const header of table.querySelectorAll<HTMLTableCellElement>("th[data-column]")) {
      const column = header.dataset.column!;
      const active = sort?.component === component && sort.column === column ? sort.direction : undefined;
      header.dataset.sortable = "";
      header.setAttribute("aria-sort", active === "asc" ? "ascending" : active === "desc" ? "descending" : "none");
      header.title = "Sort by this column";
      if (active) {
        const arrow = doc.createElement("span");
        arrow.className = "or-sort";
        arrow.textContent = active === "asc" ? "▲" : "▼";
        header.append(arrow);
      }
      header.addEventListener("click", () => onSort({ component, column, direction: active === "asc" ? "desc" : "asc" }));
    }
  }
}

/** Opens drill-through links through the viewer instead of letting the frame navigate. */
export function enableDrillThrough(doc: Document, onDrill: (target: DrillTarget) => void): void {
  doc.addEventListener("click", (event) => {
    const link = (event.target as Element | null)?.closest?.("a[data-report]") as HTMLAnchorElement | null;
    if (!link) return;
    event.preventDefault();
    let parameters: Record<string, unknown> = {};
    try {
      parameters = JSON.parse(link.dataset.parameters ?? "{}") as Record<string, unknown>;
    } catch {
      // Malformed parameters: open the report with its defaults.
    }
    onDrill({ report: link.dataset.report!, parameters });
  });
}

/** Expand/collapse buttons on drill-down group headers. */
export function enableDrillDown(doc: Document, onToggle: (component: string, key: string) => void): void {
  for (const button of doc.querySelectorAll<HTMLButtonElement>("button.or-toggle[data-group]")) {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      onToggle(button.dataset.group!, button.dataset.key ?? "");
    });
  }
}
