import { fetchTemplateVersion, renderTemplate, type OutputFormat, type ServerOptions } from "./client.js";
import { coerceParameter, initialParameters, type ParameterDefinition } from "./params.js";
import { VIEWER_STYLES } from "./styles.js";

export interface ViewerOptions extends ServerOptions {
  /** Template id on the server. */
  template: string;
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
  readonly parameters: Record<string, unknown>;
  destroy(): void;
}

const LABELS: Record<OutputFormat, string> = { pdf: "PDF", html: "HTML", xlsx: "Excel", csv: "CSV", zpl: "ZPL", escpos: "ESC/POS" };
const EXTENSIONS: Record<OutputFormat, string> = { pdf: "pdf", html: "html", xlsx: "xlsx", csv: "csv", zpl: "zpl", escpos: "bin" };

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
 * Renders a published report inside `host` with a parameter form, Refresh, Print and Download buttons.
 * Everything lives in a shadow root, so the host page's CSS cannot break it and it cannot break the page.
 * Emits `report-rendered` and `report-error` events on `host`.
 */
export function createViewer(host: HTMLElement, options: ViewerOptions): Viewer {
  const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  root.replaceChildren();
  const style = element("style");
  style.textContent = VIEWER_STYLES;
  const shell = element("div", { class: "viewer", part: "viewer" });
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
  const status = element("div", { class: "status", role: "status", "aria-live": "polite" });
  const frame = element("iframe", { class: "page", part: "page", title: "Report", sandbox: "allow-same-origin allow-modals" });
  form.append(fields, actions);
  shell.append(form, status, frame);
  root.append(style, shell);

  let definitions: ParameterDefinition[] = [];
  let version = options.version;
  let values: Record<string, unknown> = { ...(options.parameters ?? {}) };
  let destroyed = false;

  const setStatus = (text: string, kind: "busy" | "error" | "" = "") => {
    status.textContent = text;
    status.dataset.kind = kind;
  };
  const fail = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(message, "error");
    host.dispatchEvent(new CustomEvent("report-error", { detail: { message }, bubbles: true, composed: true }));
  };

  const ready = (async () => {
    const loaded = await fetchTemplateVersion(options, options.template, options.version);
    version = loaded.version;
    definitions = loaded.definition.parameters ?? [];
    values = initialParameters(definitions, options.parameters);
    if (!options.hideParameters) for (const definition of definitions) fields.append(field(definition, values[definition.id]));
  })();

  const viewer: Viewer = {
    get parameters() {
      return { ...values };
    },
    async refresh(next) {
      try {
        await ready;
        if (next) values = { ...values, ...next };
        else if (!options.hideParameters) values = { ...values, ...readForm(form, definitions) };
        setStatus("Rendering…", "busy");
        const html = await (await renderTemplate(options, { template: options.template, version, format: "html", parameters: values, data: options.data })).text();
        if (destroyed) return;
        frame.srcdoc = html;
        setStatus("");
        host.dispatchEvent(new CustomEvent("report-rendered", { detail: { parameters: { ...values }, version }, bubbles: true, composed: true }));
      } catch (error) {
        fail(error);
      }
    },
    async download(format) {
      try {
        await ready;
        setStatus(`Preparing ${LABELS[format]}…`, "busy");
        const blob = await renderTemplate(options, { template: options.template, version, format, parameters: values, data: options.data });
        const link = element("a", { href: URL.createObjectURL(blob), download: `${options.template}.${EXTENSIONS[format]}` });
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
    destroy() {
      destroyed = true;
      root.replaceChildren();
    },
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void viewer.refresh();
  });
  print.addEventListener("click", () => viewer.print());
  ready.then(() => viewer.refresh(), fail);
  return viewer;
}
