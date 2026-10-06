import { createDesigner, type Designer } from "./designer.js";
import { createViewer, type Viewer } from "./viewer.js";
import type { OutputFormat } from "./client.js";

export { createViewer, type Viewer, type ViewerOptions } from "./viewer.js";
export { createDesigner, type Designer, type DesignerOptions } from "./designer.js";
export { fetchTemplateVersion, renderReport, renderTemplate, ReportServerError, type OutputFormat, type RenderReportRequest, type ServerOptions, type ViewerState } from "./client.js";
export { PROTOCOL, isEmbedMessage, type DesignerToHost, type HostToDesigner } from "./protocol.js";
export { contentsOf, highlight, clearHighlights, type ContentsEntry, type DrillTarget, type SortState } from "./interactive.js";

const parseJson = (value: string | null): Record<string, unknown> | undefined => {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return undefined;
  }
};

/**
 * <open-report-viewer server="https://reports.example.com" template="invoice" parameters='{"id": 42}'
 *                     downloads="pdf,xlsx" api-key="…"></open-report-viewer>
 */
export class OpenReportViewer extends HTMLElement {
  static observedAttributes = ["server", "template", "report", "version", "parameters", "data", "downloads", "api-key", "hide-parameters"];
  #viewer?: Viewer;
  #scheduled = false;
  #report?: unknown;
  #data?: Record<string, unknown>;

  constructor() {
    super();
    this.#upgradeProperty("report");
    this.#upgradeProperty("data");
  }

  #upgradeProperty(name: "report" | "data") {
    if (!Object.prototype.hasOwnProperty.call(this, name)) return;
    const value = (this as unknown as Record<string, unknown>)[name];
    delete (this as unknown as Record<string, unknown>)[name];
    (this as unknown as Record<string, unknown>)[name] = value;
  }

  get report(): unknown { return this.#report; }
  set report(value: unknown) {
    this.#report = value;
    if (this.isConnected) this.#schedule();
  }

  get data(): Record<string, unknown> | undefined { return this.#data; }
  set data(value: Record<string, unknown> | undefined) {
    this.#data = value;
    if (this.isConnected) this.#schedule();
  }

  get viewer(): Viewer | undefined {
    return this.#viewer;
  }

  connectedCallback() {
    this.#schedule();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.#schedule();
  }

  disconnectedCallback() {
    this.#viewer?.destroy();
    this.#viewer = undefined;
  }

  /** Attribute changes arrive one by one; rebuild once after the batch. */
  #schedule() {
    if (this.#scheduled) return;
    this.#scheduled = true;
    queueMicrotask(() => {
      this.#scheduled = false;
      const server = this.getAttribute("server") ?? location.origin;
      const template = this.getAttribute("template");
      const report = this.report ?? parseJson(this.getAttribute("report"));
      if (!template && report === undefined) return;
      this.#viewer?.destroy();
      const version = this.getAttribute("version");
      this.#viewer = createViewer(this, {
        server,
        template: template ?? undefined,
        report,
        apiKey: this.getAttribute("api-key") ?? undefined,
        version: version ? Number(version) : undefined,
        parameters: parseJson(this.getAttribute("parameters")),
        data: this.data ?? parseJson(this.getAttribute("data")),
        downloads: this.getAttribute("downloads")?.split(",").map((format) => format.trim()).filter(Boolean) as OutputFormat[] | undefined,
        hideParameters: this.hasAttribute("hide-parameters"),
      });
    });
  }
}

/** <open-report-designer server="https://reports.example.com" template="invoice" height="800px"></open-report-designer> */
export class OpenReportDesigner extends HTMLElement {
  #designer?: Designer;
  #definition?: unknown;
  #saveDefinition?: (definition: unknown) => void | Promise<void>;

  constructor() {
    super();
    this.#upgradeProperty("definition");
    this.#upgradeProperty("onSaveDefinition");
  }

  #upgradeProperty(name: "definition" | "onSaveDefinition") {
    if (!Object.prototype.hasOwnProperty.call(this, name)) return;
    const value = (this as unknown as Record<string, unknown>)[name];
    delete (this as unknown as Record<string, unknown>)[name];
    (this as unknown as Record<string, unknown>)[name] = value;
  }
  /** Assign before connecting, or use `element.designer.load(definition)` after ready. */
  get definition(): unknown { return this.#definition; }
  set definition(value: unknown) { this.#definition = value; }
  /** Required for host-owned persistence; resolve only after the host has stored the definition. */
  get onSaveDefinition(): ((definition: unknown) => void | Promise<void>) | undefined { return this.#saveDefinition; }
  set onSaveDefinition(value: ((definition: unknown) => void | Promise<void>) | undefined) { this.#saveDefinition = value; }

  get designer(): Designer | undefined {
    return this.#designer;
  }

  connectedCallback() {
    this.#designer = createDesigner(this, {
      server: this.getAttribute("server") ?? location.origin,
      template: this.getAttribute("template") ?? undefined,
      definition: this.definition,
      saveMode: (this.getAttribute("save-mode") as "server" | "host" | null) ?? (this.onSaveDefinition ? "host" : "server"),
      onSaveDefinition: this.onSaveDefinition,
      apiKey: this.getAttribute("api-key") ?? undefined,
      height: this.getAttribute("height") ?? undefined,
    });
  }

  disconnectedCallback() {
    this.#designer?.destroy();
    this.#designer = undefined;
  }
}

if (typeof customElements !== "undefined") {
  if (!customElements.get("open-report-viewer")) customElements.define("open-report-viewer", OpenReportViewer);
  if (!customElements.get("open-report-designer")) customElements.define("open-report-designer", OpenReportDesigner);
}
