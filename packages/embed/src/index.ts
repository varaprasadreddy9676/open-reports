import { createDesigner, type Designer } from "./designer.js";
import { createViewer, type Viewer } from "./viewer.js";
import type { OutputFormat } from "./client.js";

export { createViewer, type Viewer, type ViewerOptions } from "./viewer.js";
export { createDesigner, type Designer, type DesignerOptions } from "./designer.js";
export { fetchTemplateVersion, renderTemplate, ReportServerError, type OutputFormat, type ServerOptions } from "./client.js";
export { PROTOCOL, isEmbedMessage, type DesignerToHost, type HostToDesigner } from "./protocol.js";

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
  static observedAttributes = ["server", "template", "version", "parameters", "downloads", "api-key", "hide-parameters"];
  #viewer?: Viewer;
  #scheduled = false;

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
      if (!template) return;
      this.#viewer?.destroy();
      const version = this.getAttribute("version");
      this.#viewer = createViewer(this, {
        server,
        template,
        apiKey: this.getAttribute("api-key") ?? undefined,
        version: version ? Number(version) : undefined,
        parameters: parseJson(this.getAttribute("parameters")),
        downloads: this.getAttribute("downloads")?.split(",").map((format) => format.trim()).filter(Boolean) as OutputFormat[] | undefined,
        hideParameters: this.hasAttribute("hide-parameters"),
      });
    });
  }
}

/** <open-report-designer server="https://reports.example.com" template="invoice" height="800px"></open-report-designer> */
export class OpenReportDesigner extends HTMLElement {
  #designer?: Designer;

  get designer(): Designer | undefined {
    return this.#designer;
  }

  connectedCallback() {
    this.#designer = createDesigner(this, {
      server: this.getAttribute("server") ?? location.origin,
      template: this.getAttribute("template") ?? undefined,
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
