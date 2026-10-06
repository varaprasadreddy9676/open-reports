import { fetchTemplateVersion, renderReport, renderTemplate, type OutputFormat, type ServerOptions } from "./client.js";
import { coerceParameter, initialParameters, type ParameterDefinition } from "./params.js";
import { contentsOf, enableDrillDown, enableDrillThrough, enableSorting, focusHit, highlight, type DrillTarget, type SortState } from "./interactive.js";
import { VIEWER_STYLES } from "./styles.js";

export interface ViewerOptions extends ServerOptions {
  /** Optional template id on the server. Provide either this or `report`. */
  template?: string;
  /** Host-owned report definition. It is sent inline for each render and is not looked up by id. */
  report?: unknown;
  /** A specific version; defaults to the latest published version. */
  version?: number;
  /** Initial parameter values; the viewer shows a form for the report's parameters. */
  parameters?: Record<string, unknown>;
  /** Data to render with instead of the report's own data sources. */
  data?: Record<string, unknown>;
  /** Download buttons to offer. Default: PDF, Excel and CSV. */
  downloads?: OutputFormat[];
  /** Hide the parameter form even when the report has parameters. */
  hideParameters?: boolean;
}

export interface Viewer {
  /** Re-render, optionally with new parameter values. */
  refresh(parameters?: Record<string, unknown>): Promise<void>;
  download(format: OutputFormat): Promise<void>;
  print(): void;
  /** Open another report in this viewer (what a drill-through link does); Back returns. */
  drill(target: DrillTarget): Promise<void>;
  back(): Promise<void>;
  readonly parameters: Record<string, unknown>;
  /** The template currently shown (changes on drill-through). */
  readonly template: string;
  destroy(): void;
}

/** One report shown in the viewer; drilling through pushes a new one. */
interface Place {
  template: string;
  report?: unknown;
  version?: number;
  title: string;
  definitions: ParameterDefinition[];
  values: Record<string, unknown>;
  sort?: SortState;
  /** Drill-down groups flipped from their initial state, by group component id. */
  toggled: Map<string, Set<string>>;
}

const LABELS: Record<OutputFormat, string> = { pdf: "PDF", html: "HTML", xlsx: "Excel", csv: "CSV", docx: "Word", zpl: "ZPL", escpos: "ESC/POS" };
const EXTENSIONS: Record<OutputFormat, string> = { pdf: "pdf", html: "html", xlsx: "xlsx", csv: "csv", docx: "docx", zpl: "zpl", escpos: "bin" };

function element<K extends keyof HTMLElementTagNameMap>(tag: K, attributes: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function field(definition: ParameterDefinition, value: unknown): HTMLElement {
  const id = `p-${definition.id}`;
  const wrap = element("label", { class: "param", for: id });
  wrap.append(element("span", {}, `${definition.label ?? definition.id}${definition.required ? " *" : ""}`));
  let input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  if (definition.type === "enum" && definition.enumValues?.length) {
    input = element("select", { id, name: definition.id });
    if (!definition.required) input.append(element("option", { value: "" }, "—"));
    for (const option of definition.enumValues) input.append(element("option", { value: String(option) }, String(option)));
    input.value = value === undefined ? "" : String(value);
  } else if (definition.type === "array" || definition.type === "object") {
    input = element("textarea", { id, name: definition.id, rows: "2", spellcheck: "false" });
    input.value = value === undefined ? "" : JSON.stringify(value);
  } else {
    const type = definition.type === "number" ? "number" : definition.type === "date" ? "date" : definition.type === "datetime" ? "datetime-local" : definition.type === "boolean" ? "checkbox" : "text";
    input = element("input", { id, name: definition.id, type });
    if (type === "checkbox") (input as HTMLInputElement).checked = value === true;
    else input.value = value === undefined ? "" : String(value);
  }
  if (definition.required) input.setAttribute("required", "");
  wrap.append(input);
  return wrap;
}

function readForm(form: HTMLFormElement, definitions: ParameterDefinition[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const definition of definitions) {
    const input = form.elements.namedItem(definition.id) as HTMLInputElement | null;
    if (!input) continue;
    const raw = input.type === "checkbox" ? String(input.checked) : input.value;
    const value = coerceParameter(definition, raw);
    if (value !== undefined) values[definition.id] = value;
  }
  return values;
}

/**
 * Renders a published report inside `host` with a parameter form, Refresh, Print, Download, find-in-report,
 * a contents sidebar from the report's bookmarks, click-to-sort table headers and drill-through links.
 * Everything lives in a shadow root, so the host page's CSS cannot break it and it cannot break the page.
 * Emits `report-rendered`, `report-drill` and `report-error` events on `host`.
 */
export function createViewer(host: HTMLElement, options: ViewerOptions): Viewer {
  if (!options.template && options.report === undefined) throw new Error('Provide either a saved "template" id or an inline host-owned "report" definition.');
  const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  root.replaceChildren();
  const style = element("style");
  style.textContent = VIEWER_STYLES;
  const shell = element("div", { class: "viewer", part: "viewer" });

  const crumbs = element("nav", { class: "crumbs", "aria-label": "Report trail", hidden: "" });
  const backButton = element("button", { type: "button", class: "back" }, "← Back");
  const trail = element("span", { class: "trail" });
  crumbs.append(backButton, trail);

  const form = element("form", { class: "toolbar", part: "toolbar", "aria-label": "Report parameters" });
  const fields = element("div", { class: "params" });
  const actions = element("div", { class: "actions" });
  const run = element("button", { type: "submit", class: "primary" }, "Refresh");
  const print = element("button", { type: "button" }, "Print");
  actions.append(run, print);
  for (const format of options.downloads ?? ["pdf", "xlsx", "csv"]) {
    const button = element("button", { type: "button", "data-format": format }, `↓ ${LABELS[format]}`);
    button.addEventListener("click", () => void viewer.download(format));
    actions.append(button);
  }
  form.append(fields, actions);

  const tools = element("div", { class: "tools" });
  const contentsButton = element("button", { type: "button", class: "contents-toggle", "aria-expanded": "false", hidden: "" }, "☰ Contents");
  const find = element("div", { class: "find", role: "search" });
  const query = element("input", { type: "search", placeholder: "Find in report", "aria-label": "Find in report" });
  const previous = element("button", { type: "button", "aria-label": "Previous match" }, "‹");
  const next = element("button", { type: "button", "aria-label": "Next match" }, "›");
  const count = element("span", { class: "count", "aria-live": "polite" });
  find.append(query, previous, next, count);
  tools.append(contentsButton, find);

  const status = element("div", { class: "status", role: "status", "aria-live": "polite" });
  const body = element("div", { class: "body" });
  const contents = element("aside", { class: "contents", "aria-label": "Contents", hidden: "" });
  // allow-same-origin lets the viewer read and decorate the report; no allow-scripts, so the report runs no code.
  const frame = element("iframe", { class: "page", part: "page", title: "Report", sandbox: "allow-same-origin allow-modals allow-popups allow-popups-to-escape-sandbox" });
  body.append(contents, frame);
  shell.append(crumbs, form, tools, status, body);
  root.append(style, shell);

  const history: Place[] = [];
  const initialReport = options.report && typeof options.report === "object" ? options.report as { id?: unknown; name?: unknown; parameters?: ParameterDefinition[] } : undefined;
  const initialId = options.template ?? (typeof initialReport?.id === "string" ? initialReport.id : "report");
  let place: Place = { template: initialId, report: options.report, version: options.version, title: typeof initialReport?.name === "string" ? initialReport.name : initialId, definitions: [], values: { ...(options.parameters ?? {}) }, toggled: new Map() };
  const viewerState = () => {
    const toggle = [...place.toggled].filter(([, keys]) => keys.size).map(([component, keys]) => ({ component, keys: [...keys] }));
    return place.sort || toggle.length ? { ...(place.sort ? { sort: [place.sort] } : {}), ...(toggle.length ? { toggle } : {}) } : undefined;
  };
  let hits: HTMLElement[] = [];
  let hitIndex = -1;
  let destroyed = false;
  let renderCount = 0;

  const setStatus = (text: string, kind: "busy" | "error" | "" = "") => {
    status.textContent = text;
    status.dataset.kind = kind;
  };
  const fail = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, "error");
    host.dispatchEvent(new CustomEvent("report-error", { detail: { message }, bubbles: true, composed: true }));
  };

  const showParameters = () => {
    fields.replaceChildren();
    if (!options.hideParameters) for (const definition of place.definitions) fields.append(field(definition, place.values[definition.id]));
  };
  const showTrail = () => {
    crumbs.hidden = history.length === 0;
    trail.textContent = [...history, place].map((entry) => entry.title).join(" › ");
  };

  /** Loads a template's parameters into `place`. */
  const load = async (target: Place) => {
    if (target.report !== undefined) {
      const definition = target.report && typeof target.report === "object" ? target.report as { name?: unknown; parameters?: ParameterDefinition[] } : undefined;
      target.title = typeof definition?.name === "string" ? definition.name : target.template;
      target.definitions = definition?.parameters ?? [];
      target.values = initialParameters(target.definitions, target.values);
      return;
    }
    const loaded = await fetchTemplateVersion(options, target.template, target.version);
    target.version = loaded.version;
    target.title = loaded.definition.name ?? target.template;
    target.definitions = loaded.definition.parameters ?? [];
    target.values = initialParameters(target.definitions, target.values);
  };

  const runSearch = () => {
    const doc = frame.contentDocument;
    if (!doc) return;
    hits = highlight(doc, query.value);
    hitIndex = hits.length ? 0 : -1;
    focusHit(hits, hitIndex);
    count.textContent = query.value.trim() ? (hits.length ? `1 of ${hits.length}` : "No matches") : "";
  };
  const step = (direction: 1 | -1) => {
    if (!hits.length) return runSearch();
    hitIndex = (hitIndex + direction + hits.length) % hits.length;
    focusHit(hits, hitIndex);
    count.textContent = `${hitIndex + 1} of ${hits.length}`;
  };

  const showContents = (doc: Document) => {
    const entries = contentsOf(doc);
    contentsButton.hidden = entries.length === 0;
    contents.replaceChildren(...entries.map((entry) => {
      const item = element("button", { type: "button", class: `entry level-${entry.level}` }, entry.title);
      item.addEventListener("click", () => entry.target.scrollIntoView({ block: "start" }));
      return item;
    }));
    if (!entries.length) {
      contents.hidden = true;
      contentsButton.setAttribute("aria-expanded", "false");
    }
  };

  /** Called once the rendered HTML has loaded in the frame. */
  const decorate = () => {
    const doc = frame.contentDocument;
    if (!doc) return;
    showContents(doc);
    enableSorting(doc, place.sort, (sort) => {
      place.sort = sort;
      void viewer.refresh();
    });
    enableDrillThrough(doc, (target) => void viewer.drill(target));
    enableDrillDown(doc, (component, key) => {
      const keys = place.toggled.get(component) ?? new Set<string>();
      if (keys.has(key)) keys.delete(key);
      else keys.add(key);
      place.toggled.set(component, keys);
      void viewer.refresh();
    });
    if (query.value.trim()) runSearch();
  };
  frame.addEventListener("load", decorate);

  const viewer: Viewer = {
    get parameters() {
      return { ...place.values };
    },
    get template() {
      return place.template;
    },
    async refresh(nextValues) {
      const ticket = ++renderCount;
      try {
        await ready;
        if (nextValues) place.values = { ...place.values, ...nextValues };
        else if (!options.hideParameters) place.values = { ...place.values, ...readForm(form, place.definitions) };
        setStatus("Rendering…", "busy");
        const requestData = history.length ? undefined : options.data;
        const state = viewerState();
        const blob = place.report !== undefined
          ? await renderReport(options, { report: place.report, format: "html", parameters: place.values, data: requestData, viewerState: state })
          : await renderTemplate(options, { template: place.template, version: place.version, format: "html", parameters: place.values, data: requestData, viewerState: state });
        const html = await blob.text();
        if (destroyed || ticket !== renderCount) return;
        frame.srcdoc = html;
        setStatus("");
        host.dispatchEvent(new CustomEvent("report-rendered", { detail: { template: place.template, parameters: { ...place.values }, version: place.version, sort: place.sort }, bubbles: true, composed: true }));
      } catch (error) {
        fail(error);
      }
    },
    async download(format) {
      try {
        await ready;
        setStatus(`Preparing ${LABELS[format]}…`, "busy");
        const requestData = history.length ? undefined : options.data;
        const state = viewerState();
        const blob = place.report !== undefined
          ? await renderReport(options, { report: place.report, format, parameters: place.values, data: requestData, viewerState: state })
          : await renderTemplate(options, { template: place.template, version: place.version, format, parameters: place.values, data: requestData, viewerState: state });
        const link = element("a", { href: URL.createObjectURL(blob), download: `${place.template}.${EXTENSIONS[format]}` });
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
        setStatus("");
      } catch (error) {
        fail(error);
      }
    },
    print() {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    },
    async drill(target) {
      try {
        const next: Place = { template: target.report, title: target.report, definitions: [], values: { ...target.parameters }, toggled: new Map() };
        setStatus("Opening…", "busy");
        await load(next);
        history.push(place);
        place = next;
        showParameters();
        showTrail();
        host.dispatchEvent(new CustomEvent("report-drill", { detail: { template: place.template, parameters: { ...place.values } }, bubbles: true, composed: true }));
        await viewer.refresh(place.values);
      } catch (error) {
        fail(error);
      }
    },
    async back() {
      const previousPlace = history.pop();
      if (!previousPlace) return;
      place = previousPlace;
      showParameters();
      showTrail();
      await viewer.refresh(place.values);
    },
    destroy() {
      destroyed = true;
      root.replaceChildren();
    },
  };

  const ready = (async () => {
    await load(place);
    showParameters();
    showTrail();
  })();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void viewer.refresh();
  });
  print.addEventListener("click", () => viewer.print());
  backButton.addEventListener("click", () => void viewer.back());
  contentsButton.addEventListener("click", () => {
    contents.hidden = !contents.hidden;
    contentsButton.setAttribute("aria-expanded", String(!contents.hidden));
  });
  query.addEventListener("input", runSearch);
  query.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    step(event.shiftKey ? -1 : 1);
  });
  previous.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));
  ready.then(() => viewer.refresh(), fail);
  return viewer;
}
